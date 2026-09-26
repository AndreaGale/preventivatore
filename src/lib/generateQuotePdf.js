import jsPDF from 'jspdf';
import { calculateLinePrice } from './pricingEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Layout ispirato al preventivo ufficiale (Odoo) di 3D ShapeFarm / Materia SRL.
// Tutte le misure sono in mm su A4 (210 × 297).
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY = {
  address: ['Materia SRL', 'via S. Domenico, 11/13', 'Bareggio MI 20008', 'Italia', 'Partita IVA: IT14528140966'],
  footer: ['+39 350 1035751', 'info@3dshapefarm.com', 'IT14528140966'],
};

const VAT = 0.22;
const VALIDITY_DAYS = 30;

const C = {
  primary: [0, 87, 175],     // blu titoli / linee
  text:    [17, 24, 39],     // testo principale
  muted:   [108, 112, 121],  // testo secondario
  rowFill: [230, 238, 247],  // righe evidenziate tabella
  noteBox: [209, 236, 241],  // box condizioni
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 9.3;               // margine sinistro
const R = PAGE_W - M;        // margine destro
const CONTENT_BOTTOM = 258;  // oltre si va a pagina nuova (footer da ~265)
const BODY = 10.2;           // corpo testo (pt)
const LINE = 4.4;            // interlinea corpo (mm)
const ASC = 3.5;             // distanza top riga → baseline (mm)
const ROW_H = 9.26;          // altezza riga tabella
const PAD = 1.8;             // padding orizzontale celle

// Formato italiano sempre con separatore migliaia (es. 1.234,56)
const fmtNum = (v) => {
  const n = Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};
const fmtEur = (v) => `${fmtNum(v)} €`;
const fmtDate = (d) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ── Font / asset ─────────────────────────────────────────────────────────────
let FONT = 'helvetica';

function registerAssets(doc, assets) {
  if (!assets) return null;
  try {
    doc.addFileToVFS('Montserrat-Regular.ttf', assets.montserratRegular);
    doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
    doc.addFileToVFS('Montserrat-Medium.ttf', assets.montserratMedium);
    doc.addFont('Montserrat-Medium.ttf', 'Montserrat', 'medium');
    doc.addFileToVFS('Montserrat-Bold.ttf', assets.montserratBold);
    doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
    FONT = 'Montserrat';
  } catch (e) {
    console.warn('Font Montserrat non disponibile, uso Helvetica', e);
    FONT = 'helvetica';
  }
  return assets;
}

function setFont(doc, size = BODY, style = 'normal', color = C.text) {
  // Helvetica non ha il peso "medium": ripiega su normal
  const s = FONT === 'helvetica' && style === 'medium' ? 'normal' : style;
  doc.setFont(FONT, s);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...color);
  doc.rect(x, y, w, h, 'F');
}

function blueLine(doc, x1, y, x2) {
  fillRect(doc, x1, y, x2 - x1, 0.23, C.primary);
}

function polygon(doc, pts, color, opacity = 1) {
  const [x0, y0] = pts[0];
  const segs = pts.slice(1).map(([x, y], i) => [x - pts[i][0], y - pts[i][1]]);
  doc.setFillColor(...color);
  if (opacity < 1) doc.setGState(new doc.GState({ opacity }));
  doc.lines(segs, x0, y0, [1, 1], 'F', true);
  if (opacity < 1) doc.setGState(new doc.GState({ opacity: 1 }));
}

// ── Cornice di pagina (decorazioni, logo, intestazione, footer) ──────────────
function drawPageFrame(doc, assets) {
  // Fasce e triangoli azzurri trasparenti (si sovrappongono come nell'originale)
  polygon(doc, [[0, 0], [PAGE_W, 0], [PAGE_W, 3.4], [0, 13.2]], C.primary, 0.15);
  polygon(doc, [[0, 0], [15.6, 0], [0, 31.3]], C.primary, 0.15);
  polygon(doc, [[0, PAGE_H], [PAGE_W, PAGE_H], [PAGE_W, 283.8], [0, 293.6]], C.primary, 0.15);
  polygon(doc, [[PAGE_W, PAGE_H], [PAGE_W - 15.6, PAGE_H], [PAGE_W, PAGE_H - 31.3]], C.primary, 0.15);

  // Logo
  if (assets?.logoPng) {
    const w = 27.4;
    doc.addImage(assets.logoPng, 'PNG', 10.2, 20.5, w, w * assets.logoRatio);
  } else {
    setFont(doc, 13, 'bold', C.text);
    doc.text('3D SHAPEFARM', M, 26);
  }

  // Dati azienda (allineati a destra)
  setFont(doc, BODY, 'normal', C.text);
  COMPANY.address.forEach((t, i) => doc.text(t, R, 9.4 + ASC + i * 5.4, { align: 'right' }));

  // Footer contatti
  COMPANY.footer.forEach((t, i) => doc.text(t, M, 265.6 + ASC + i * 5.45));
}

function drawPageNumbers(doc) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    setFont(doc, BODY, 'normal', C.muted);
    doc.text(`Pagina ${p}/${n}`, R, 276.5 + ASC, { align: 'right' });
  }
}

// ── Documento ────────────────────────────────────────────────────────────────
export async function buildQuotePdf({ clientName, paymentTerms, date, lines, materials, config, setupPoints = 0 }) {
  let assets = null;
  try {
    assets = await import('./quotePdfAssets');
  } catch (e) {
    console.warn('Asset PDF non caricati', e);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  registerAssets(doc, assets);
  doc.setLineHeightFactor(1.22);

  const newPage = () => {
    doc.addPage();
    drawPageFrame(doc, assets);
    return 45;
  };

  drawPageFrame(doc, assets);

  // ── Cliente ────────────────────────────────────────────────────────────────
  setFont(doc, BODY, 'normal', C.text);
  const clientLines = doc.splitTextToSize((clientName || '—').toUpperCase(), 110);
  clientLines.forEach((t, i) => doc.text(t, M, 52.3 + ASC + i * LINE));

  let y = Math.max(66, 52.3 + clientLines.length * LINE + 6);

  // ── Titolo ─────────────────────────────────────────────────────────────────
  setFont(doc, 20.5, 'medium', C.primary);
  doc.text('Preventivo', M, y + 7.1);
  y += 11.9;

  // ── Info: data / scadenza / pagamento ──────────────────────────────────────
  const d = date ? new Date(date + 'T00:00:00') : new Date();
  const exp = new Date(d);
  exp.setDate(exp.getDate() + VALIDITY_DAYS);

  const info = [
    { x: M, label: 'Data preventivo', value: fmtDate(d) },
    { x: 73.2, label: 'Scadenza', value: fmtDate(exp) },
    { x: 137.0, label: 'Pagamento', value: paymentTerms || '—' },
  ];
  let infoH = 0;
  info.forEach(({ x, label, value }) => {
    setFont(doc, BODY, 'bold', C.primary);
    doc.text(label, x, y + ASC);
    setFont(doc, BODY, 'normal', C.text);
    const v = doc.splitTextToSize(value, R - x);
    v.forEach((t, i) => doc.text(t, x, y + 5.4 + ASC + i * LINE));
    infoH = Math.max(infoH, 5.4 + v.length * LINE);
  });
  y += infoH + 8;

  // ── Tabella ────────────────────────────────────────────────────────────────
  const cols = [
    { label: 'Descrizione',     x1: M,     x2: 92.0,  align: 'left' },
    { label: 'Quantità',        x1: 92.0,  x2: 116.0, align: 'right' },
    { label: 'Prezzo unitario', x1: 116.0, x2: 149.0, align: 'right' },
    { label: 'Imposte',         x1: 149.0, x2: 170.0, align: 'right' },
    { label: 'Importo',         x1: 170.0, x2: R,     align: 'right' },
  ];
  const cellX = (c) => (c.align === 'right' ? c.x2 - PAD : c.x1 + PAD);

  const drawHeader = (yy) => {
    setFont(doc, BODY, 'normal', C.primary);
    cols.forEach((c) => doc.text(c.label, cellX(c), yy + 2.2 + ASC, { align: c.align }));
    blueLine(doc, M, yy + 6.9, R);
    return yy + 6.9;
  };

  const rows = [];
  let subtotal = 0;
  lines.filter((l) => l.part_name).forEach((line) => {
    const material = materials.find((m) => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials);
    subtotal += calc.finalPrice;

    const hasSubMat = line.sub_materials && line.sub_materials.length > 0;
    const matLabel = hasSubMat
      ? line.sub_materials.map((sm) => {
          const m = materials.find((x) => x.code === sm.material_code);
          return m ? `${m.material_name} ${m.color || ''}`.trim() : sm.material_code;
        }).join(' + ')
      : material ? `${material.material_name}${material.color ? ' ' + material.color : ''}` : '';

    const qty = line.quantity || 1;
    rows.push({ title: line.part_name, sub: matLabel, qty, unit: calc.finalPrice / qty, total: calc.finalPrice });
  });

  const setupCost = setupPoints * 15;
  if (setupCost > 0) {
    rows.push({ title: 'Attrezzaggio e preparazione file', sub: `${setupPoints} punti`, qty: 1, unit: setupCost, total: setupCost });
    subtotal += setupCost;
  }

  y = drawHeader(y);

  const descW = cols[0].x2 - cols[0].x1 - PAD * 2;
  rows.forEach((row, i) => {
    setFont(doc, BODY, 'normal');
    const titleLines = doc.splitTextToSize(row.title, descW);
    setFont(doc, 8.5, 'normal');
    const subLines = row.sub ? doc.splitTextToSize(row.sub, descW) : [];
    const h = ROW_H + (titleLines.length - 1) * LINE + (subLines.length ? subLines.length * 3.6 - 1.2 : 0);

    if (y + h > CONTENT_BOTTOM) {
      blueLine(doc, M, y, R);
      y = drawHeader(newPage());
    }

    if (i % 2 === 0) fillRect(doc, M, y, R - M, h, C.rowFill);

    const ty = y + 2.4 + ASC;
    setFont(doc, BODY, 'normal', C.text);
    doc.text(titleLines, cellX(cols[0]), ty);
    doc.text(`${fmtNum(row.qty)} Unità`, cellX(cols[1]), ty, { align: 'right' });
    doc.text(fmtNum(row.unit), cellX(cols[2]), ty, { align: 'right' });
    doc.text(`${Math.round(VAT * 100)}%`, cellX(cols[3]), ty, { align: 'right' });
    doc.text(fmtEur(row.total), cellX(cols[4]), ty, { align: 'right' });

    if (subLines.length) {
      setFont(doc, 8.5, 'normal', C.muted);
      doc.text(subLines, cellX(cols[0]), ty + titleLines.length * LINE - 0.4);
    }
    y += h;
  });
  blueLine(doc, M, y, R);
  y += 0.2;

  // ── Totali ─────────────────────────────────────────────────────────────────
  const notes = [
    `Prezzi IVA esclusa salvo dove indicato.`,
    `Validità preventivo: ${VALIDITY_DAYS} giorni dalla data di emissione.`,
  ];
  setFont(doc, BODY, 'normal');
  const noteLines = notes.flatMap((n) => doc.splitTextToSize(n, R - M - 10.8));
  const totalsH = 3 * 9.1;
  const notesH = 9.6 + noteLines.length * LINE + 6;
  if (y + totalsH + notesH > CONTENT_BOTTOM) y = newPage();

  const tX = 146.6, tSplit = 172.0;
  const vat = subtotal * VAT;
  const totRows = [
    { label: 'Imponibile', value: fmtEur(subtotal), fill: true },
    { label: `IVA ${Math.round(VAT * 100)}%`, value: fmtEur(vat), fill: false },
    { label: 'Totale', value: fmtEur(subtotal + vat), fill: true, bold: true },
  ];
  // la colonna etichette si allarga se l'importo è lungo
  setFont(doc, BODY, 'bold');
  const valW = Math.max(R - tSplit, doc.getTextWidth(fmtEur(subtotal + vat)) + PAD * 2 + 1);
  const split = Math.min(tSplit, R - valW);
  const left = Math.min(tX, split - 23.3);

  totRows.forEach((r) => {
    if (r.fill) fillRect(doc, left, y, R - left, 9.1, C.rowFill);
    setFont(doc, BODY, r.bold ? 'bold' : 'normal', C.text);
    doc.text(r.label, left + PAD, y + 2.1 + ASC);
    doc.text(r.value, R - PAD, y + 2.1 + ASC, { align: 'right' });
    y += 9.1;
  });
  blueLine(doc, left, y, R);

  // ── Condizioni ─────────────────────────────────────────────────────────────
  y += 4.2;
  setFont(doc, BODY, 'normal', C.text);
  doc.text('Si applicano le seguenti condizioni di fornitura:', M, y + ASC);
  y += 5.3;

  const boxH = 5.8 + noteLines.length * LINE;
  doc.setFillColor(...C.noteBox);
  doc.roundedRect(M, y, R - M, boxH, 1.3, 1.3, 'F');
  setFont(doc, BODY, 'normal', C.primary);
  noteLines.forEach((t, i) => doc.text(t, M + 5.4, y + 2.9 + ASC + i * LINE));

  drawPageNumbers(doc);
  return doc;
}

export async function generateQuotePdf(params) {
  const doc = await buildQuotePdf(params);
  const safeName = (params.clientName || 'preventivo').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (params.date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`preventivo_${safeName}_${dateStr}.pdf`);
}
