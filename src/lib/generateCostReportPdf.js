import jsPDF from 'jspdf';
import { calculateLinePrice, computeMaterialTotals, isPricedLine } from './pricingEngine';

// ── Formattazione ───────────────────────────────────────────────────────────────
function fmtNum(v, decimals = 2) {
  const n = Number.isFinite(v) ? v : 0;
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped}${dec ? ',' + dec : ''}`;
}
const EUR = (v) => `€ ${fmtNum(v)}`;
const PCT = (v) => `${fmtNum(v, 1)}%`;

const C = {
  primary: [220, 90, 20],
  dark:    [22, 24, 35],
  gray:    [100, 105, 120],
  light:   [246, 247, 250],
  rowAlt:  [250, 251, 254],
  border:  [220, 223, 230],
  white:   [255, 255, 255],
  green:   [22, 163, 74],
  red:     [220, 38, 38],
  yellow:  [161, 98, 7],
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

const profitColor = (v) => (v >= 0 ? C.green : C.red);
const marginColor = (pct) => (pct >= 20 ? C.green : pct >= 10 ? C.yellow : C.red);

// ── Calcolo conto economico ─────────────────────────────────────────────────────
/**
 * Scompone ogni riga in voci che NON si sovrappongono.
 * Lo scarto (fail rate) è ripartito: la parte sui costi variabili è una voce a sé,
 * la parte sui costi fissi (ore macchina consumate dalle ristampe) resta dentro le voci fisse.
 * Somma costi variabili + costi fissi = costo di produzione con fail rate (motore prezzi).
 */
/**
 * Durata in giorni lavorativi e settimane di calendario.
 * Le settimane tengono conto dei giorni lavorativi al mese (es. 25 gg/mese ≈ 5,8 gg/settimana).
 */
export function formatDuration(workDays, daysPerMonth = 25) {
  if (!Number.isFinite(workDays) || workDays <= 0) return '—';
  const days = Math.ceil(workDays);
  const daysPerWeek = (daysPerMonth * 12) / 52;
  const weeks = workDays / daysPerWeek;
  const dayLabel = days === 1 ? '1 giorno lavorativo' : `${days} giorni lavorativi`;
  if (weeks < 1) return dayLabel;
  const w = Math.round(weeks * 2) / 2; // arrotonda alla mezza settimana
  const wStr = Number.isInteger(w) ? String(w) : String(w).replace('.', ',');
  return `${dayLabel} (~${wStr} ${w === 1 ? 'settimana' : 'settimane'})`;
}

export const DEFAULT_DEDICATED = { enabled: false, printers: 20, hours_per_day: 24, writeoff: true };

export function buildCostReport({ lines, materials, config, setupPoints = 0, dedicated = null }) {
  const fail = config?.fail_rate ?? 0.07;
  const taxRate = config?.tax_rate ?? 0.279;
  const materialTotals = computeMaterialTotals(lines);
  const validLines = lines.filter(isPricedLine);

  const rows = validLines.map((line) => {
    const qty = line.quantity || 1;
    const material = materials.find((m) => m.code === line.material_code);
    const calc = calculateLinePrice(line, material, config, materials, materialTotals);
    const mb = calc.machineBreakdown;

    const materialCost = calc.materialCost * qty;
    const energy = mb.energy * qty;
    const maintenance = mb.maintenance * qty;
    const labor = calc.laborCost * qty;
    const variableBase = materialCost + energy + maintenance + labor;
    const scrap = variableBase * fail;
    const variable = variableBase + scrap;

    const fixedStructure = mb.fixed * qty * (1 + fail);
    const depreciation = mb.depreciation * qty * (1 + fail);
    const fixed = fixedStructure + depreciation;

    const listPrice = calc.preDiscountTotal;
    const revenue = calc.finalPrice;
    const grossMargin = revenue - variable;
    const operatingProfit = grossMargin - fixed;

    return {
      line, qty, calc,
      materialCost, energy, maintenance, labor, scrap, variable,
      fixedStructure, depreciation, fixed,
      listPrice, discount: listPrice - revenue, revenue,
      grossMargin, operatingProfit,
      printHours: ((line.print_time_min || 0) / 60) * qty * (1 + fail),
      laborHours: ((line.labor_time_min || 0) / 60) * qty,
      grams: calc.weightWithWaste * qty,
    };
  });

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const setup = setupPoints * 15;

  const t = {
    listPrice: sum('listPrice'),
    discount: sum('discount'),
    components: sum('revenue'),
    setup,
    materialCost: sum('materialCost'),
    energy: sum('energy'),
    maintenance: sum('maintenance'),
    labor: sum('labor'),
    scrap: sum('scrap'),
    variable: sum('variable'),
    fixedStructure: sum('fixedStructure'),
    depreciation: sum('depreciation'),
    fixed: sum('fixed'),
    pieces: sum('qty'),
    printHours: sum('printHours'),
    laborHours: sum('laborHours'),
    kg: sum('grams') / 1000,
  };
  t.revenue = t.components + t.setup;
  t.totalCost = t.variable + t.fixed;
  t.grossMargin = t.revenue - t.variable;
  t.operatingProfit = t.grossMargin - t.fixed;
  t.taxes = Math.max(0, t.operatingProfit) * taxRate;
  t.netProfit = t.operatingProfit - t.taxes;
  t.grossMarginOnlyNet = t.grossMargin - Math.max(0, t.grossMargin) * taxRate;

  const farmHoursPerDay = (config?.num_printers || 0) * (config?.hours_per_day || 0) * (config?.farm_efficiency || 1);
  t.farmDays = farmHoursPerDay > 0 ? t.printHours / farmHoursPerDay : 0;

  return { rows, totals: t, fail, taxRate, scenario: computeDedicatedScenario(t, config, taxRate, dedicated) };
}

/**
 * Scenario "macchine dedicate": l'ordine gira su stampanti nuove comprate apposta.
 * I costi fissi esistenti sono già coperti dalla produzione attuale (quota = 0);
 * all'ordine si imputa il costo delle macchine nuove (tutto, oppure solo l'usura delle ore usate).
 */
export function computeDedicatedScenario(t, config, taxRate, dedicated) {
  if (!dedicated?.enabled) return null;
  const printers = Math.max(0, dedicated.printers || 0);
  const hpd = Math.max(0, dedicated.hours_per_day || 0);
  const days = config?.working_days_per_month || 25;
  const eff = config?.farm_efficiency || 1;
  const printerCost = config?.printer_cost || 0;
  const lifeHours = (config?.printer_lifespan_years || 4) * 12 * days * (config?.hours_per_day || 8);

  const purchase = printers * printerCost;
  const wear = lifeHours > 0 ? t.printHours * (printerCost / lifeHours) : 0;
  const machineCost = dedicated.writeoff ? purchase : Math.min(wear, purchase);

  const operatingProfit = t.grossMargin - machineCost;
  const taxes = Math.max(0, operatingProfit) * taxRate;
  const netProfit = operatingProfit - taxes;

  const monthlyCapacity = printers * hpd * days * eff;
  const months = monthlyCapacity > 0 ? t.printHours / monthlyCapacity : Infinity;
  const dailyCapacity = printers * hpd * eff;
  const workDays = dailyCapacity > 0 ? t.printHours / dailyCapacity : Infinity;
  const durationLabel = formatDuration(workDays, days);

  // Quanto si può scendere di prezzo (sui componenti) mantenendo lo stesso utile del caso standard
  const extraProfit = operatingProfit - t.operatingProfit;
  const maxDiscount = Math.max(0, extraProfit);
  const maxDiscountPct = t.components > 0 ? (maxDiscount / t.components) * 100 : 0;
  const maxDiscountPerPiece = t.pieces > 0 ? maxDiscount / t.pieces : 0;

  // Effetto sui preventivi futuri se le macchine restano in farm
  const curPrinters = config?.num_printers || 0;
  const fixedPerHourNow = (config?.monthly_fixed_costs || 0) / (days * (config?.hours_per_day || 8) * curPrinters * eff || 1);
  const fixedPerHourAfter = (config?.monthly_fixed_costs || 0) / (days * (config?.hours_per_day || 8) * (curPrinters + printers) * eff || 1);

  return {
    printers, hpd, days, eff, writeoff: !!dedicated.writeoff,
    purchase, wear, machineCost,
    operatingProfit, taxes, netProfit,
    months, workDays, durationLabel, maxDiscount, maxDiscountPct, maxDiscountPerPiece,
    curPrinters, fixedPerHourNow, fixedPerHourAfter,
  };
}

// ── PDF ─────────────────────────────────────────────────────────────────────────
export function generateCostReportPdf({ clientName, date, lines, materials, config, setupPoints = 0, dedicated = null }) {
  const { rows, totals: t, fail, taxRate, scenario: sc } = buildCostReport({ lines, materials, config, setupPoints, dedicated });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;
  const W = pageW - M * 2;
  const bottomLimit = pageH - 16;

  const fmtDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  const pct = (v) => (t.revenue > 0 ? (v / t.revenue) * 100 : 0);

  const drawPageChrome = () => {
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, 4, pageH, 'F');
    doc.setFillColor(...C.dark);
    doc.rect(0, pageH - 8, pageW, 8, 'F');
    setFont(doc, 6, 'normal', [160, 165, 180]);
    doc.text('Report interno — Non destinato al cliente — Importi IVA esclusa', pageW / 2, pageH - 3.5, { align: 'center' });
  };

  let y;
  const ensureSpace = (h, onNewPage) => {
    if (y + h > bottomLimit) {
      doc.addPage();
      drawPageChrome();
      y = 16;
      if (onNewPage) onNewPage();
    }
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  drawPageChrome();
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, 4, 30, 'F');
  setFont(doc, 15, 'bold', C.white);
  doc.text('REPORT COSTI & MARGINI', M, 14);
  setFont(doc, 8, 'normal', [180, 185, 200]);
  doc.text(`Cliente: ${clientName || '—'}`, M, 21);
  doc.text(`Data: ${fmtDate}`, M, 26);
  setFont(doc, 7, 'normal', [160, 165, 180]);
  doc.text('DOCUMENTO INTERNO — USO RISERVATO', pageW - M, 26, { align: 'right' });

  y = 38;

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const netPct = pct(t.netProfit);
  const kpis = [
    { label: 'Ricavo netto', value: EUR(t.revenue), sub: 'IVA esclusa', color: C.dark },
    { label: 'Costi totali', value: EUR(t.totalCost), sub: `${PCT(pct(t.totalCost))} del ricavo`, color: C.dark },
    { label: 'Margine lordo', value: EUR(t.grossMargin), sub: `${PCT(pct(t.grossMargin))} — ricavo meno costi variabili`, color: profitColor(t.grossMargin) },
    { label: 'UTILE NETTO — IN TASCA', value: EUR(t.netProfit), sub: `${PCT(netPct)} — dopo costi fissi e imposte`, color: profitColor(t.netProfit), strong: true },
  ];
  const gap = 4;
  const kpiW = (W - gap * 3) / 4;
  kpis.forEach((k, i) => {
    const kx = M + i * (kpiW + gap);
    if (k.strong) {
      doc.setFillColor(...k.color);
      doc.roundedRect(kx, y, kpiW, 22, 2, 2, 'F');
    } else {
      doc.setFillColor(...C.light);
      doc.roundedRect(kx, y, kpiW, 22, 2, 2, 'F');
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(kx, y, kpiW, 22, 2, 2, 'S');
    }
    setFont(doc, 6, 'bold', k.strong ? C.white : C.gray);
    doc.text(k.label, kx + 3, y + 5.5);
    setFont(doc, 12, 'bold', k.strong ? C.white : k.color);
    doc.text(k.value, kx + 3, y + 13.5);
    setFont(doc, 5.5, 'normal', k.strong ? C.white : C.gray);
    doc.text(doc.splitTextToSize(k.sub, kpiW - 6)[0], kx + 3, y + 19);
  });
  y += 29;

  // ── Conto economico della commessa ──────────────────────────────────────────
  const ceW = 118;
  const ceX = M;
  const colEur = ceX + ceW - 22;
  const colPct = ceX + ceW - 3;
  const sideX = ceX + ceW + 6;
  const sideW = pageW - M - sideX;
  const ceTop = y;

  setFont(doc, 9, 'bold', C.dark);
  doc.text('Conto economico della commessa', ceX, y);
  y += 3;

  doc.setFillColor(...C.dark);
  doc.rect(ceX, y, ceW, 5.5, 'F');
  setFont(doc, 6, 'bold', C.white);
  doc.text('Voce', ceX + 3, y + 3.8);
  doc.text('Importo', colEur, y + 3.8, { align: 'right' });
  doc.text('% ricavo', colPct, y + 3.8, { align: 'right' });
  y += 5.5;

  const section = (label) => {
    y += 1.5;
    setFont(doc, 6.5, 'bold', C.primary);
    doc.text(label.toUpperCase(), ceX + 3, y + 3.6);
    y += 5;
  };
  const item = (label, value, opts = {}) => {
    const rh = opts.total || opts.result ? 6.2 : 5.3;
    if (opts.result) {
      doc.setFillColor(...(opts.color || C.primary));
      doc.rect(ceX, y, ceW, rh, 'F');
      setFont(doc, 7.5, 'bold', C.white);
    } else if (opts.total) {
      doc.setFillColor(...C.border);
      doc.rect(ceX, y, ceW, rh, 'F');
      setFont(doc, 7, 'bold', C.dark);
    } else {
      setFont(doc, 6.8, 'normal', opts.muted ? C.gray : C.dark);
    }
    const ty = y + rh / 2 + 1.2;
    doc.text(label, ceX + (opts.total || opts.result ? 3 : 6), ty);
    doc.text(opts.negative ? `- ${EUR(value)}` : EUR(value), colEur, ty, { align: 'right' });
    if (!opts.noPct) doc.text(PCT(pct(value)), colPct, ty, { align: 'right' });
    if (!opts.total && !opts.result) hLine(doc, ceX + 3, y + rh, ceX + ceW, C.light);
    y += rh;
  };

  section('Ricavi');
  if (t.discount > 0.005) {
    item('Componenti a prezzo pieno', t.listPrice, { noPct: true, muted: true });
    item('Sconti partner / continuativo', t.discount, { negative: true, noPct: true, muted: true });
  }
  item('Componenti', t.components);
  if (t.setup > 0) item(`Attrezzaggio e preparazione file (${setupPoints} pt)`, t.setup);
  item('RICAVO NETTO', t.revenue, { total: true });

  section('Costi variabili (spesi solo per questa commessa)');
  item('Materiale (incl. 5% sfrido)', t.materialCost);
  item('Manodopera', t.labor);
  item('Energia elettrica', t.energy);
  item('Manutenzione e ricambi', t.maintenance);
  item(`Scarti e ristampe (${fmtNum(fail * 100, 0)}% sui costi sopra)`, t.scrap);
  item('Totale costi variabili', t.variable, { total: true });
  y += 1;
  item('MARGINE LORDO', t.grossMargin, { result: true, color: profitColor(t.grossMargin) });

  section('Costi fissi imputati (quota per ore macchina)');
  item('Costi di struttura (affitto, software, mkt…)', t.fixedStructure);
  item('Ammortamento stampanti', t.depreciation);
  item('Totale costi fissi', t.fixed, { total: true });
  y += 1;
  item('UTILE ANTE IMPOSTE', t.operatingProfit, { result: true, color: C.dark });
  item(`Imposte stimate (${fmtNum(taxRate * 100, 1)}% sull'utile)`, t.taxes, { negative: true });
  y += 1;
  item('UTILE NETTO — IN TASCA', t.netProfit, { result: true, color: profitColor(t.netProfit) });
  const ceBottom = y;

  // ── Colonna destra: dati commessa + lettura ──────────────────────────────────
  let sy = ceTop;
  setFont(doc, 9, 'bold', C.dark);
  doc.text('Dati commessa', sideX, sy);
  sy += 3;
  const facts = [
    ['Pezzi totali', fmtNum(t.pieces, 0)],
    ['Materiale', `${fmtNum(t.kg, 2)} kg`],
    ['Ore macchina (incl. ristampe)', `${fmtNum(t.printHours, 1)} h`],
    ['Ore manodopera', `${fmtNum(t.laborHours, 1)} h`],
    ['Occupazione farm intera', `${fmtNum(t.farmDays, 1)} gg lav.`],
    ['Ricavo per ora macchina', t.printHours > 0 ? EUR(t.components / t.printHours) : '—'],
    ['Utile netto per pezzo', t.pieces > 0 ? EUR(t.netProfit / t.pieces) : '—'],
  ];
  facts.forEach(([k, v], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...C.light);
      doc.rect(sideX, sy, sideW, 5.5, 'F');
    }
    setFont(doc, 6.5, 'normal', C.gray);
    doc.text(k, sideX + 2, sy + 3.8);
    setFont(doc, 6.8, 'bold', C.dark);
    doc.text(v, sideX + sideW - 2, sy + 3.8, { align: 'right' });
    sy += 5.5;
  });

  sy += 6;
  setFont(doc, 9, 'bold', C.dark);
  doc.text('Come leggere i margini', sideX, sy);
  sy += 4;
  const notes = [
    ['Margine lordo', `Ricavo meno i costi che spendi solo per questa commessa. È quanto la commessa porta a coprire affitto, macchine e utile.`],
    ['Utile netto (in tasca)', `Quello che resta dopo aver pagato anche la quota di costi fissi e le imposte. È il guadagno pulito, a farm piena.`],
    ['Se i costi fissi sono già coperti', `da altri lavori, questa commessa aggiunge in cassa il margine lordo meno imposte: ${EUR(t.grossMarginOnlyNet)}.`],
    ['Costi fissi', `Imputati in base alle ore macchina, supponendo ${fmtNum(config?.num_printers || 0, 0)} stampanti all'${fmtNum((config?.farm_efficiency || 0) * 100, 0)}% di utilizzo. Se la farm lavora meno, la quota reale è più alta.`],
    ['Imposte', `Stima forfettaria (IRES + IRAP) modificabile in Configurazione; non sostituisce il calcolo del commercialista.`],
  ];
  notes.forEach(([title, body]) => {
    setFont(doc, 6.5, 'bold', C.dark);
    doc.text(title, sideX, sy);
    sy += 3.2;
    setFont(doc, 6.2, 'normal', C.gray);
    const wrapped = doc.splitTextToSize(body, sideW);
    doc.text(wrapped, sideX, sy);
    sy += wrapped.length * 2.8 + 2.2;
  });

  y = Math.max(ceBottom, sy) + 8;

  // ── Scenario macchine dedicate ──────────────────────────────────────────────
  if (sc) {
    ensureSpace(96);
    setFont(doc, 9, 'bold', C.dark);
    doc.text(`Scenario: ${fmtNum(sc.printers, 0)} macchine dedicate a questo ordine`, M, y);
    setFont(doc, 6, 'normal', C.gray);
    doc.text(
      sc.writeoff
        ? `Costo macchine nuove tutto su questo ordine (${fmtNum(sc.printers, 0)} × ${EUR(config?.printer_cost || 0)}). Costi fissi esistenti già coperti dalla produzione attuale.`
        : `Macchine nuove che restano in farm: a questo ordine solo l'usura delle ore usate. Costi fissi esistenti già coperti dalla produzione attuale.`,
      M, y + 4,
    );
    y += 7;

    const scW = 128;
    const cLabel = M + 3;
    const cStd = M + scW - 40;
    const cDed = M + scW - 3;
    doc.setFillColor(...C.dark);
    doc.rect(M, y, scW, 5.5, 'F');
    setFont(doc, 6, 'bold', C.white);
    doc.text('Voce', cLabel, y + 3.8);
    doc.text('Farm condivisa', cStd, y + 3.8, { align: 'right' });
    doc.text('Macchine dedicate', cDed, y + 3.8, { align: 'right' });
    y += 5.5;

    const pctOf = (v) => (t.revenue > 0 ? ` (${PCT((v / t.revenue) * 100)})` : '');
    const scRows = [
      ['Ricavo netto', EUR(t.revenue), EUR(t.revenue)],
      ['Costi variabili', EUR(t.variable), EUR(t.variable)],
      ['Margine lordo', EUR(t.grossMargin), EUR(t.grossMargin), 'total'],
      ['Quota costi fissi esistenti', EUR(t.fixed), EUR(0)],
      ['Macchine nuove', '—', EUR(sc.machineCost)],
      ['Utile ante imposte', EUR(t.operatingProfit), EUR(sc.operatingProfit), 'total'],
      ['Imposte stimate', `- ${EUR(t.taxes)}`, `- ${EUR(sc.taxes)}`],
      ['UTILE NETTO — IN TASCA', EUR(t.netProfit) + pctOf(t.netProfit), EUR(sc.netProfit) + pctOf(sc.netProfit), 'result'],
    ];
    scRows.forEach(([label, a, b, kind]) => {
      const rh = kind ? 6.2 : 5.3;
      if (kind === 'result') {
        doc.setFillColor(...profitColor(sc.netProfit));
        doc.rect(M, y, scW, rh, 'F');
        setFont(doc, 7, 'bold', C.white);
      } else if (kind === 'total') {
        doc.setFillColor(...C.border);
        doc.rect(M, y, scW, rh, 'F');
        setFont(doc, 7, 'bold', C.dark);
      } else {
        setFont(doc, 6.8, 'normal', C.dark);
        hLine(doc, M + 3, y + rh, M + scW, C.light);
      }
      const ty = y + rh / 2 + 1.2;
      doc.text(label, cLabel, ty);
      doc.text(a, cStd, ty, { align: 'right' });
      doc.text(b, cDed, ty, { align: 'right' });
      y += rh;
    });

    // Box laterali: tempi e competitività
    const bx = M + scW + 6;
    const bw = pageW - M - bx;
    let by = y - 5.5 - scRows.reduce((a, r) => a + (r[3] ? 6.2 : 5.3), 0);
    const box = (title, big, body, color) => {
      setFont(doc, 6, 'normal', C.gray);
      const wrapped = doc.splitTextToSize(body, bw - 6);
      setFont(doc, 11, 'bold', color);
      const bigLines = doc.splitTextToSize(big, bw - 6);
      const extra = (bigLines.length - 1) * 4.6;
      const h = 14 + extra + wrapped.length * 2.8;
      doc.setFillColor(...C.light);
      doc.roundedRect(bx, by, bw, h, 2, 2, 'F');
      setFont(doc, 6, 'bold', C.gray);
      doc.text(title, bx + 3, by + 5);
      setFont(doc, 11, 'bold', color);
      doc.text(bigLines, bx + 3, by + 11);
      setFont(doc, 6, 'normal', C.gray);
      doc.text(wrapped, bx + 3, by + 15 + extra);
      by += h + 3;
    };
    box(
      'DURATA PRODUZIONE',
      sc.durationLabel,
      `${fmtNum(t.printHours, 0)} h macchina su ${fmtNum(sc.printers, 0)} stampanti, ${fmtNum(sc.hpd, 0)} h/giorno, ${fmtNum(sc.days, 0)} gg/mese, efficienza ${fmtNum(sc.eff * 100, 0)}%.`,
      C.dark,
    );
    box(
      'MARGINE PER ESSERE PIÙ COMPETITIVO',
      sc.maxDiscount > 0 ? `fino a -${PCT(sc.maxDiscountPct)}` : 'nessuno',
      sc.maxDiscount > 0
        ? `Puoi scontare fino a ${EUR(sc.maxDiscount)} (${EUR(sc.maxDiscountPerPiece)}/pz) e guadagnare comunque quanto nel caso farm condivisa.`
        : `Con questi parametri le macchine nuove costano più della quota di costi fissi risparmiata.`,
      sc.maxDiscount > 0 ? C.green : C.red,
    );
    if (sc.curPrinters > 0) {
      box(
        'SE LE MACCHINE RESTANO IN FARM',
        `da € ${fmtNum(sc.fixedPerHourNow, 2)} a € ${fmtNum(sc.fixedPerHourAfter, 2)}/h`,
        `Costo fisso per ora macchina passando da ${fmtNum(sc.curPrinters, 0)} a ${fmtNum(sc.curPrinters + sc.printers, 0)} stampanti: vale per tutti i preventivi futuri, se le macchine restano occupate e i costi fissi non salgono.`,
        C.dark,
      );
    }
    y = Math.max(y, by) + 6;
  }

  // ── Dettaglio per componente ────────────────────────────────────────────────
  const cols = [
    { label: 'Componente', w: 0.25, align: 'left' },
    { label: 'Qtà', w: 0.06, align: 'right' },
    { label: 'Ricavo', w: 0.105, align: 'right' },
    { label: 'Costi var.', w: 0.105, align: 'right' },
    { label: 'Marg. lordo', w: 0.105, align: 'right' },
    { label: 'Costi fissi', w: 0.105, align: 'right' },
    { label: 'Utile ante imp.', w: 0.115, align: 'right' },
    { label: 'Marg. %', w: 0.065, align: 'right' },
    { label: 'Utile/pz', w: 0.09, align: 'right' },
  ];
  let cx = M;
  const colsX = cols.map((c) => { const x = cx; c.wmm = c.w * W; cx += c.wmm; return x; });
  const cellX = (i) => (cols[i].align === 'right' ? colsX[i] + cols[i].wmm - 1.5 : colsX[i] + 1.5);

  const drawTableHeader = () => {
    doc.setFillColor(...C.dark);
    doc.rect(M, y, W, 6, 'F');
    setFont(doc, 6, 'bold', C.white);
    cols.forEach((c, i) => doc.text(c.label, cellX(i), y + 4, { align: c.align }));
    y += 6;
  };

  ensureSpace(20);
  setFont(doc, 9, 'bold', C.dark);
  doc.text('Dettaglio per componente', M, y);
  setFont(doc, 6, 'normal', C.gray);
  doc.text('Utile ante imposte = margine lordo - costi fissi. Importi sul totale della riga.', M + 48, y);
  y += 3;
  drawTableHeader();

  const rowCells = (r) => {
    const marginPct = r.revenue > 0 ? (r.operatingProfit / r.revenue) * 100 : 0;
    const name = (r.line.part_name || '') + (r.calc.useManualPrice ? ' (prezzo man.)' : '');
    return {
      values: [
        doc.splitTextToSize(name, cols[0].wmm - 3)[0],
        fmtNum(r.qty, 0),
        EUR(r.revenue),
        EUR(r.variable),
        EUR(r.grossMargin),
        EUR(r.fixed),
        EUR(r.operatingProfit),
        PCT(marginPct),
        EUR(r.operatingProfit / r.qty),
      ],
      marginPct,
    };
  };

  rows.forEach((r, idx) => {
    const rh = 6;
    ensureSpace(rh, drawTableHeader);
    if (idx % 2 === 1) {
      doc.setFillColor(...C.rowAlt);
      doc.rect(M, y, W, rh, 'F');
    }
    const { values, marginPct } = rowCells(r);
    values.forEach((v, i) => {
      const color = i === 6 || i === 8 ? profitColor(r.operatingProfit) : i === 7 ? marginColor(marginPct) : C.dark;
      setFont(doc, 6.3, i === 6 || i === 7 ? 'bold' : 'normal', color);
      doc.text(v, cellX(i), y + 4, { align: cols[i].align });
    });
    hLine(doc, M, y + rh, M + W);
    y += rh;
  });

  // Riga totale (solo componenti; attrezzaggio a parte)
  ensureSpace(7, drawTableHeader);
  const compProfit = t.components - t.variable - t.fixed;
  const compPct = t.components > 0 ? (compProfit / t.components) * 100 : 0;
  doc.setFillColor(...C.border);
  doc.rect(M, y, W, 6.5, 'F');
  const totVals = [
    'Totale componenti', fmtNum(t.pieces, 0), EUR(t.components), EUR(t.variable),
    EUR(t.components - t.variable), EUR(t.fixed), EUR(compProfit), PCT(compPct),
    t.pieces > 0 ? EUR(compProfit / t.pieces) : '—',
  ];
  totVals.forEach((v, i) => {
    setFont(doc, 6.5, 'bold', i === 6 ? profitColor(compProfit) : C.dark);
    doc.text(v, cellX(i), y + 4.3, { align: cols[i].align });
  });
  y += 6.5;
  if (t.setup > 0) {
    y += 4;
    setFont(doc, 6, 'normal', C.gray);
    doc.text(`L'attrezzaggio (${EUR(t.setup)}) non ha costi imputati: è tutto utile ante imposte ed è incluso nel conto economico sopra.`, M, y);
  }

  const safeName = (clientName || 'report').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  doc.save(`report_costi_${safeName}_${dateStr}.pdf`);
}
