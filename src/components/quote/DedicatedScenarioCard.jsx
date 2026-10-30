import React from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { buildCostReport } from '@/lib/generateCostReportPdf';

const eur = (v) => `€${(Number.isFinite(v) ? v : 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function DedicatedScenarioCard({ value, onChange, lines, materials, config, setupPoints }) {
  const set = (field, v) => onChange({ ...value, [field]: v });

  const report = value.enabled && lines.length > 0
    ? buildCostReport({ lines, materials, config, setupPoints, dedicated: value })
    : null;
  const t = report?.totals;
  const sc = report?.scenario;

  return (
    <div className="bg-card rounded-xl border border-border p-5 mt-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Scenario macchine dedicate</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            L'ordine gira su stampanti nuove comprate apposta: i costi fissi attuali restano sulla produzione esistente. Compare nel Report Costi.
          </p>
        </div>
        <Switch checked={!!value.enabled} onCheckedChange={(v) => set('enabled', v)} />
      </div>

      {value.enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <label className="text-xs text-muted-foreground">
              Stampanti nuove
              <Input type="number" min={1} value={value.printers || ''} onChange={(e) => set('printers', parseFloat(e.target.value) || 0)} className="h-8 mt-1" />
            </label>
            <label className="text-xs text-muted-foreground">
              Ore al giorno
              <Input type="number" min={1} max={24} value={value.hours_per_day || ''} onChange={(e) => set('hours_per_day', parseFloat(e.target.value) || 0)} className="h-8 mt-1" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:mt-5">
              <Checkbox checked={!!value.writeoff} onCheckedChange={(v) => set('writeoff', !!v)} className="h-4 w-4" />
              Costo macchine tutto su questo ordine
            </label>
          </div>

          {sc && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <Stat label="Utile netto farm condivisa" value={eur(t.netProfit)} />
              <Stat label="Utile netto macchine dedicate" value={eur(sc.netProfit)} strong positive={sc.netProfit >= 0} />
              <Stat label="Durata produzione" value={sc.durationLabel} />
              <Stat
                label="Sconto possibile a pari utile"
                value={sc.maxDiscount > 0 ? `-${sc.maxDiscountPct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% (€${sc.maxDiscountPerPiece.toFixed(2)}/pz)` : 'nessuno'}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong, positive }) {
  return (
    <div className={`rounded-lg border border-border px-3 py-2 ${strong ? (positive ? 'bg-green-50' : 'bg-red-50') : 'bg-muted/40'}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold font-mono ${strong ? (positive ? 'text-green-700' : 'text-red-600') : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
