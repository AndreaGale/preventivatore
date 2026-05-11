import React from 'react';
import { calculateLinePrice } from '@/lib/pricingEngine';

export default function QuoteSummary({ lines, materials, config }) {
  const totals = lines.reduce(
    (acc, line) => {
      const material = materials.find(m => m.code === line.material_code);
      const calc = calculateLinePrice(line, material, config, materials);
      return {
        materialCost: acc.materialCost + calc.materialCost * line.quantity,
        machineCost: acc.machineCost + calc.machineCost * line.quantity,
        laborCost: acc.laborCost + calc.laborCost * line.quantity,
        productionCost: acc.productionCost + calc.productionCost * line.quantity,
        finalPrice: acc.finalPrice + calc.finalPrice,
      };
    },
    { materialCost: 0, machineCost: 0, laborCost: 0, productionCost: 0, finalPrice: 0 }
  );

  const iva = totals.finalPrice * 0.22;
  const total = totals.finalPrice + iva;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="font-semibold text-sm mb-4 text-foreground">Riepilogo Costi</h3>
      <div className="space-y-2">
        <Row label="Materiali" value={totals.materialCost} muted />
        <Row label="Macchina" value={totals.machineCost} muted />
        <Row label="Manodopera" value={totals.laborCost} muted />
        <div className="border-t border-border my-3" />
        <Row label="Costo Produzione" value={totals.productionCost} />
        <div className="border-t border-border my-3" />
        <Row label="Subtotale" value={totals.finalPrice} bold />
        <Row label="IVA (22%)" value={iva} muted />
        <div className="border-t border-border my-3" />
        <div className="flex justify-between items-center">
          <span className="text-base font-bold text-foreground">Totale</span>
          <span className="text-xl font-bold text-primary font-mono">
            €{total.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-xs ${muted ? 'text-muted-foreground' : bold ? 'font-semibold text-foreground' : 'text-foreground'}`}>
        {label}
      </span>
      <span className={`text-xs font-mono ${muted ? 'text-muted-foreground' : bold ? 'font-semibold text-foreground' : 'text-foreground'}`}>
        €{value.toFixed(2)}
      </span>
    </div>
  );
}