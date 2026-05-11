import JSZip from 'jszip';

/**
 * Parsa un file .3mf ed estrae peso e tempo di stampa.
 * Supporta: Bambu Studio, OrcaSlicer, PrusaSlicer, Cura
 *
 * Ritorna:
 * {
 *   weight_g: number | null,
 *   print_time_min: number | null,
 *   part_name: string,
 *   slicer: string,
 *   filaments: [{ type, usedG, usedMM }]
 * }
 */
export async function parse3MF(file) {
  const zip = await JSZip.loadAsync(file);
  const result = {
    weight_g: null,
    print_time_min: null,
    part_name: file.name.replace(/\.3mf$/i, ''),
    slicer: 'unknown',
    filaments: [],
  };

  // Lista tutti i file nel ZIP per debug
  const fileNames = Object.keys(zip.files);

  // ─── 1. BAMBU STUDIO / ORCA SLICER ─────────────────────────────────────────
  // Cercano in: Metadata/slice_info.config (XML) oppure Metadata/model_settings.config
  const sliceInfoPath = fileNames.find(f =>
    f.toLowerCase().includes('metadata/slice_info') ||
    f.toLowerCase().includes('slice_info.config')
  );

  if (sliceInfoPath) {
    const xml = await zip.files[sliceInfoPath].async('string');
    const parsed = parseBambuSliceInfo(xml);
    if (parsed.slicer) result.slicer = parsed.slicer;
    if (parsed.weight_g != null) result.weight_g = parsed.weight_g;
    if (parsed.print_time_min != null) result.print_time_min = parsed.print_time_min;
    if (parsed.filaments.length > 0) result.filaments = parsed.filaments;
  }

  // ─── 2. PRUSASLICER / SUPERSLICER ──────────────────────────────────────────
  // Dati in: Metadata/Slic3r_PE_model.config o 3D/Metadata/*.config
  // oppure come commenti nel model.gcode
  if (result.weight_g == null || result.print_time_min == null) {
    const prusaPath = fileNames.find(f =>
      f.toLowerCase().includes('slic3r_pe') ||
      f.toLowerCase().includes('prusaslicer') ||
      (f.toLowerCase().includes('metadata') && f.endsWith('.config'))
    );
    if (prusaPath) {
      const content = await zip.files[prusaPath].async('string');
      const parsed = parsePrusaConfig(content);
      if (result.weight_g == null && parsed.weight_g != null) result.weight_g = parsed.weight_g;
      if (result.print_time_min == null && parsed.print_time_min != null) result.print_time_min = parsed.print_time_min;
      if (result.slicer === 'unknown' && parsed.slicer) result.slicer = parsed.slicer;
    }
  }

  // ─── 3. CURA / GENERICO ────────────────────────────────────────────────────
  // Alcuni slicer salvano i dati come estensione 3MF in: Metadata/cura_profile.config
  // o dentro il model XML (3D/3dmodel.model) come attributi custom
  if (result.weight_g == null || result.print_time_min == null) {
    const modelPath = fileNames.find(f =>
      f.toLowerCase().endsWith('3dmodel.model') || f.toLowerCase().endsWith('.model')
    );
    if (modelPath) {
      const xml = await zip.files[modelPath].async('string');
      const parsed = parseModelXml(xml);
      if (result.weight_g == null && parsed.weight_g != null) result.weight_g = parsed.weight_g;
      if (result.print_time_min == null && parsed.print_time_min != null) result.print_time_min = parsed.print_time_min;
      if (result.slicer === 'unknown' && parsed.slicer) result.slicer = parsed.slicer;
      if (!result.part_name || result.part_name === file.name.replace(/\.3mf$/i, '')) {
        if (parsed.part_name) result.part_name = parsed.part_name;
      }
    }
  }

  return result;
}

// ─── PARSER BAMBU/ORCA slice_info.config ──────────────────────────────────────
function parseBambuSliceInfo(xml) {
  const result = { weight_g: null, print_time_min: null, slicer: null, filaments: [] };
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Rileva slicer
    const slicerEl = doc.querySelector('slice_info');
    if (slicerEl) {
      const soft = slicerEl.getAttribute('slicer') || slicerEl.getAttribute('slicersoftware') || '';
      if (soft.toLowerCase().includes('bambu')) result.slicer = 'Bambu Studio';
      else if (soft.toLowerCase().includes('orca')) result.slicer = 'OrcaSlicer';
    }

    // Tempo di stampa: <plate>...<print_time>...</print_time>
    const printTimeEl = doc.querySelector('print_time') || doc.querySelector('[key="print_time"]');
    if (printTimeEl) {
      const val = printTimeEl.textContent || printTimeEl.getAttribute('value') || '';
      result.print_time_min = parseTimeToMinutes(val);
    }

    // Peso totale filamenti
    let totalWeight = 0;
    const filamentEls = doc.querySelectorAll('filament');
    filamentEls.forEach(el => {
      const usedG = parseFloat(el.getAttribute('used_g') || el.getAttribute('weight') || '0');
      const usedMM = parseFloat(el.getAttribute('used_m') || el.getAttribute('used_mm') || '0');
      const type = el.getAttribute('type') || el.getAttribute('filament_type') || '';
      const id = el.getAttribute('id') || '';
      if (usedG > 0) {
        totalWeight += usedG;
        result.filaments.push({ id, type, usedG, usedMM });
      }
    });
    if (totalWeight > 0) result.weight_g = totalWeight;

    // Fallback: cerca tag generici
    if (result.print_time_min == null) {
      const allEls = doc.querySelectorAll('*');
      allEls.forEach(el => {
        const key = (el.getAttribute('key') || el.tagName || '').toLowerCase();
        if (key.includes('print_time') || key.includes('printtime')) {
          const val = el.getAttribute('value') || el.textContent || '';
          if (val && result.print_time_min == null) {
            result.print_time_min = parseTimeToMinutes(val);
          }
        }
        if (key.includes('filament_weight') || key.includes('used_g')) {
          const val = parseFloat(el.getAttribute('value') || el.textContent || '0');
          if (val > 0 && result.weight_g == null) result.weight_g = val;
        }
      });
    }
  } catch (e) {
    // ignora errori di parsing XML
  }
  return result;
}

// ─── PARSER PRUSASLICER .config ────────────────────────────────────────────────
function parsePrusaConfig(content) {
  const result = { weight_g: null, print_time_min: null, slicer: null };
  
  // Formato: key = value (ini-like)
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
  }

  // Formato XML (Slic3r_PE_model.config)
  if (result.weight_g == null && content.includes('<')) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');
      const metaEls = doc.querySelectorAll('metadata, meta, property');
      metaEls.forEach(el => {
        const name = (el.getAttribute('name') || el.getAttribute('key') || '').toLowerCase();
        const value = el.getAttribute('value') || el.textContent || '';
        if (name.includes('filament_used_g') || name.includes('weight')) {
          const g = parseFloat(value);
          if (!isNaN(g) && g > 0) result.weight_g = g;
        }
        if (name.includes('print_time') || name.includes('estimated_time')) {
          result.print_time_min = parseTimeToMinutes(value);
        }
      });
    } catch (e) {}
  }

  return result;
}

// ─── PARSER 3dmodel.model XML ──────────────────────────────────────────────────
function parseModelXml(xml) {
  const result = { weight_g: null, print_time_min: null, slicer: null, part_name: null };
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // metadata tags
    const metaEls = doc.querySelectorAll('metadata, meta, property');
    metaEls.forEach(el => {
      const name = (el.getAttribute('name') || el.getAttribute('key') || '').toLowerCase();
      const value = el.getAttribute('value') || el.textContent || '';
      if (name === 'title' || name === 'name') result.part_name = value;
      if (name.includes('slicer') || name.includes('generator')) {
        if (value.toLowerCase().includes('prusa')) result.slicer = 'PrusaSlicer';
        else if (value.toLowerCase().includes('cura')) result.slicer = 'Cura';
        else if (value.toLowerCase().includes('bambu')) result.slicer = 'Bambu Studio';
        else if (value.toLowerCase().includes('orca')) result.slicer = 'OrcaSlicer';
        else result.slicer = value;
      }
      if (name.includes('print_time') || name.includes('estimated')) {
        result.print_time_min = parseTimeToMinutes(value);
      }
      if (name.includes('weight') || name.includes('filament_g')) {
        const g = parseFloat(value);
        if (!isNaN(g) && g > 0) result.weight_g = g;
      }
    });
  } catch (e) {}
  return result;
}

// ─── UTILITY: converte stringa tempo in minuti ─────────────────────────────────
// Formati supportati: "1h 23m 45s", "1:23:45", "5040s", "84.0", "1h23m"
export function parseTimeToMinutes(str) {
  if (!str) return null;
  str = str.trim();

  // Formato "Xh Ym Zs" o "Xh Ym" o "Xm Zs"
  const hmsMatch = str.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?/i);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const h = parseInt(hmsMatch[1] || '0');
    const m = parseInt(hmsMatch[2] || '0');
    const s = parseInt(hmsMatch[3] || '0');
    const total = h * 60 + m + s / 60;
    if (total > 0) return Math.round(total);
  }

  // Formato "H:MM:SS" o "HH:MM:SS"
  const colonMatch = str.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (colonMatch) {
    return Math.round(parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]) + parseInt(colonMatch[3]) / 60);
  }

  // Formato "MM:SS"
  const mmssMatch = str.match(/^(\d+):(\d{2})$/);
  if (mmssMatch) {
    return Math.round(parseInt(mmssMatch[1]) + parseInt(mmssMatch[2]) / 60);
  }

  // Formato solo numero (secondi se grande, minuti se piccolo)
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    // Se > 300 assumiamo secondi, altrimenti minuti
    return num > 300 ? Math.round(num / 60) : Math.round(num);
  }

  return null;
}