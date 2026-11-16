import React, { useEffect, useRef, useState } from 'react';
import { Copy, Trash2, ChevronDown, RotateCcw } from 'lucide-react';
import DurationInput from './DurationInput';
import MaterialSelector from './MaterialSelector';
import { calculateLinePrice, isPricedLine } from '@/lib/pricingEngine';

const eur = (v, d = 2) =>
  `€ ${(Number.isFinite(v) ? v : 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })}`;

const DISCOUNTS = [
  { key: 'none', label: 'Nessuno' },
  { key: 'partner', label: 'Partner −15%' },
  { key: 'cont', label: 'Continuativo −30%', short: 'Cont. −30%' },
];

function discountKey(line) {
  if (line.continuoativo_discount) return 'cont';
  if (line.partner_discount) return 'partner';
  return 'none';
}

/** Campo numerico con unità, seleziona tutto al focus per sovrascrivere al volo. */
export function NumberField({ value, onChange, unit, placeholder = '0', step, min, integer, className = '', ...rest }) {
  return (
    <div className={`qf-field ${className}`}>
      <input
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={value || value === 0 ? (value === 0 ? '' : value) : ''}
        onChange={(e) => {
          const v = integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          onChange(Number.isFinite(v) ? v : 0);
        }}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        step={step}
        min={min}
        {...rest}
      />
      {unit && <span className="qf-unit">{unit}</span>}
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function QuoteLineCard({
  line, index, materials, config, materialTotals = {},
  onChange, onRemove, onDuplicate, canRemove, autoFocus,
}) {
  const [expanded, setExpanded] = useState(false);
  const nameRef = useRef(null);
  const hasSub = line.sub_materials && line.sub_materials.length > 0;
  const material = hasSub ? null : materials.find((m) => m.code === line.material_code);
  const calc = calculateLinePrice(line, material, config, materials, materialTotals);
  const qty = calc.quantity;
  const suggested = calc.netPrice / qty;
  const manual = line.manual_price > 0;
  const discounted = calc.discountFactor < 1;
  const missingMaterial = !!line.part_name && !isPricedLine(line);

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, [autoFocus]);

  const update = (field, value) => onChange(index, { ...line, [field]: value });
  const setDiscount = (k) =>
    onChange(index, { ...line, partner_discount: k === 'partner', continuoativo_discount: k === 'cont' });
  const updateSub = (si, field, value) =>
    onChange(index, { ...line, sub_materials: line.sub_materials.map((sm, i) => (i === si ? { ...sm, [field]: value } : sm)) });

  return (
    <article className="qf-card group">
      <div className="qf-index">
        <span aria-hidden>{index + 1}</span>
        <button type="button" onClick={() => onDuplicate(index)} className="qf-icon-btn" title="Duplica componente" aria-label={`Duplica componente ${index + 1}`}>
          <Copy className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => onRemove(index)} disabled={!canRemove} className="qf-icon-btn qf-link-danger" title="Elimina componente" aria-label={`Elimina componente ${index + 1}`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="qf-main">
        {/* Identità */}
        <div className="qf-ident">
          <input
            ref={nameRef}
            value={line.part_name || ''}
            onChange={(e) => update('part_name', e.target.value)}
            placeholder="Nome o codice componente"
            className="qf-name"
            aria-label="Nome componente"
          />
          {hasSub ? (
            <div className="flex flex-col gap-1.5">
              {line.sub_materials.map((sm, si) => (
                <div key={si} className="flex items-center gap-2">
                  {sm.filament_color && (
                    <span className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border" style={{ backgroundColor: sm.filament_color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <MaterialSelector materials={materials} value={sm.material_code} onChange={(v) => updateSub(si, 'material_code', v)} hint={sm.filament_type} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">{sm.weight_g} g</span>
                </div>
              ))}
            </div>
          ) : (
            <MaterialSelector materials={materials} value={line.material_code} onChange={(v) => update('material_code', v)} />
          )}
        </div>

        {/* Parametri */}
        <div className="qf-params">
          <Field label="Peso">
            {hasSub ? (
              <div className="qf-field qf-readonly"><span className="tabular-nums">{line.weight_g}</span><span className="qf-unit">g</span></div>
            ) : (
              <NumberField value={line.weight_g} onChange={(v) => update('weight_g', v)} unit="g" step="0.1" />
            )}
          </Field>
          <Field label="Tempo di stampa">
            <DurationInput value={line.print_time_min} onChange={(v) => update('print_time_min', v)} />
          </Field>
          <Field label="Manodopera">
            <NumberField value={line.labor_time_min} onChange={(v) => update('labor_time_min', v)} unit="min" />
          </Field>
          <Field label="Quantità">
            <NumberField value={line.quantity} onChange={(v) => update('quantity', Math.max(1, v))} unit="pz" placeholder="1" min={1} integer />
          </Field>
        </div>

        {/* Piede scheda: sconto e azioni */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground" id={`sconto-${index}`}>Sconto</span>
            <div className="qf-segment w-auto h-8" role="radiogroup" aria-labelledby={`sconto-${index}`}>
              {DISCOUNTS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="radio"
                  aria-checked={discountKey(line) === d.key}
                  onClick={() => setDiscount(d.key)}
                >
                  {d.short ? (<><span className="hidden xl:inline">{d.label}</span><span className="xl:hidden">{d.short}</span></>) : d.label}
                </button>
              ))}
            </div>
          </div>
          <span className="flex-1" />
          <button type="button" onClick={() => setExpanded((v) => !v)} className="qf-link" aria-expanded={expanded}>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            Dettaglio costi
          </button>
        </div>

        {missingMaterial && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Scegli il materiale: finché manca, questo componente resta fuori dal totale e dal PDF.
          </p>
        )}

        {expanded && (
          <dl className="qf-costs">
            <div><dt>Materiale</dt><dd>{eur(calc.materialCost)}</dd></div>
            <div><dt>Macchina</dt><dd>{eur(calc.machineCost)}</dd></div>
            <div><dt>Manodopera</dt><dd>{eur(calc.laborCost)}</dd></div>
            <div><dt>Costo con scarti</dt><dd>{eur(calc.costWithFailRate)}</dd></div>
            <div><dt>Ricarico</dt><dd>×{calc.markup.toFixed(2).replace('.', ',')}</dd></div>
            <div><dt>Prezzo suggerito</dt><dd>{eur(suggested)}</dd></div>
          </dl>
        )}
      </div>

      {/* Prezzo */}
      <div className="qf-price">
        <span className="text-[11px] text-muted-foreground">Prezzo al pezzo</span>
        <div className={`qf-field qf-field-price ${manual ? 'qf-manual' : ''}`}>
          <span className="qf-unit">€</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={manual ? line.manual_price : ''}
            onChange={(e) => update('manual_price', parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            placeholder={suggested.toFixed(2).replace('.', ',')}
            aria-label="Prezzo al pezzo"
          />
        </div>
        <div className="h-4 text-[11px]">
          {manual ? (
            <button type="button" className="qf-link text-amber-700" onClick={() => update('manual_price', 0)}>
              <RotateCcw className="w-3 h-3" /> Manuale, torna a {eur(suggested)}
            </button>
          ) : (
            <span className="text-muted-foreground">Calcolato, scrivi per cambiarlo</span>
          )}
        </div>

        <div className="mt-auto pt-2 text-right">
          {discounted && (
            <div className="text-xs text-muted-foreground tabular-nums line-through">{eur(calc.preDiscountTotal)}</div>
          )}
          <div className={`qf-total ${discounted ? 'text-[hsl(var(--success))]' : ''}`}>{eur(calc.finalPrice)}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {qty.toLocaleString('it-IT')} pz × {eur(calc.finalPricePerUnit)}
          </div>
        </div>
      </div>
    </article>
  );
}
