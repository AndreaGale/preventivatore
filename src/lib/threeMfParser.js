import JSZip from 'jszip';

/**
 * Parsa un file .3mf ed estrae i piatti con i loro oggetti/componenti.
 *
 * Ritorna:
 * {
 *   slicer: string,
 *   fileName: string,
 *   plates: [
 *     {
 *       plate_idx: number,
 *       print_time_min: number | null,
 *       objects: [
 *         {
 *           name: string,
 *           filament_type: string,       // es. "PLA", "PETG"
 *           filament_color: string,      // es. "#FF0000"
 *           weight_g: number | null,
 *           has_support: boolean,
 *           support_weight_g: number | null,
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export async function parse3MF(file) {
  const zip = await JSZip.loadAsync(file);
  const fileNames = Object.keys(zip.files);

  const result = {
    slicer: 'unknown',
    fileName: file.name.replace(/\.3mf$/i, ''),
    plates: [],
  };

  // ─── Leggi tutti i file di metadati rilevanti ────────────────────────────────
  const readXml = async (path) => {
    const content = await zip.files[path].async('string');
    const parser = new DOMParser();
    return parser.parseFromString(content, 'application/xml');
  };

  // ─── 1. BAMBU STUDIO / ORCA SLICER ──────────────────────────────────────────
  // slice_info.config → per piatto: tempo, filamenti usati per oggetto
  // model_settings.config → nomi oggetti, assegnazione filamento, supporti
  const sliceInfoPath = fileNames.find(f => /metadata\/slice_info\.config$/i.test(f));
  const modelSettingsPath = fileNames.find(f => /metadata\/model_settings\.config$/i.test(f));
  const modelPath = fileNames.find(f => /3d\/3dmodel\.model$/i.test(f) || /3dmodel\.model$/i.test(f));

  if (sliceInfoPath) {
    const doc = await readXml(sliceInfoPath);

    // Rileva slicer dal root
    const root = doc.documentElement;
    const slicerAttr = root.getAttribute('slicer') || root.getAttribute('slicersoftware') || '';
    if (slicerAttr.toLowerCase().includes('bambu')) result.slicer = 'Bambu Studio';
    else if (slicerAttr.toLowerCase().includes('orca')) result.slicer = 'OrcaSlicer';

    // Filamenti globali (per tipo e colore)
    const globalFilaments = [];
    doc.querySelectorAll('filament').forEach(el => {
      const id = parseInt(el.getAttribute('id') || '0');
      const type = el.getAttribute('type') || el.getAttribute('filament_type') || '';
      const color = el.getAttribute('color') || '';
      globalFilaments[id] = { type, color };
    });

    // Ogni piatto
    doc.querySelectorAll('plate').forEach(plateEl => {
      const idx = parseInt(plateEl.getAttribute('index') || plateEl.getAttribute('id') || '0');

      // Tempo di stampa del piatto
      const ptEl = plateEl.querySelector('print_time');
      const print_time_min = ptEl ? parseTimeToMinutes(ptEl.getAttribute('value') || ptEl.textContent) : null;

      // Oggetti sul piatto
      const objects = [];
      plateEl.querySelectorAll('object').forEach(objEl => {
        const objId = objEl.getAttribute('id') || objEl.getAttribute('identify_id') || '';
        const name = objEl.getAttribute('name') || `Oggetto ${objId}`;
        const filamentId = parseInt(objEl.getAttribute('filament_id') || objEl.getAttribute('extruder') || '0');
        const usedG = parseFloat(objEl.getAttribute('used_g') || objEl.getAttribute('weight') || '0');
        const supportG = parseFloat(objEl.getAttribute('support_used_g') || '0');
        const hasSupport = objEl.getAttribute('support_used') === '1' || supportG > 0;

        const filamentInfo = globalFilaments[filamentId] || {};
        objects.push({
          id: objId,
          name,
          filament_type: filamentInfo.type || '',
          filament_color: filamentInfo.color || '',
          weight_g: usedG > 0 ? usedG : null,
          has_support: hasSupport,
          support_weight_g: supportG > 0 ? supportG : null,
        });
      });

      // Fallback: se il piatto non ha oggetti, leggi i filamenti usati sul piatto
      if (objects.length === 0) {
        plateEl.querySelectorAll('filament').forEach(fil => {
          const usedG = parseFloat(fil.getAttribute('used_g') || '0');
          const type = fil.getAttribute('type') || '';
          const color = fil.getAttribute('color') || '';
          const id = fil.getAttribute('id') || '';
          if (usedG > 0) {
            objects.push({
              id,
              name: type || `Materiale ${id}`,
              filament_type: type,
              filament_color: color,
              weight_g: usedG,
              has_support: false,
              support_weight_g: null,
            });
          }
        });
      }

      result.plates.push({ plate_idx: idx, print_time_min, objects });
    });
  }

  // ─── 2. model_settings.config → arricchisce nomi e supporti ─────────────────
  if (modelSettingsPath) {
    const doc = await readXml(modelSettingsPath);
    const objSettings = {};
    doc.querySelectorAll('object').forEach(el => {
      const id = el.getAttribute('id') || el.getAttribute('identify_id') || '';
      const name = el.getAttribute('name') || '';
      const hasSupport = el.getAttribute('support_enabled') === '1' || el.getAttribute('enable_support') === '1';
      objSettings[id] = { name, hasSupport };
    });

    // Aggiorna i piatti con i dati dei nomi/supporti
    result.plates.forEach(plate => {
      plate.objects.forEach(obj => {
        const s = objSettings[obj.id];
        if (s) {
          if (s.name && !obj.name.startsWith('Oggetto')) obj.name = s.name;
          if (s.hasSupport) obj.has_support = true;
        }
      });
    });
  }

  // ─── 3. 3dmodel.model → fallback per nomi oggetti ────────────────────────────
  if (modelPath && result.plates.some(p => p.objects.some(o => !o.name || o.name.startsWith('Oggetto')))) {
    const doc = await readXml(modelPath);
    const objectNames = {};
    doc.querySelectorAll('object').forEach(el => {
      const id = el.getAttribute('id') || '';
      const name = el.getAttribute('name') || el.querySelector('metadata[name="name"]')?.getAttribute('value') || '';
      if (name) objectNames[id] = name;
    });

    result.plates.forEach(plate => {
      plate.objects.forEach(obj => {
        if (objectNames[obj.id] && (!obj.name || obj.name.startsWith('Oggetto'))) {
          obj.name = objectNames[obj.id];
        }
      });
    });
  }

  // ─── 4. PRUSASLICER fallback ─────────────────────────────────────────────────
  if (result.plates.length === 0) {
    const prusaPath = fileNames.find(f =>
      f.toLowerCase().includes('slic3r_pe') ||
      f.toLowerCase().includes('prusaslicer') ||
      (f.toLowerCase().includes('metadata') && f.endsWith('.config') && !f.includes('slice_info') && !f.includes('model_settings'))
    );
    if (prusaPath) {
      const content = await zip.files[prusaPath].async('string');
      const parsed = parsePrusaFallback(content);
      if (parsed.slicer) result.slicer = parsed.slicer;
      if (parsed.weight_g || parsed.print_time_min) {
        result.plates.push({
          plate_idx: 1,
          print_time_min: parsed.print_time_min,
          objects: [{
            id: '1',
            name: result.fileName,
            filament_type: parsed.filament_type || '',
            filament_color: '',
            weight_g: parsed.weight_g,
            has_support: false,
            support_weight_g: null,
          }],
        });
      }
    }
  }

  // ─── 5. Fallback generico sul 3dmodel.model ───────────────────────────────────
  if (result.plates.length === 0 && modelPath) {
    const doc = await readXml(modelPath);
    const plate = { plate_idx: 1, print_time_min: null, objects: [] };
    doc.querySelectorAll('metadata, meta, property').forEach(el => {
      const name = (el.getAttribute('name') || el.getAttribute('key') || '').toLowerCase();
      const value = el.getAttribute('value') || el.textContent || '';
      if (name.includes('print_time')) plate.print_time_min = parseTimeToMinutes(value);
      if (name.includes('slicer') || name.includes('generator')) {
        if (value.toLowerCase().includes('cura')) result.slicer = 'Cura';
        else result.slicer = value;
      }
    });
    doc.querySelectorAll('object').forEach(el => {
      const id = el.getAttribute('id') || '';
      const name = el.getAttribute('name') || el.querySelector('metadata[name="name"]')?.getAttribute('value') || result.fileName;
      plate.objects.push({ id, name, filament_type: '', filament_color: '', weight_g: null, has_support: false, support_weight_g: null });
    });
    if (plate.objects.length === 0) {
      plate.objects.push({ id: '1', name: result.fileName, filament_type: '', filament_color: '', weight_g: null, has_support: false, support_weight_g: null });
    }
    result.plates.push(plate);
  }

  return result;
}

function parsePrusaFallback(content) {
  const result = { weight_g: null, print_time_min: null, slicer: null, filament_type: '' };
  const lines = content.split('\n');
  for (const line of lines) {
    const [k, ...rest] = line.split('=');
    const key = k.trim().toLowerCase();
    const val = rest.join('=').trim();
    if (key.includes('slicer') || key.includes('generator')) {
      if (val.toLowerCase().includes('prusa')) result.slicer = 'PrusaSlicer';
      else if (val.toLowerCase().includes('super')) result.slicer = 'SuperSlicer';
      else if (val.toLowerCase().includes('bambu')) result.slicer = 'Bambu Studio';
      else if (val.toLowerCase().includes('orca')) result.slicer = 'OrcaSlicer';
    }
    if (key === 'filament_used_g' || key === 'filament_used') {
      const g = parseFloat(val);
      if (!isNaN(g) && g > 0) result.weight_g = g;
    }
    if (key === 'estimated_print_time' || key === 'print_time') {
      result.print_time_min = parseTimeToMinutes(val);
    }
    if (key === 'filament_type') result.filament_type = val;
  }
  return result;
}

// Converte stringa tempo in minuti
// Formati: "1h 23m 45s", "1:23:45", "5040" (secondi), "84.0" (minuti)
export function parseTimeToMinutes(str) {
  if (!str) return null;
  str = str.trim();

  const hmsMatch = str.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?/i);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const h = parseInt(hmsMatch[1] || '0');
    const m = parseInt(hmsMatch[2] || '0');
    const s = parseInt(hmsMatch[3] || '0');
    const total = h * 60 + m + s / 60;
    if (total > 0) return Math.round(total);
  }

  const colonMatch = str.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (colonMatch) {
    return Math.round(parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]) + parseInt(colonMatch[3]) / 60);
  }

  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    return num > 300 ? Math.round(num / 60) : Math.round(num);
  }

  return null;
}