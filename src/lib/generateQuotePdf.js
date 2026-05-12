import jsPDF from 'jspdf';
import { calculateLinePrice } from './pricingEngine';

const EUR = (v) => `€${parseFloat(v || 0).toFixed(2)}`;

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

export function generateQuotePdf({ clientName, paymentTerms, date, lines, materials, config }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16;

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, 5, pageH, 'F');

  setFont(doc, 18, 'bold', C.white);
  doc.text('PREVENTIVO', M + 2, 20);

  const fmtDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  setFont(doc, 8, 'normal', [255, 220, 190]);
  doc.text(`Cliente: ${clientName || '—'}`, M + 2, 28);
  doc.text(`Data: ${fmtDate}`, M + 2, 34);
  setFont(doc, 7, 'normal', [255, 220, 190]);
  doc.text(`Pagamento: ${paymentTerms || '—'}`, pageW - M, 28, { align: 'right' });

  let y = 50;

  // ── Tabella ───────────────────────────────────────────────────────────────────
  const cols = [
    { label: 'Componente', w: 70, align: 'left' },
    { label: 'Materiale',  w: 60, align: 'left' },
    { label: 'Qtà',        w: 20, align: 'right' },
    { label: 'Prezzo',     w: 30, align: 'right' },
  ];

  const usableW = pageW - M * 2;
  let cx = M;
  const colsX = cols.map(c => { const x = cx; cx += c.w; return x; });

  const drawHeader = (yy) => {
    doc.setFillColor(...C.dark);
    doc.rect(M, yy, usableW, 8, 'F');
    setFont(doc, 7, 'bold', C.white);
    cols.forEach((col, i) => {
      const tx = col.align === 'right' ? colsX[i] + col.w - 2 : colsX[i] + 2;
      doc.text(col.label, tx, yy + 5.2, { align: col.align });
    });
    return yy + 8;
  };

  y = drawHeader(y);

  const validLines = lines.filter(l => l.part_name);
  let totalFinal = 0;
  let rowIdx = 0;

  validLines.forEach((line, li) => {
    const material = materials.find(m => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials);
    totalFinal += calc.finalPrice;

    const hasSubMat = line.sub_materials && line.sub_materials.length > 0;
    let matLabel = hasSubMat
      ? line.sub_materials.map(sm => {
          const m = materials.find(x => x.code === sm.material_code);
          return m ? `${m.material_name} ${m.color || ''}`.trim() : sm.material_code;
        }).join(' + ')
      : material ? `${material.material_name}${material.color ? ' ' + material.color : ''}` : '—';

    const compLines = doc.splitTextToSize(line.part_name || '', cols[0].w - 4);
    const matLines = doc.splitTextToSize(matLabel, cols[1].w - 4);
    const dynH = Math.max(compLines.length, matLines.length) * 4.5 + 4;

    if (y + dynH > pageH - 50) {
      doc.addPage();
      doc.setFillColor(...C.dark);
      doc.rect(0, 0, 5, pageH, 'F');
      y = 16;
      y = drawHeader(y);
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(M, y, usableW, dynH, 'F');
    }

    setFont(doc, 7, 'normal', C.dark);
    const ty = y + 5;
    doc.text(compLines, colsX[0] + 2, ty);
    doc.text(matLines, colsX[1] + 2, ty);
    doc.text(String(line.quantity || 1), colsX[2] + cols[2].w - 2, ty, { align: 'right' });
    doc.text(EUR(calc.finalPrice), colsX[3] + cols[3].w - 2, ty, { align: 'right' });

    hLine(doc, M, y + dynH, pageW - M, C.border);
    y += dynH;
    rowIdx++;
  });

  // ── Totale ────────────────────────────────────────────────────────────────────
  y += 6;

  const totW = 80;
  const totX = pageW - M - totW;

  const drawTotRow = (label, value, highlight = false) => {
    const rh = 9;
    if (highlight) {
      doc.setFillColor(...C.primary);
      doc.roundedRect(totX, y - 6, totW, rh, 2, 2, 'F');
      setFont(doc, 8, 'bold', C.white);
    } else {
      doc.setFillColor(...C.light);
      doc.rect(totX, y - 6, totW, rh, 'F');
      setFont(doc, 7.5, 'normal', C.dark);
    }
    doc.text(label, totX + 4, y);
    doc.text(value, totX + totW - 4, y, { align: 'right' });
    y += rh + 1;
  };

  drawTotRow('Subtotale (IVA esclusa)', EUR(totalFinal));
  drawTotRow('IVA 22%', EUR(totalFinal * 0.22));
  drawTotRow('TOTALE IVA INCLUSA', EUR(totalFinal * 1.22), true);

  // ── Note ──────────────────────────────────────────────────────────────────────
  setFont(doc, 6, 'normal', C.gray);
  doc.text('• Prezzi IVA esclusa salvo dove indicato.', M, pageH - 22);
  doc.text('• Validità preventivo: 30 giorni dalla data di emissione.', M, pageH - 17);

  // ── Footer ────────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, pageH - 8, pageW, 8, 'F');
  setFont(doc, 6, 'normal', [160, 165, 180]);
  doc.text('Documento generato automaticamente', pageW / 2, pageH - 3.5, { align: 'center' });

  const safeName = (clientName || 'preventivo').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`preventivo_${safeName}_${dateStr}.pdf`);
}