import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { calculateLinePrice } from '@/lib/pricingEngine';

const eur = (v) =>
  `€ ${(Number.isFinite(v) ? v : 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}`;

const SETUP_POINT_PRICE = 15;

export default function QuoteSummary({ lines, materials, config, materialTotals = {}, setupPoints = 0, onSetupChange, totalGrams = 0 }) {
  const totals = lines.reduce(
    (acc, line) => {
      const material = materials.find((m) => m.code === line.material_code);
      const calc = calculateLinePrice(line, material, config, materials, materialTotals);
      return {
        pieces: acc.pieces + (line.quantity || 1),
        listPrice: acc.listPrice + calc.preDiscountTotal,
        finalPrice: acc.finalPrice + calc.finalPrice,
        productionCost: acc.productionCost + calc.costWithFailRate * (line.quantity || 1),
      };
    },
    { pieces: 0, listPrice: 0, finalPrice: 0, productionCost: 0 }
  );

  const setupCost = setupPoints * SETUP_POINT_PRICE;
  const subtotal = totals.finalPrice + setupCost;
  const iva = subtotal * 0.22;
  const total = subtotal + iva;
  const discount = totals.listPrice - totals.finalPrice;
  const margin = subtotal - totals.productionCost;
  const marginPct = subtotal > 0 ? (margin / subtotal) * 100 : 0;

  return (
    <section className="qf-panel overflow-hidden" aria-label="Riepilogo preventivo">
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <h2 className="text-sm font-semibold">Riepilogo</h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {lines.length} {lines.length === 1 ? 'componente' : 'componenti'}, {totals.pieces.toLocaleString('it-IT')} pz
          {totalGrams > 0 && `, ${(totalGrams / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} kg di materiale`}
        </p>
      </div>

      <dl className="px-5 py-3 space-y-2 text-sm">
        {discount > 0.005 && (
          <Row label="Sconti applicati" value={`− ${eur(discount)}`} muted />
        )}
        <Row label="Componenti" value={eur(totals.finalPrice)} />

        <div className="flex items-center justify-between gap-3">
          <dt>
            Attrezzaggio
            <span className="block text-[11px] text-muted-foreground tabular-nums">
              {setupPoints > 0 ? `${eur(setupCost)} (${eur(SETUP_POINT_PRICE)} a punto)` : `${eur(SETUP_POINT_PRICE)} a punto`}
            </span>
          </dt>
          <dd className="flex items-center gap-1.5">
            <StepButton label="Togli un punto" onClick={() => onSetupChange(Math.max(0, setupPoints - 1))} disabled={setupPoints === 0}>
              <Minus className="w-3.5 h-3.5" />
            </StepButton>
            <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{setupPoints}</span>
            <StepButton label="Aggiungi un punto" onClick={() => onSetupChange(setupPoints + 1)}>
              <Plus className="w-3.5 h-3.5" />
            </StepButton>
          </dd>
        </div>

        <div className="border-t border-border pt-2">
          <Row label="Imponibile" value={eur(subtotal)} strong />
        </div>
        <Row label="IVA 22%" value={eur(iva)} muted />
      </dl>

      <div className="px-5 py-4 bg-foreground text-background">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm">Totale</span>
          <span className="text-2xl font-bold tabular-nums" style={{ fontStretch: '112%' }}>{eur(total)}</span>
        </div>
        {subtotal > 0 && (
          <p className="mt-1 text-xs opacity-75 tabular-nums">
            Margine sul costo di produzione: {eur(margin)} ({marginPct.toLocaleString('it-IT', { maximumFractionDigits: 0 })}%)
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd className={`tabular-nums ${muted ? 'text-muted-foreground' : ''} ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}

function StepButton({ children, label, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="w-7 h-7 rounded-md border border-input bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      {...rest}
    >
      {children}
    </button>
  );
}
