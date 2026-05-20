import jsPDF from 'jspdf';
import { calculateLinePrice, computeMaterialTotals } from './pricingEngine';

const EUR = (v) => `€${parseFloat(v || 0).toFixed(2)}`;
const PCT = (v) => `${parseFloat(v || 0).toFixed(1)}%`;

const C = {
  primary:  [220, 90, 20],
  dark:     [22, 24, 35],
  gray:     [100, 105, 120],
  light:    [246, 247, 250],
  rowAlt:   [250, 251, 254],
  border:   [220, 223, 230],
  white:    [255, 255, 255],
  green:    [22, 163, 74],
  greenBg:  [240, 253, 244],
  red:      [220, 38, 38],
  yellow:   [161, 98, 7],
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

export function generateCostReportPdf({ clientName, date, lines, materials, config, setupPoints = 0 }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16;

  const fmtDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── Header ────────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, 5, pageH, 'F');

  setFont(doc, 16, 'bold', C.white);
  doc.text('REPORT COSTI & MARGINI', M + 2, 18);
  setFont(doc, 8, 'normal', [180, 185, 200]);
  doc.text(`Cliente: ${clientName || '—'}`, M + 2, 27);
  doc.text(`Data: ${fmtDate}`, M + 2, 33);
  setFont(doc, 7, 'normal', [160, 165, 180]);
  doc.text('DOCUMENTO INTERNO — USO RISERVATO', pageW - M, 33, { align: 'right' });

  let y = 46;

  // ── Calcoli aggregati ─────────────────────────────────────────────────────────
  const materialTotals = computeMaterialTotals(lines);
  const validLines = lines.filter(l => l.part_name && l.material_code);

  let grandMaterialCost = 0;
  let grandMachineCost = 0;
  let grandLaborCost = 0;
  let grandProductionCost = 0;
  let grandCostWithFail = 0;
  let grandRevenue = 0;

  const lineData = validLines.map(line => {
    const material = materials.find(m => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials, materialTotals);
    grandMaterialCost += calc.materialCost * line.quantity;
    grandMachineCost += calc.machineCost * line.quantity;
    grandLaborCost += calc.laborCost * line.quantity;
    grandProductionCost += calc.productionCost * line.quantity;
    grandCostWithFail += calc.costWithFailRate * line.quantity;
    grandRevenue += calc.finalPrice;
    return { line, calc, material };
  });

  const setupCost = setupPoints * 15;
  // L'attrezzaggio è puro ricavo (nessun costo di produzione aggiuntivo imputato)
  const totalRevenue = grandRevenue + setupCost;
  const totalCost = grandCostWithFail;
  const grossProfit = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // ── Pannello KPI in alto ───────────────────────────────────────────────────────
  const kpis = [
    { label: 'Ricavo netto (IVA esclusa)', value: EUR(totalRevenue), color: C.dark },
    { label: 'Costo totale di produzione', value: EUR(totalCost), color: C.dark },
    { label: 'Margine lordo', value: EUR(grossProfit), color: grossProfit >= 0 ? C.green : C.red },
    { label: 'Margine %', value: PCT(marginPct), color: marginPct >= 20 ? C.green : marginPct >= 10 ? C.yellow : C.red },
  ];

  const kpiW = (pageW - M * 2 - 6 * 3) / 4;
  kpis.forEach((kpi, i) => {
    const kx = M + i * (kpiW + 6);
    doc.setFillColor(...C.light);
    doc.roundedRect(kx, y, kpiW, 22, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(kx, y, kpiW, 22, 2, 2, 'S');
    setFont(doc, 6.5, 'normal', C.gray);
    doc.text(kpi.label, kx + 4, y + 7);
    setFont(doc, 13, 'bold', kpi.color);
    doc.text(kpi.value, kx + 4, y + 18);
  });

  y += 30;

  // ── Breakdown costi ───────────────────────────────────────────────────────────
  const brkW = 90;
  const brkX = M;

  const brkRows = [
    { label: 'Materiali (netti)', value: grandMaterialCost },
    { label: 'Macchina / ammortamento', value: grandMachineCost },
    { label: 'Manodopera', value: grandLaborCost },
    { label: 'Costo produzione', value: grandProductionCost, bold: true },
    { label: `Margine fail rate (${((config?.fail_rate || 0.07) * 100).toFixed(0)}%)`, value: grandCostWithFail - grandProductionCost },
    { label: 'Costo totale (fail incluso)', value: grandCostWithFail, bold: true },
    { label: `Attrezzaggio (${setupPoints} pt)`, value: setupCost, hidden: setupCost === 0 },
    { label: 'RICAVO NETTO', value: totalRevenue, highlight: true },
    { label: 'MARGINE LORDO', value: grossProfit, highlight: true, profit: true },
  ];

  // Titolo sezione
  setFont(doc, 8, 'bold', C.dark);
  doc.text('Riepilogo Costi', brkX, y);
  y += 5;

  brkRows.forEach(row => {
    if (row.hidden) return;
    const rh = 7.5;
    if (row.highlight) {
      const col = row.profit
        ? (grossProfit >= 0 ? C.green : C.red)
        : C.primary;
      doc.setFillColor(...col);
      doc.rect(brkX, y - 5.5, brkW, rh, 'F');
      setFont(doc, 8, 'bold', C.white);
    } else if (row.bold) {
      doc.setFillColor(...C.border);
      doc.rect(brkX, y - 5.5, brkW, rh, 'F');
      setFont(doc, 7.5, 'bold', C.dark);
    } else {
      doc.setFillColor(...C.light);
      doc.rect(brkX, y - 5.5, brkW, rh, 'F');
      setFont(doc, 7, 'normal', C.dark);
    }
    doc.text(row.label, brkX + 3, y);
    doc.text(EUR(row.value), brkX + brkW - 3, y, { align: 'right' });
    hLine(doc, brkX, y + 2, brkX + brkW, C.border);
    y += rh;
  });

  // ── Tabella dettaglio righe ───────────────────────────────────────────────────
  const tableX = M + brkW + 10;
  const tableW = pageW - M - tableX;

  const cols = [
    { label: 'Componente',   w: tableW * 0.22, align: 'left' },
    { label: 'Mat.',         w: tableW * 0.16, align: 'left' },
    { label: 'Qtà',          w: tableW * 0.05, align: 'right' },
    { label: 'Mat. €',       w: tableW * 0.08, align: 'right' },
    { label: 'Macch. €',     w: tableW * 0.08, align: 'right' },
    { label: 'MDO €',        w: tableW * 0.08, align: 'right' },
    { label: 'C.Prod.',      w: tableW * 0.08, align: 'right' },
    { label: '+Fail',        w: tableW * 0.08, align: 'right' },
    { label: 'Markup',       w: tableW * 0.07, align: 'right' },
    { label: 'Ricavo',       w: tableW * 0.10, align: 'right' },
  ];

  let ty = M + 46; // allinea con l'inizio del breakdown
  let cx2 = tableX;
  const colsX = cols.map(c => { const x = cx2; cx2 += c.w; return x; });

  // Header tabella
  doc.setFillColor(...C.dark);
  doc.rect(tableX, ty, tableW, 7, 'F');
  setFont(doc, 6, 'bold', C.white);
  cols.forEach((col, i) => {
    const tx = col.align === 'right' ? colsX[i] + col.w - 1.5 : colsX[i] + 1.5;
    doc.text(col.label, tx, ty + 4.5, { align: col.align });
  });
  ty += 7;

  lineData.forEach(({ line, calc }, idx) => {
    const rh = 6.5;
    if (ty + rh > pageH - 20) {
      doc.addPage();
      doc.setFillColor(...C.primary);
      doc.rect(0, 0, 5, pageH, 'F');
      ty = 16;
      // re-draw header
      doc.setFillColor(...C.dark);
      doc.rect(tableX, ty, tableW, 7, 'F');
      setFont(doc, 6, 'bold', C.white);
      cols.forEach((col, i) => {
        const tx = col.align === 'right' ? colsX[i] + col.w - 1.5 : colsX[i] + 1.5;
        doc.text(col.label, tx, ty + 4.5, { align: col.align });
      });
      ty += 7;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(tableX, ty, tableW, rh, 'F');
    }

    const hasSubMat = line.sub_materials && line.sub_materials.length > 0;
    const matLabel = hasSubMat
      ? line.sub_materials.map(sm => {
          const m = materials.find(x => x.code === sm.material_code);
          return m ? `${m.material_name}`.trim() : sm.material_code;
        }).join('+')
      : (calc.material ? `${calc.material.material_name}` : (materials.find(m => m.code === line.material_code)?.material_name || line.material_code || '—'));

    setFont(doc, 6, 'normal', C.dark);
    const rY = ty + 4.2;

    const values = [
      doc.splitTextToSize(line.part_name || '', cols[0].w - 3)[0],
      doc.splitTextToSize(matLabel, cols[1].w - 3)[0],
      String(line.quantity || 1),
      EUR(calc.materialCost * line.quantity),
      EUR(calc.machineCost * line.quantity),
      EUR(calc.laborCost * line.quantity),
      EUR(calc.productionCost * line.quantity),
      EUR(calc.costWithFailRate * line.quantity),
      `×${calc.markup.toFixed(2)}`,
      EUR(calc.finalPrice),
    ];

    cols.forEach((col, i) => {
      const tx = col.align === 'right' ? colsX[i] + col.w - 1.5 : colsX[i] + 1.5;
      doc.text(values[i] || '', tx, rY, { align: col.align });
    });

    hLine(doc, tableX, ty + rh, tableX + tableW, C.border);
    ty += rh;
  });

  // ── Footer ────────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, pageH - 8, pageW, 8, 'F');
  setFont(doc, 6, 'normal', [160, 165, 180]);
  doc.text('Report interno — Non destinato al cliente', pageW / 2, pageH - 3.5, { align: 'center' });

  const safeName = (clientName || 'report').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`report_costi_${safeName}_${dateStr}.pdf`);
}