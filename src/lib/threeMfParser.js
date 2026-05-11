import JSZip from 'jszip';

/**
 * Parsa un file .3mf di Bambu Studio / OrcaSlicer / PrusaSlicer.
 *
 * Struttura reale di slice_info.config (Bambu/Orca):
 * <config>
 *   <plate>
 *     <metadata key="printer_model_id" value="..."/>
 *     <metadata key="support_used" value="1"/>
 *     <metadata key="print_time" value="1h54m20s"/>
 *     <object name="NomeComponente"/>
 *     <filament id="1" type="PLA" color="#FF0000" used_m="28.89" used_g="83.39"/>
 *   </plate>
 * </config>
 *
 * Ritorna:
 * {
 *   slicer: string,
 *   fileName: string,
 *   plates: [
 *     {
 *       plate_idx: number,
 *       print_time_min: number | null,
 *       support_used: boolean,
 *       printer_model: string,
 *       objects: [{ name: string }],
 *       filaments: [{ id, type, color, used_g, used_m }]
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

  // ─── Leggi tutti i file rilevanti ────────────────────────────────────────────
  const readText = async (path) => zip.files[path].async('string');

  // ─── 1. Bambu Studio / OrcaSlicer → slice_info.config ────────────────────────
  // Una per piatto: Metadata/slice_info.config (oppure multipli per gcode.3mf)
  const sliceInfoPaths = fileNames.filter(f =>
    /metadata\/slice_info/i.test(f) && f.endsWith('.config')
  );

  if (sliceInfoPaths.length > 0) {
    for (let si = 0; si < sliceInfoPaths.length; si++) {
      const xml = await readText(sliceInfoPaths[si]);
      const plates = parseBambuSliceInfoXml(xml, si + 1);
      result.plates.push(...plates);
    }
    // Determina slicer dal primo file
    if (result.slicer === 'unknown') {
      // Cerca "Snapmaker", "Bambu", "Orca" nei metadati
      const firstXml = await readText(sliceInfoPaths[0]);
      if (firstXml.toLowerCase().includes('snapmaker')) result.slicer = 'Snapmaker';
      else if (firstXml.toLowerCase().includes('bambu')) result.slicer = 'Bambu Studio';
      else if (firstXml.toLowerCase().includes('orca')) result.slicer = 'OrcaSlicer';
      else result.slicer = 'Bambu/Orca';
    }
  }

  // ─── 2. Leggi il G-Code embedded per completare i dati mancanti (es. print_time) ─
  const gcodePaths = fileNames.filter(f => /metadata\/plate_\d+\.gcode$/i.test(f));
  for (const gp of gcodePaths) {
    // Estrai l'indice del piatto dal nome file (plate_1.gcode → 1)
    const plateIdxMatch = gp.match(/plate_(\d+)\.gcode$/i);
    const plateIdx = plateIdxMatch ? parseInt(plateIdxMatch[1]) : null;

    // Leggi i primi 20KB (header) + ultimi 5KB (footer) dove Bambu mette il tempo totale
    // Leggi l'intero G-Code ma estrai solo le righe commento (iniziano con ";")
    const gcodeRaw = await zip.files[gp].async('string');
    const commentLines = gcodeRaw.split('\n').filter(l => l.trimStart().startsWith(';')).join('\n');
    console.log('[3MF GCode comment lines with time]', gp, commentLines.split('\n').filter(l => /time/i.test(l)));
    const gcodeData = parseGcodeHeader(commentLines);

    if (result.slicer === 'unknown' && gcodeData.slicer) result.slicer = gcodeData.slicer;

    // Trova il piatto corrispondente
    const existingPlate = plateIdx != null
      ? result.plates.find(p => p.plate_idx === plateIdx)
      : null;

    if (existingPlate) {
      // Aggiorna solo i campi mancanti
      if (existingPlate.print_time_min == null && gcodeData.print_time_min != null) {
        existingPlate.print_time_min = gcodeData.print_time_min;
      }
      if (existingPlate.filaments.length === 0 && gcodeData.filaments.length > 0) {
        existingPlate.filaments = gcodeData.filaments;
      }
    } else if (gcodeData.print_time_min != null || gcodeData.filaments.length > 0) {
      result.plates.push({
        plate_idx: plateIdx || result.plates.length + 1,
        print_time_min: gcodeData.print_time_min,
        support_used: false,
        printer_model: gcodeData.printer_model || '',
        objects: gcodeData.objects || [],
        filaments: gcodeData.filaments,
      });
    }
  }

  // ─── 3. PrusaSlicer fallback (Slic3r_PE.config) ─────────────────────────────
  if (result.plates.length === 0) {
    const prusaConfig = fileNames.find(f => /slic3r_pe\.config$/i.test(f));
    if (prusaConfig) {
      const text = await readText(prusaConfig);
      const data = parsePrusaIni(text);
      if (data.slicer) result.slicer = data.slicer;
      result.plates.push({
        plate_idx: 1,
        print_time_min: data.print_time_min,
        support_used: false,
        printer_model: '',
        objects: [{ name: result.fileName }],
        filaments: data.filaments,
      });
    }
  }

  // ─── 4. Fallback generico: leggi il 3dmodel.model ────────────────────────────
  if (result.plates.length === 0) {
    const modelPath = fileNames.find(f => /3dmodel\.model$/i.test(f));
    if (modelPath) {
      const xml = await readText(modelPath);
      const objects = parseModelObjects(xml);
      if (result.slicer === 'unknown') {
        if (xml.includes('Cura')) result.slicer = 'Cura';
        else if (xml.includes('PrusaSlicer')) result.slicer = 'PrusaSlicer';
      }
      result.plates.push({
        plate_idx: 1,
        print_time_min: null,
        support_used: false,
        printer_model: '',
        objects,
        filaments: [],
      });
    }
  }

  // Fallback minimo
  if (result.plates.length === 0) {
    result.plates.push({
      plate_idx: 1,
      print_time_min: null,
      support_used: false,
      printer_model: '',
      objects: [{ name: result.fileName }],
      filaments: [],
    });
  }

  // Debug: logga il risultato del parsing
  console.log('[3MF Parser]', result.fileName, result.plates.map(p => ({
    plate: p.plate_idx,
    print_time_min: p.print_time_min,
    filaments: p.filaments.length,
    objects: p.objects.map(o => o.name),
  })));

  return result;
}

// ─── PARSER PRINCIPALE: Bambu/Orca slice_info.config ──────────────────────────
// Struttura XML reale:
// <config>
//   <plate>
//     <metadata key="support_used" value="0"/>
//     <metadata key="print_time" value="1h54m20s"/>
//     <object name="ComponentName"/>
//     <filament id="1" type="PLA" color="#FFF" used_m="28.89" used_g="83.39"/>
//   </plate>
//   <plate>...</plate>  (se ci sono più piatti)
// </config>
function parseBambuSliceInfoXml(xml, defaultIdx) {
  const plates = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    const plateEls = doc.querySelectorAll('plate');

    if (plateEls.length === 0) {
      // Struttura flat: tutto è direttamente sotto <config>
      const plate = parseSinglePlate(doc.documentElement, defaultIdx);
      plates.push(plate);
    } else {
      plateEls.forEach((plateEl, idx) => {
        // Prova a leggere l'indice dal primo metadata con key="index" o "plate_index"
        let plateIdx = defaultIdx + idx;
        plateEl.querySelectorAll('metadata').forEach(m => {
          const key = (m.getAttribute('key') || '').toLowerCase();
          if (key === 'index' || key === 'plate_index' || key === 'id') {
            const v = parseInt(m.getAttribute('value') || '');
            if (!isNaN(v)) plateIdx = v;
          }
        });
        const plate = parseSinglePlate(plateEl, plateIdx);
        plates.push(plate);
      });
    }
  } catch (e) {
    // ignora
  }
  return plates;
}

function parseSinglePlate(el, idx) {
  const plate = {
    plate_idx: idx,
    print_time_min: null,
    support_used: false,
    printer_model: '',
    objects: [],
    filaments: [],
  };

  // Leggi metadata
  el.querySelectorAll('metadata').forEach(m => {
    const key = (m.getAttribute('key') || '').toLowerCase();
    const value = m.getAttribute('value') || '';
    if (key === 'support_used') plate.support_used = value === '1' || value === 'true';
    if (key === 'print_time' || key === 'estimate_time' || key === 'total_time') {
      plate.print_time_min = parseTimeToMinutes(value);
    }
    if (key === 'printer_model_id' || key === 'printer_model') plate.printer_model = value;
  });

  // Oggetti
  el.querySelectorAll('object').forEach(o => {
    const name = o.getAttribute('name') || o.getAttribute('identify_id') || '';
    if (name) plate.objects.push({ name });
  });

  // Filamenti
  el.querySelectorAll('filament').forEach(f => {
    const id = f.getAttribute('id') || '';
    const type = f.getAttribute('type') || f.getAttribute('filament_type') || '';
    const color = f.getAttribute('color') || '';
    const used_g = parseFloat(f.getAttribute('used_g') || '0');
    const used_m = parseFloat(f.getAttribute('used_m') || '0');
    // Includi solo filamenti effettivamente usati
    if (used_g > 0 || used_m > 0 || type) {
      plate.filaments.push({ id, type, color, used_g, used_m });
    }
  });

  return plate;
}

// ─── PARSER G-CODE HEADER (fallback) ─────────────────────────────────────────
function parseGcodeHeader(text) {
  const result = { print_time_min: null, slicer: null, filaments: [], objects: [], printer_model: '' };
  const lines = text.split('\n');
  const filamentTypes = [];
  const filamentColors = [];
  const filamentWeights = [];
  const filamentLengths = [];

  for (const line of lines) {
    if (!line.startsWith(';')) continue;
    const content = line.slice(1).trim();

    // Rileva slicer
    if (/bambu studio/i.test(content)) result.slicer = 'Bambu Studio';
    else if (/orcaslicer/i.test(content)) result.slicer = 'OrcaSlicer';
    else if (/prusaslicer/i.test(content)) result.slicer = 'PrusaSlicer';
    else if (/snapmaker/i.test(content)) result.slicer = 'Snapmaker';

    // Tempo di stampa — vari formati Bambu/Orca/Prusa
    // Bambu footer: "; total estimated time: 1h 54m 20s" o "; total time: 1h54m"
    // Bambu header: "; estimated printing time (normal mode) = 1h 54m 20s"
    // Prusa: "; estimated printing time = 1h 54m 20s"
    const timeMatch = content.match(/total\s+estimated\s+time[:\s=]+(.+)/i)
      || content.match(/total\s+time[:\s=]+(.+)/i)
      || content.match(/estimated printing time.*?[=:]\s*(.+)/i)
      || content.match(/printing\s+time[:\s=]+(.+)/i)
      || content.match(/print\s*time[:\s=]+(.+)/i)
      || content.match(/^TIME\s*=\s*(\d+)/i);
    if (timeMatch && result.print_time_min == null) {
      result.print_time_min = parseTimeToMinutes(timeMatch[1].trim());
    }

    // Filament types (possono essere ; separated)
    const typeMatch = content.match(/^filament_type\s*=\s*(.+)/i);
    if (typeMatch) {
      typeMatch[1].split(';').forEach(t => filamentTypes.push(t.trim()));
    }
    const colorMatch = content.match(/^filament_colour\s*=\s*(.+)/i)
      || content.match(/^filament_color\s*=\s*(.+)/i);
    if (colorMatch) {
      colorMatch[1].split(';').forEach(c => filamentColors.push(c.trim()));
    }
    const weightMatch = content.match(/^filament\s+used\s*\[g\]\s*=\s*(.+)/i)
      || content.match(/^filament_used_g\s*=\s*(.+)/i);
    if (weightMatch) {
      weightMatch[1].split(',').forEach(w => filamentWeights.push(parseFloat(w.trim()) || 0));
    }
    const lengthMatch = content.match(/^filament\s+used\s*\[mm\]\s*=\s*(.+)/i)
      || content.match(/^filament_used_m\s*=\s*(.+)/i);
    if (lengthMatch) {
      lengthMatch[1].split(',').forEach(l => filamentLengths.push(parseFloat(l.trim()) || 0));
    }

    // Printer model
    const printerMatch = content.match(/^printer_model\s*=\s*(.+)/i)
      || content.match(/^printer\s+model\s*[:\s=]+(.+)/i);
    if (printerMatch) result.printer_model = printerMatch[1].trim();
  }

  // Costruisci array filamenti (solo quelli usati)
  const count = Math.max(filamentTypes.length, filamentWeights.length);
  for (let i = 0; i < count; i++) {
    const used_g = filamentWeights[i] || 0;
    const used_m = filamentLengths[i] || 0;
    if (used_g > 0 || filamentTypes[i]) {
      result.filaments.push({
        id: String(i + 1),
        type: filamentTypes[i] || '',
        color: filamentColors[i] || '',
        used_g,
        used_m,
      });
    }
  }

  return result;
}

// ─── PARSER PrusaSlicer ini ───────────────────────────────────────────────────
function parsePrusaIni(text) {
  const result = { print_time_min: null, slicer: null, filaments: [] };
  const filamentTypes = [];
  const filamentWeights = [];

  for (const line of text.split('\n')) {
    const [k, ...rest] = line.split('=');
    const key = k.trim().toLowerCase();
    const val = rest.join('=').trim();
    if (!val) continue;

    if (key === 'slic3rpe' || key.includes('slicer') || key.includes('generator')) {
      if (val.toLowerCase().includes('prusa')) result.slicer = 'PrusaSlicer';
      else if (val.toLowerCase().includes('bambu')) result.slicer = 'Bambu Studio';
      else if (val.toLowerCase().includes('orca')) result.slicer = 'OrcaSlicer';
    }
    if (key === 'estimated_print_time' || key === 'print_time') {
      result.print_time_min = parseTimeToMinutes(val);
    }
    if (key === 'filament_type') {
      val.split(';').forEach(t => filamentTypes.push(t.trim()));
    }
    if (key === 'filament_used_g' || key === 'filament_used') {
      val.split(',').forEach(w => filamentWeights.push(parseFloat(w) || 0));
    }
  }

  const count = Math.max(filamentTypes.length, filamentWeights.length);
  for (let i = 0; i < count; i++) {
    result.filaments.push({
      id: String(i + 1),
      type: filamentTypes[i] || '',
      color: '',
      used_g: filamentWeights[i] || 0,
      used_m: 0,
    });
  }

  return result;
}

// ─── PARSER model XML → nomi oggetti ─────────────────────────────────────────
function parseModelObjects(xml) {
  const objects = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    doc.querySelectorAll('object').forEach(el => {
      const name = el.getAttribute('name')
        || el.querySelector('metadata[name="name"]')?.getAttribute('value')
        || '';
      if (name) objects.push({ name });
    });
  } catch (e) {}
  return objects;
}

// ─── UTILITY: converte stringa tempo in minuti ─────────────────────────────────
// Formati: "1h54m20s", "1h 54m 20s", "1:54:20", "6860" (secondi)
export function parseTimeToMinutes(str) {
  if (!str) return null;
  str = str.trim();

  // "1h54m20s" o "1h 54m 20s" o "1h54m"
  const hmsMatch = str.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?/i);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const h = parseInt(hmsMatch[1] || '0');
    const m = parseInt(hmsMatch[2] || '0');
    const s = parseInt(hmsMatch[3] || '0');
    const total = h * 60 + m + s / 60;
    if (total > 0) return Math.round(total);
  }

  // "HH:MM:SS"
  const colonMatch = str.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (colonMatch) {
    return Math.round(parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]) + parseInt(colonMatch[3]) / 60);
  }

  // Solo numero → assume secondi se > 300
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    return num > 300 ? Math.round(num / 60) : Math.round(num);
  }

  return null;
}