import jsPDF from 'jspdf';
import { calculateLinePrice } from './pricingEngine';

const EUR = (v) => `€${parseFloat(v || 0).toFixed(2)}`;
const fmt = (v, d = 2) => parseFloat(v || 0).toFixed(d);

// Palette
const C = {
  primary:    [220, 90, 20],
  primaryDark:[160, 60, 10],
  dark:       [22, 24, 35],
  gray:       [90, 95, 110],
  light:      [246, 247, 250],
  border:     [220, 223, 230],
  white:      [255, 255, 255],
  rowAlt:     [250, 251, 254],
};

function setFont(doc, size, style = 'normal', color = C.dark) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function drawLogo(doc, x, y, size = 10) {
  // Icona stilizzata: cubo 3D + testo "3D Price"
  const s = size;
  // Faccia frontale
  doc.setFillColor(...C.primary);
  doc.rect(x, y, s * 0.8, s * 0.8, 'F');
  // Faccia superiore
  doc.setFillColor(...C.primaryDark);
  doc.triangle(
    x, y,
    x + s * 0.8, y,
    x + s * 1.1, y - s * 0.3,
    'F'
  );
  // Faccia laterale
  doc.setFillColor(180, 70, 15);
  doc.triangle(
    x + s * 0.8, y,
    x + s * 1.1, y - s * 0.3,
    x + s * 1.1, y + s * 0.5,
    'F'
  );
  doc.triangle(
    x + s * 0.8, y,
    x + s * 0.8, y + s * 0.8,
    x + s * 1.1, y + s * 0.5,
    'F'
  );
  // Testo logo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size * 1.4);
  doc.setTextColor(...C.dark);
  doc.text('3D', x + s * 1.4, y + s * 0.55);
  doc.setTextColor(...C.primary);
  doc.text('Price', x + s * 1.4 + size * 1.15 * 0.5 + 2.5, y + s * 0.55);
}

function drawHLine(doc, x1, y, x2, color = C.border, lw = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
}

// ─── PAGINA 1: Copertina / Dati cliente + riepilogo materiali ────────────────
function drawCoverPage(doc, { clientName, paymentTerms, date, lines, materials, config }) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;

  // Banda laterale sinistra decorativa
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, 7, pageH, 'F');

  // Banda arancio superiore
  doc.setFillColor(...C.primary);
  doc.rect(7, 0, pageW - 7, 50, 'F');

  // Logo in alto a sinistra (bianco su sfondo arancio)
  doc.setFillColor(...C.white);
  const ls = 9;
  const lx = margin + 2, ly = 14;
  // Cubo stilizzato bianco
  doc.rect(lx, ly, ls * 0.8, ls * 0.8, 'F');
  doc.setFillColor(255, 200, 160);
  doc.triangle(lx, ly, lx + ls * 0.8, ly, lx + ls * 1.1, ly - ls * 0.3, 'F');
  doc.setFillColor(255, 170, 120);
  doc.triangle(lx + ls * 0.8, ly, lx + ls * 1.1, ly - ls * 0.3, lx + ls * 1.1, ly + ls * 0.5, 'F');
  doc.triangle(lx + ls * 0.8, ly, lx + ls * 0.8, ly + ls * 0.8, lx + ls * 1.1, ly + ls * 0.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('3D Price', lx + ls * 1.4 + 1, ly + ls * 0.65);

  // Titolo PREVENTIVO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(255, 255, 255);
  doc.text('PREVENTIVO', pageW / 2, 30, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 220, 190);
  const fmtDate = date
    ? new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Emesso il ${fmtDate}`, pageW / 2, 40, { align: 'center' });

  let y = 64;

  // ── Box Cliente
  doc.setFillColor(...C.light);
  doc.roundedRect(margin, y, pageW - margin * 2, 30, 3, 3, 'F');
  drawHLine(doc, margin, y, margin + (pageW - margin * 2), C.primary, 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.primary);
  doc.text('DESTINATARIO', margin + 5, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.dark);
  doc.text(clientName || '—', margin + 5, y + 18);

  // Dati ordine (destra)
  const infoX = pageW - margin - 80;
  const drawInfo = (label, value, iy) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text(label.toUpperCase(), infoX, iy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    doc.text(value || '—', infoX, iy + 5);
  };
  drawInfo('Data emissione', fmtDate, y + 8);
  drawInfo('Condizioni di pagamento', paymentTerms || '—', y + 20);

  y += 38;

  // ── Titolo sezione materiali
  setFont(doc, 8, 'bold', C.primary);
  doc.text('DETTAGLIO MATERIALI UTILIZZATI', margin, y + 5);
  drawHLine(doc, margin, y + 8, pageW - margin, C.primary, 0.5);
  y += 14;

  // Aggrega materiali per codice
  const matMap = {};
  lines.filter(l => l.part_name).forEach(line => {
    if (line.sub_materials && line.sub_materials.length > 0) {
      line.sub_materials.forEach(sm => {
        if (!sm.material_code) return;
        if (!matMap[sm.material_code]) matMap[sm.material_code] = { weight_g: 0, qty: 0 };
        matMap[sm.material_code].weight_g += (sm.weight_g || 0) * (line.quantity || 1);
        matMap[sm.material_code].qty += (line.quantity || 1);
      });
    } else if (line.material_code) {
      if (!matMap[line.material_code]) matMap[line.material_code] = { weight_g: 0, qty: 0 };
      matMap[line.material_code].weight_g += (line.weight_g || 0) * (line.quantity || 1);
      matMap[line.material_code].qty += (line.quantity || 1);
    }
  });

  // Header tabella materiali
  const matCols = [
    { label: 'Codice',    w: 28 },
    { label: 'Materiale', w: 55 },
    { label: 'Brand',     w: 35 },
    { label: 'Colore',    w: 30 },
    { label: 'Peso tot. (g)', w: 28, r: true },
    { label: '€/g',       w: 22, r: true },
    { label: 'Costo mat.', w: 28, r: true },
  ];
  let mx = margin;
  const matColsX = matCols.map(c => { const x = mx; mx += c.w; return x; });

  const mhH = 7;
  doc.setFillColor(...C.dark);
  doc.rect(margin, y, pageW - margin * 2, mhH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.white);
  matCols.forEach((col, i) => {
    const tx = col.r ? matColsX[i] + col.w - 1 : matColsX[i] + 1;
    doc.text(col.label, tx, y + 4.8, { align: col.r ? 'right' : 'left' });
  });
  y += mhH;

  // Righe materiali
  Object.entries(matMap).forEach(([code, { weight_g }], ri) => {
    const mat = materials.find(m => m.code === code);
    if (!mat) return;
    const rowH = 7;
    if (ri % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.dark);
    const matCost = weight_g * 1.05 * (mat.price_per_gram || 0);
    const vals = [
      mat.code || '',
      mat.material_name || '—',
      mat.brand || '—',
      mat.color || '—',
      fmt(weight_g, 1),
      EUR(mat.price_per_gram || 0),
      EUR(matCost),
    ];
    vals.forEach((v, i) => {
      const tx = matCols[i].r ? matColsX[i] + matCols[i].w - 1 : matColsX[i] + 1;
      doc.text(v, tx, y + 4.8, { align: matCols[i].r ? 'right' : 'left' });
    });
    drawHLine(doc, margin, y + rowH, pageW - margin, C.border);
    y += rowH;
  });

  // ── Footer pagina 1
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.gray);
  doc.text('Pagina 1 di 2  •  Continua sul retro con il dettaglio costi', pageW / 2, pageH - 8, { align: 'center' });
  doc.setFillColor(...C.primary);
  doc.rect(0, pageH - 4, pageW, 4, 'F');
}

// ─── PAGINA 2: Tabella costi dettagliata + riepilogo finale ──────────────────
function drawDetailPage(doc, { clientName, paymentTerms, date, lines, materials, config }) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;

  // Banda laterale
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, 7, pageH, 'F');

  // Mini header
  doc.setFillColor(...C.dark);
  doc.rect(7, 0, pageW - 7, 14, 'F');
  setFont(doc, 8, 'bold', C.white);
  doc.text('PREVENTIVO  —  DETTAGLIO COSTI', margin, 9);
  setFont(doc, 7, 'normal', [180, 185, 200]);
  doc.text(`Cliente: ${clientName || '—'}`, pageW - margin, 9, { align: 'right' });

  let y = 20;

  // ── Tabella costi
  const cols = [
    { label: '#',          w: 7,  align: 'center' },
    { label: 'Componente', w: 46, align: 'left'   },
    { label: 'Materiale',  w: 40, align: 'left'   },
    { label: 'g',          w: 14, align: 'right'  },
    { label: 'Stampa',     w: 16, align: 'right'  },
    { label: 'MDO',        w: 13, align: 'right'  },
    { label: 'Qtà',        w: 10, align: 'right'  },
    { label: 'Mat. €',     w: 17, align: 'right'  },
    { label: 'Macch. €',   w: 17, align: 'right'  },
    { label: 'MDO €',      w: 15, align: 'right'  },
    { label: '+Fail €',    w: 15, align: 'right'  },
    { label: 'Markup',     w: 14, align: 'right'  },
    { label: 'Totale',     w: 19, align: 'right'  },
    { label: 'Al pz',      w: 17, align: 'right'  },
  ];

  let cx = margin;
  const colsX = cols.map(c => { const x = cx; cx += c.w; return x; });

  const headerH = 8;
  doc.setFillColor(...C.dark);
  doc.rect(margin, y, pageW - margin * 2, headerH, 'F');
  setFont(doc, 6.2, 'bold', C.white);
  cols.forEach((col, i) => {
    const tx = col.align === 'right'
      ? colsX[i] + col.w - 1
      : col.align === 'center'
        ? colsX[i] + col.w / 2
        : colsX[i] + 1;
    doc.text(col.label, tx, y + 5.2, { align: col.align });
  });
  y += headerH;

  let totalFinal = 0, totalMat = 0, totalMachine = 0, totalLabor = 0;
  let rowIdx = 0;

  const validLines = lines.filter(l => l.part_name);

  const drawTableHeader = (yy) => {
    doc.setFillColor(...C.dark);
    doc.rect(margin, yy, pageW - margin * 2, headerH, 'F');
    setFont(doc, 6.2, 'bold', C.white);
    cols.forEach((col, i) => {
      const tx = col.align === 'right'
        ? colsX[i] + col.w - 1
        : col.align === 'center'
          ? colsX[i] + col.w / 2
          : colsX[i] + 1;
      doc.text(col.label, tx, yy + 5.2, { align: col.align });
    });
    return yy + headerH;
  };

  validLines.forEach((line, li) => {
    const material = materials.find(m => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials);
    totalFinal += calc.finalPrice;
    totalMat += calc.materialCost;
    totalMachine += calc.machineCost;
    totalLabor += calc.laborCost;

    const hasSubMaterials = line.sub_materials && line.sub_materials.length > 0;
    let matLabel = '';
    if (hasSubMaterials) {
      matLabel = line.sub_materials.map(sm => {
        const m = materials.find(x => x.code === sm.material_code);
        return m ? `${m.material_name} ${sm.weight_g}g` : sm.material_code;
      }).join(' + ');
    } else {
      matLabel = material
        ? `${material.material_name}${material.color ? ' ' + material.color : ''}`
        : '—';
    }

    const matLines = doc.splitTextToSize(matLabel, cols[2].w - 2);
    const compLines = doc.splitTextToSize(line.part_name || '', cols[1].w - 2);
    const dynH = Math.max(matLines.length, compLines.length) * 4.2 + 3;

    if (y + dynH > pageH - 45) {
      doc.addPage();
      doc.setFillColor(...C.primary);
      doc.rect(0, 0, 7, pageH, 'F');
      doc.setFillColor(...C.dark);
      doc.rect(7, 0, pageW - 7, 14, 'F');
      setFont(doc, 8, 'bold', C.white);
      doc.text('PREVENTIVO  —  DETTAGLIO COSTI (continua)', margin, 9);
      y = 20;
      y = drawTableHeader(y);
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(margin, y, pageW - margin * 2, dynH, 'F');
    }

    setFont(doc, 6.5, 'normal', C.dark);
    const textY = y + 4.5;

    doc.text(String(li + 1), colsX[0] + cols[0].w / 2, textY, { align: 'center' });
    doc.text(compLines, colsX[1] + 1, textY);
    doc.text(matLines, colsX[2] + 1, textY);

    const nums = [
      fmt(line.weight_g, 1),
      `${fmt(line.print_time_min, 0)}m`,
      `${fmt(line.labor_time_min, 0)}m`,
      String(line.quantity || 1),
      EUR(calc.materialCost),
      EUR(calc.machineCost),
      EUR(calc.laborCost),
      EUR(calc.costWithFailRate),
      `×${fmt(calc.markup, 2)}`,
      EUR(calc.finalPrice),
      EUR(calc.finalPricePerUnit),
    ];
    nums.forEach((val, ni) => {
      doc.text(val, colsX[3 + ni] + cols[3 + ni].w - 1, textY, { align: 'right' });
    });

    drawHLine(doc, margin, y + dynH, pageW - margin, C.border);
    y += dynH;
    rowIdx++;
  });

  // ── Riepilogo finale
  y += 6;
  if (y > pageH - 60) {
    doc.addPage();
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, 7, pageH, 'F');
    y = 20;
  }

  const summaryW = 82;
  const summaryX = pageW - margin - summaryW;

  // Titolo riepilogo
  setFont(doc, 7.5, 'bold', C.primary);
  doc.text('RIEPILOGO ECONOMICO', summaryX, y);
  y += 4;
  drawHLine(doc, summaryX, y, pageW - margin, C.primary, 0.5);
  y += 4;

  const drawRow = (label, value, bold = false, highlight = false, topBorder = false) => {
    const rh = 8;
    if (highlight) {
      doc.setFillColor(...C.primary);
      doc.roundedRect(summaryX, y - 5, summaryW, rh + 1, 2, 2, 'F');
      doc.setTextColor(...C.white);
    } else {
      doc.setFillColor(...C.light);
      doc.rect(summaryX, y - 5, summaryW, rh, 'F');
      doc.setTextColor(...C.dark);
    }
    if (topBorder && !highlight) drawHLine(doc, summaryX, y - 5, summaryX + summaryW, C.border);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(highlight ? 8 : 7);
    doc.text(label, summaryX + 4, y);
    doc.text(value, summaryX + summaryW - 4, y, { align: 'right' });
    y += rh + 1;
  };

  drawRow('Costo Materiali',       EUR(totalMat));
  drawRow('Costo Macchina',        EUR(totalMachine));
  drawRow('Manodopera',            EUR(totalLabor));
  drawRow('Subtotale netto',       EUR(totalFinal), true, false, true);
  drawRow('IVA 22%',               EUR(totalFinal * 0.22));
  drawRow('TOTALE IVA INCLUSA',    EUR(totalFinal * 1.22), true, true);

  // Nota pagamento
  y += 2;
  setFont(doc, 6.5, 'normal', C.gray);
  const nota = doc.splitTextToSize(`Condizioni di pagamento: ${paymentTerms || '—'}`, summaryW);
  doc.text(nota, summaryX, y);

  // ── Note preventivo (sinistra)
  const notesX = margin;
  const notesY = pageH - 30;
  setFont(doc, 6.5, 'bold', C.gray);
  doc.text('NOTE', notesX, notesY);
  setFont(doc, 6, 'normal', C.gray);
  doc.text('• I prezzi sono IVA esclusa salvo dove indicato.', notesX, notesY + 5);
  doc.text('• Validità preventivo: 30 giorni dalla data di emissione.', notesX, notesY + 9.5);
  doc.text('• I pesi includono il 5% di materiale di scarto.', notesX, notesY + 14);

  // ── Footer
  doc.setFillColor(...C.dark);
  doc.rect(0, pageH - 8, pageW, 8, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(0, pageH - 8, 7, 8, 'F');
  setFont(doc, 6, 'normal', [160, 165, 180]);
  doc.text('3D Price  •  Documento generato automaticamente', pageW / 2, pageH - 3.5, { align: 'center' });
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
export function generateQuotePdf({ clientName, paymentTerms, date, lines, materials, config }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Pagina 1: copertina + materiali
  drawCoverPage(doc, { clientName, paymentTerms, date, lines, materials, config });

  // Pagina 2: dettaglio costi
  doc.addPage();
  drawDetailPage(doc, { clientName, paymentTerms, date, lines, materials, config });

  // Salva
  const safeName = (clientName || 'preventivo').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`preventivo_${safeName}_${dateStr}.pdf`);
}