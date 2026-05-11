import jsPDF from 'jspdf';
import { calculateLinePrice } from './pricingEngine';

const EUR = (v) => `€${parseFloat(v || 0).toFixed(2)}`;
const fmt = (v, d = 2) => parseFloat(v || 0).toFixed(d);

export function generateQuotePdf({ clientName, paymentTerms, date, lines, materials, config }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // ── Colori
  const primary = [220, 90, 20];   // arancio
  const dark = [30, 30, 40];
  const light = [245, 246, 248];
  const muted = [120, 120, 135];

  // ── Header band
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PREVENTIVO', margin, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data: ${date || new Date().toLocaleDateString('it-IT')}`, pageW - margin, 10, { align: 'right' });
  doc.text(`Pagamento: ${paymentTerms || ''}`, pageW - margin, 16, { align: 'right' });
  y = 28;

  // ── Cliente
  doc.setFillColor(...light);
  doc.roundedRect(margin, y, pageW - margin * 2, 10, 2, 2, 'F');
  doc.setTextColor(...muted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', margin + 4, y + 4.5);
  doc.setTextColor(...dark);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(clientName || '—', margin + 24, y + 6.5);
  y += 16;

  // ── Intestazione tabella
  const cols = [
    { label: '#',           w: 8,  align: 'center' },
    { label: 'Componente',  w: 52, align: 'left'   },
    { label: 'Materiale',   w: 52, align: 'left'   },
    { label: 'Peso (g)',    w: 20, align: 'right'  },
    { label: 'T.Stampa',   w: 18, align: 'right'  },
    { label: 'T.MDO',      w: 14, align: 'right'  },
    { label: 'Qtà',        w: 12, align: 'right'  },
    { label: 'Mat. €',     w: 18, align: 'right'  },
    { label: 'Macch. €',   w: 18, align: 'right'  },
    { label: 'MDO €',      w: 16, align: 'right'  },
    { label: '+Fail €',    w: 16, align: 'right'  },
    { label: 'Markup',     w: 14, align: 'right'  },
    { label: 'Totale',     w: 20, align: 'right'  },
    { label: 'Al pz',      w: 18, align: 'right'  },
  ];

  // calcola x per ogni colonna
  let cx = margin;
  const colsX = cols.map(c => { const x = cx; cx += c.w; return x; });

  const rowH = 7;
  const headerH = 8;
  doc.setFillColor(...dark);
  doc.rect(margin, y, pageW - margin * 2, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  cols.forEach((col, i) => {
    const tx = col.align === 'right'
      ? colsX[i] + col.w - 1
      : col.align === 'center'
        ? colsX[i] + col.w / 2
        : colsX[i] + 1;
    doc.text(col.label, tx, y + 5.2, { align: col.align });
  });
  y += headerH;

  // ── Righe
  let totalFinal = 0;
  let totalMat = 0, totalMachine = 0, totalLabor = 0;
  let rowIdx = 0;

  const validLines = lines.filter(l => l.part_name);

  validLines.forEach((line, li) => {
    const material = materials.find(m => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials);
    totalFinal += calc.finalPrice;
    totalMat += calc.materialCost;
    totalMachine += calc.machineCost;
    totalLabor += calc.laborCost;

    // Materiale label
    const hasSubMaterials = line.sub_materials && line.sub_materials.length > 0;
    let matLabel = '';
    if (hasSubMaterials) {
      matLabel = line.sub_materials.map(sm => {
        const m = materials.find(x => x.code === sm.material_code);
        return m ? `${m.material_name} (${sm.weight_g}g)` : sm.material_code;
      }).join(', ');
    } else {
      matLabel = material ? `${material.material_name}${material.color ? ' (' + material.color + ')' : ''}` : '—';
    }

    // Altezza riga dinamica se matLabel è lungo
    const matLines = doc.splitTextToSize(matLabel, cols[2].w - 2);
    const compLines = doc.splitTextToSize(line.part_name || '', cols[1].w - 2);
    const dynH = Math.max(matLines.length, compLines.length) * 4.5 + 2;

    // Nuovo pagina se serve
    if (y + dynH > pageH - 30) {
      doc.addPage();
      y = margin;
      // ripeti header
      doc.setFillColor(...dark);
      doc.rect(margin, y, pageW - margin * 2, headerH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      cols.forEach((col, i) => {
        const tx = col.align === 'right'
          ? colsX[i] + col.w - 1
          : col.align === 'center'
            ? colsX[i] + col.w / 2
            : colsX[i] + 1;
        doc.text(col.label, tx, y + 5.2, { align: col.align });
      });
      y += headerH;
    }

    // Sfondo zebra
    if (rowIdx % 2 === 1) {
      doc.setFillColor(248, 249, 252);
      doc.rect(margin, y, pageW - margin * 2, dynH, 'F');
    }

    doc.setTextColor(...dark);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');

    const textY = y + 4.5;

    // # 
    doc.text(String(li + 1), colsX[0] + cols[0].w / 2, textY, { align: 'center' });
    // Componente
    doc.text(compLines, colsX[1] + 1, textY);
    // Materiale
    doc.text(matLines, colsX[2] + 1, textY);
    // Numeri
    const nums = [
      fmt(line.weight_g, 1),
      fmt(line.print_time_min, 0),
      fmt(line.labor_time_min, 0),
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
      doc.text(val, colsX[3 + ni] + cols[3 + ni].w - 1, textY, { align: 'right' });
    });

    // bordo riga
    doc.setDrawColor(220, 222, 228);
    doc.line(margin, y + dynH, pageW - margin, y + dynH);

    y += dynH;
    rowIdx++;
  });

  // ── Totali
  y += 4;
  const summaryX = pageW - margin - 70;
  const summaryW = 70;

  const drawSummaryRow = (label, value, bold = false, highlight = false) => {
    if (highlight) {
      doc.setFillColor(...primary);
      doc.rect(summaryX, y - 4, summaryW, 7, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(...light);
      doc.rect(summaryX, y - 4, summaryW, 7, 'F');
      doc.setTextColor(...dark);
    }
    doc.setFontSize(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, summaryX + 3, y);
    doc.text(value, summaryX + summaryW - 3, y, { align: 'right' });
    y += 7.5;
  };

  drawSummaryRow('Costo Materiali', EUR(totalMat));
  drawSummaryRow('Costo Macchina', EUR(totalMachine));
  drawSummaryRow('Manodopera', EUR(totalLabor));
  const vat = totalFinal * 0.22;
  drawSummaryRow('Subtotale (IVA escl.)', EUR(totalFinal));
  drawSummaryRow('IVA 22%', EUR(vat));
  drawSummaryRow('TOTALE', EUR(totalFinal + vat), true, true);

  // ── Footer
  doc.setTextColor(...muted);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento generato automaticamente — valido 30 giorni dalla data di emissione', pageW / 2, pageH - 6, { align: 'center' });

  // ── Salva
  const safeName = (clientName || 'preventivo').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`preventivo_${safeName}_${dateStr}.pdf`);
}