import jsPDF from 'jspdf';
import { calculateLinePrice } from './pricingEngine';

const EUR = (v) => `€${parseFloat(v || 0).toFixed(2)}`;
const fmt = (v, d = 2) => parseFloat(v || 0).toFixed(d);

const C = {
  primary:  [220, 90, 20],
  dark:     [22, 24, 35],
  gray:     [100, 105, 120],
  light:    [246, 247, 250],
  rowAlt:   [250, 251, 254],
  border:   [220, 223, 230],
  white:    [255, 255, 255],
};

function setFont(doc, size, style = 'normal', color = C.dark) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function hLine(doc, x1, y, x2, color = C.border, lw = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
}

// ── PAGINA 1: Copertina con dati cliente + tabella materiali ─────────────────
function drawCoverPage(doc, { clientName, paymentTerms, date, lines, materials }) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16;

  // Banda superiore arancio
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, 46, 'F');

  // Striscia laterale sinistra
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, 6, pageH, 'F');

  // Logo testuale
  setFont(doc, 20, 'bold', C.white);
  doc.text('3D', M + 2, 22);
  setFont(doc, 20, 'normal', [255, 200, 150]);
  doc.text('Price', M + 20, 22);

  setFont(doc, 9, 'normal', [255, 220, 190]);
  doc.text('Sistema di preventivazione stampa 3D', M + 2, 30);

  // Titolo PREVENTIVO (destra)
  setFont(doc, 28, 'bold', C.white);
  doc.text('PREVENTIVO', pageW - M, 25, { align: 'right' });

  const fmtDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  setFont(doc, 8, 'normal', [255, 220, 190]);
  doc.text(`Emesso il ${fmtDate}`, pageW - M, 35, { align: 'right' });

  let y = 58;

  // ── Box Cliente
  doc.setFillColor(...C.light);
  doc.roundedRect(M, y, pageW - M * 2, 28, 2, 2, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(M, y, 3, 28, 'F');

  setFont(doc, 6.5, 'bold', C.gray);
  doc.text('DESTINATARIO', M + 8, y + 7);
  setFont(doc, 13, 'bold', C.dark);
  doc.text(clientName || '—', M + 8, y + 18);

  // Info destra nel box
  const infoX = pageW - M - 100;
  setFont(doc, 6.5, 'bold', C.gray);
  doc.text('DATA EMISSIONE', infoX, y + 7);
  setFont(doc, 8, 'normal', C.dark);
  doc.text(fmtDate, infoX, y + 14);

  setFont(doc, 6.5, 'bold', C.gray);
  doc.text('CONDIZIONI DI PAGAMENTO', infoX, y + 20);
  setFont(doc, 7, 'normal', C.dark);
  const ptLines = doc.splitTextToSize(paymentTerms || '—', 95);
  doc.text(ptLines, infoX, y + 26);

  y += 36;

  // ── Sezione materiali
  setFont(doc, 8, 'bold', C.primary);
  doc.text('DETTAGLIO MATERIALI UTILIZZATI', M, y + 5);
  hLine(doc, M, y + 8, pageW - M, C.primary, 0.6);
  y += 14;

  // Aggrega materiali
  const matMap = {};
  lines.filter(l => l.part_name).forEach(line => {
    if (line.sub_materials && line.sub_materials.length > 0) {
      line.sub_materials.forEach(sm => {
        if (!sm.material_code) return;
        if (!matMap[sm.material_code]) matMap[sm.material_code] = 0;
        matMap[sm.material_code] += (sm.weight_g || 0) * (line.quantity || 1);
      });
    } else if (line.material_code) {
      if (!matMap[line.material_code]) matMap[line.material_code] = 0;
      matMap[line.material_code] += (line.weight_g || 0) * (line.quantity || 1);
    }
  });

  // Header tabella materiali
  const mCols = [
    { label: 'Codice',      w: 28, r: false },
    { label: 'Materiale',   w: 55, r: false },
    { label: 'Brand',       w: 35, r: false },
    { label: 'Colore',      w: 28, r: false },
    { label: 'Peso tot.(g)',w: 28, r: true  },
    { label: '€/g',        w: 22, r: true  },
    { label: 'Costo mat.',  w: 28, r: true  },
  ];
  let mx = M;
  const mColsX = mCols.map(c => { const x = mx; mx += c.w; return x; });

  const mhH = 7;
  doc.setFillColor(...C.dark);
  doc.rect(M, y, pageW - M * 2, mhH, 'F');
  setFont(doc, 6.5, 'bold', C.white);
  mCols.forEach((col, i) => {
    const tx = col.r ? mColsX[i] + col.w - 1 : mColsX[i] + 2;
    doc.text(col.label, tx, y + 4.8, { align: col.r ? 'right' : 'left' });
  });
  y += mhH;

  Object.entries(matMap).forEach(([code, totalWeight], ri) => {
    const mat = materials.find(m => m.code === code);
    if (!mat) return;
    const rh = 7;
    if (ri % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(M, y, pageW - M * 2, rh, 'F');
    }
    setFont(doc, 7, 'normal', C.dark);
    const matCost = totalWeight * 1.05 * (mat.price_per_gram || 0);
    const vals = [
      mat.code || '',
      mat.material_name || '—',
      mat.brand || '—',
      mat.color || '—',
      fmt(totalWeight, 1),
      EUR(mat.price_per_gram || 0),
      EUR(matCost),
    ];
    vals.forEach((v, i) => {
      const tx = mCols[i].r ? mColsX[i] + mCols[i].w - 1 : mColsX[i] + 2;
      doc.text(v, tx, y + 4.8, { align: mCols[i].r ? 'right' : 'left' });
    });
    hLine(doc, M, y + rh, pageW - M, C.border);
    y += rh;
  });

  if (Object.keys(matMap).length === 0) {
    setFont(doc, 7, 'normal', C.gray);
    doc.text('Nessun materiale specificato.', M + 2, y + 5);
    y += 10;
  }

  // Footer pag 1
  doc.setFillColor(...C.dark);
  doc.rect(0, pageH - 8, pageW, 8, 'F');
  setFont(doc, 6, 'normal', [160, 165, 180]);
  doc.text('Pagina 1 — continua sul retro con il dettaglio costi', pageW / 2, pageH - 3.5, { align: 'center' });
}

// ── PAGINA 2: Tabella costi + riepilogo ──────────────────────────────────────
function drawDetailPage(doc, { clientName, paymentTerms, lines, materials, config }) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16;

  // Mini header
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, pageW, 6, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, 6, pageH, 'F');

  doc.setFillColor(...C.dark);
  doc.rect(6, 0, pageW - 6, 14, 'F');
  setFont(doc, 8, 'bold', C.white);
  doc.text('DETTAGLIO COSTI', M, 9);
  setFont(doc, 7, 'normal', [160, 165, 180]);
  doc.text(`Cliente: ${clientName || '—'}`, pageW - M, 9, { align: 'right' });

  let y = 20;

  // Colonne tabella costi
  const cols = [
    { label: '#',          w: 7,  align: 'center' },
    { label: 'Componente', w: 44, align: 'left'   },
    { label: 'Materiale',  w: 38, align: 'left'   },
    { label: 'g',          w: 14, align: 'right'  },
    { label: 'Stampa',     w: 15, align: 'right'  },
    { label: 'MDO',        w: 12, align: 'right'  },
    { label: 'Qtà',        w: 10, align: 'right'  },
    { label: 'Mat.€',      w: 17, align: 'right'  },
    { label: 'Macch.€',    w: 17, align: 'right'  },
    { label: 'MDO€',       w: 14, align: 'right'  },
    { label: '+Fail€',     w: 14, align: 'right'  },
    { label: 'Markup',     w: 14, align: 'right'  },
    { label: 'Totale',     w: 19, align: 'right'  },
    { label: 'Al pz',      w: 17, align: 'right'  },
  ];
  let cx = M;
  const colsX = cols.map(c => { const x = cx; cx += c.w; return x; });

  const drawHeader = (yy) => {
    const hh = 8;
    doc.setFillColor(...C.dark);
    doc.rect(M, yy, pageW - M * 2, hh, 'F');
    setFont(doc, 6.2, 'bold', C.white);
    cols.forEach((col, i) => {
      const tx = col.align === 'right' ? colsX[i] + col.w - 1
        : col.align === 'center' ? colsX[i] + col.w / 2
        : colsX[i] + 1;
      doc.text(col.label, tx, yy + 5.2, { align: col.align });
    });
    return yy + hh;
  };

  y = drawHeader(y);

  let totalFinal = 0, totalMat = 0, totalMachine = 0, totalLabor = 0;
  let rowIdx = 0;
  const validLines = lines.filter(l => l.part_name);

  validLines.forEach((line, li) => {
    const material = materials.find(m => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials);
    totalFinal += calc.finalPrice;
    totalMat += calc.materialCost;
    totalMachine += calc.machineCost;
    totalLabor += calc.laborCost;

    const hasSubMat = line.sub_materials && line.sub_materials.length > 0;
    let matLabel = hasSubMat
      ? line.sub_materials.map(sm => {
          const m = materials.find(x => x.code === sm.material_code);
          return m ? `${m.material_name} ${sm.weight_g}g` : sm.material_code;
        }).join(' + ')
      : material ? `${material.material_name}${material.color ? ' ' + material.color : ''}` : '—';

    const matLines = doc.splitTextToSize(matLabel, cols[2].w - 2);
    const compLines = doc.splitTextToSize(line.part_name || '', cols[1].w - 2);
    const dynH = Math.max(matLines.length, compLines.length) * 4.2 + 3;

    if (y + dynH > pageH - 48) {
      doc.addPage();
      doc.setFillColor(...C.primary);
      doc.rect(0, 0, 6, pageH, 'F');
      doc.setFillColor(...C.dark);
      doc.rect(6, 0, pageW - 6, 14, 'F');
      setFont(doc, 8, 'bold', C.white);
      doc.text('DETTAGLIO COSTI (continua)', M, 9);
      y = 20;
      y = drawHeader(y);
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(M, y, pageW - M * 2, dynH, 'F');
    }

    setFont(doc, 6.5, 'normal', C.dark);
    const ty = y + 4.5;
    doc.text(String(li + 1), colsX[0] + cols[0].w / 2, ty, { align: 'center' });
    doc.text(compLines, colsX[1] + 1, ty);
    doc.text(matLines, colsX[2] + 1, ty);

    const nums = [
      fmt(line.weight_g, 1),
      `${fmt(line.print_time_min, 0)}m`,
      `${fmt(line.labor_time_min, 0)}m`,
      String(line.quantity || 1),
      EUR(calc.materialCost),
      EUR(calc.machineCost),
      EUR(calc.laborCost),
      EUR(calc.costWithFailRate),
      `x${fmt(calc.markup, 2)}`,
      EUR(calc.finalPrice),
      EUR(calc.finalPricePerUnit),
    ];
    nums.forEach((val, ni) => {
      doc.text(val, colsX[3 + ni] + cols[3 + ni].w - 1, ty, { align: 'right' });
    });

    hLine(doc, M, y + dynH, pageW - M, C.border);
    y += dynH;
    rowIdx++;
  });

  // ── Riepilogo
  y += 6;
  if (y > pageH - 65) {
    doc.addPage();
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, 6, pageH, 'F');
    y = 16;
  }

  const sW = 82;
  const sX = pageW - M - sW;

  setFont(doc, 7.5, 'bold', C.primary);
  doc.text('RIEPILOGO ECONOMICO', sX, y);
  y += 3;
  hLine(doc, sX, y, pageW - M, C.primary, 0.5);
  y += 5;

  const drawRow = (label, value, bold = false, highlight = false) => {
    const rh = 8;
    if (highlight) {
      doc.setFillColor(...C.primary);
      doc.roundedRect(sX, y - 5.5, sW, rh + 1, 2, 2, 'F');
      doc.setTextColor(...C.white);
    } else {
      doc.setFillColor(...C.light);
      doc.rect(sX, y - 5.5, sW, rh, 'F');
      doc.setTextColor(...C.dark);
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(highlight ? 8 : 7);
    doc.text(label, sX + 4, y);
    doc.text(value, sX + sW - 4, y, { align: 'right' });
    y += rh + 1;
  };

  drawRow('Costo Materiali', EUR(totalMat));
  drawRow('Costo Macchina', EUR(totalMachine));
  drawRow('Manodopera', EUR(totalLabor));
  drawRow('Subtotale (IVA escl.)', EUR(totalFinal), true);
  drawRow('IVA 22%', EUR(totalFinal * 0.22));
  drawRow('TOTALE IVA INCLUSA', EUR(totalFinal * 1.22), true, true);

  y += 3;
  setFont(doc, 6.5, 'normal', C.gray);
  const ptLines = doc.splitTextToSize(`Pagamento: ${paymentTerms || '—'}`, sW);
  doc.text(ptLines, sX, y);

  // Note
  setFont(doc, 6.5, 'bold', C.gray);
  doc.text('NOTE', M, pageH - 28);
  setFont(doc, 6, 'normal', C.gray);
  doc.text('• Prezzi IVA esclusa salvo dove indicato.', M, pageH - 22);
  doc.text('• Validità preventivo: 30 giorni dalla data di emissione.', M, pageH - 17);
  doc.text('• I pesi includono il 5% di materiale di scarto.', M, pageH - 12);

  // Footer
  doc.setFillColor(...C.dark);
  doc.rect(0, pageH - 8, pageW, 8, 'F');
  setFont(doc, 6, 'normal', [160, 165, 180]);
  doc.text('3D Price  •  Documento generato automaticamente', pageW / 2, pageH - 3.5, { align: 'center' });
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
export function generateQuotePdf({ clientName, paymentTerms, date, lines, materials, config }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  drawCoverPage(doc, { clientName, paymentTerms, date, lines, materials, config });

  doc.addPage();
  drawDetailPage(doc, { clientName, paymentTerms, date, lines, materials, config });

  const safeName = (clientName || 'preventivo').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`preventivo_${safeName}_${dateStr}.pdf`);
}