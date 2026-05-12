import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import MaterialSelector from './MaterialSelector';
import { calculateLinePrice } from '@/lib/pricingEngine';

export default function QuoteLineRow({ line, index, materials, config, onChange, onRemove, materialTotals = {} }) {
  const hasSubMaterials = line.sub_materials && line.sub_materials.length > 0;
  const material = hasSubMaterials ? null : materials.find(m => m.code === line.material_code);
  const calc = calculateLinePrice(line, material, config, materials, materialTotals);

  const update = (field, value) => onChange(index, { ...line, [field]: value });

  const updateSubMaterial = (si, field, value) => {
    const updated = line.sub_materials.map((sm, i) => i === si ? { ...sm, [field]: value } : sm);
    onChange(index, { ...line, sub_materials: updated });
  };

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors group">
      {/* # */}
      <td className="p-2 text-center text-xs text-muted-foreground font-mono">
        {index + 1}
      </td>

      {/* Componente */}
      <td className="p-2">
        <Input
          value={line.part_name || ''}
          onChange={e => update('part_name', e.target.value)}
          placeholder="Nome componente"
          className="h-8 text-xs"
        />
      </td>

      {/* Materiale(i) */}
      <td className="p-2 min-w-[200px]">
        {hasSubMaterials ? (
          <div className="flex flex-col gap-1">
            {line.sub_materials.map((sm, si) => (
              <div key={si} className="flex items-center gap-1.5">
                {sm.filament_color && (
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: sm.filament_color }} />
                )}
                <MaterialSelector
                  materials={materials}
                  value={sm.material_code}
                  onChange={v => updateSubMaterial(si, 'material_code', v)}
                  hint={sm.filament_type}
                />
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{sm.weight_g}g</span>
              </div>
            ))}
          </div>
        ) : (
          <MaterialSelector
            materials={materials}
            value={line.material_code}
            onChange={v => update('material_code', v)}
          />
        )}
      </td>

      {/* Peso (g) — totale */}
      <td className="p-2">
        {hasSubMaterials ? (
          <span className="text-xs font-mono text-right block text-muted-foreground">
            {line.weight_g}
          </span>
        ) : (
          <Input
            type="number"
            value={line.weight_g || ''}
            onChange={e => update('weight_g', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs w-20 font-mono text-right"
          />
        )}
      </td>

      {/* T.Stampa */}
      <td className="p-2">
        <Input
          type="number"
          value={line.print_time_min || ''}
          onChange={e => update('print_time_min', parseFloat(e.target.value) || 0)}
          placeholder="0"
          className="h-8 text-xs w-20 font-mono text-right"
        />
      </td>

      {/* T.MDO */}
      <td className="p-2">
        <Input
          type="number"
          value={line.labor_time_min || ''}
          onChange={e => update('labor_time_min', parseFloat(e.target.value) || 0)}
          placeholder="0"
          className="h-8 text-xs w-20 font-mono text-right"
        />
      </td>

      {/* Qtà */}
      <td className="p-2">
        <Input
          type="number"
          value={line.quantity || ''}
          onChange={e => update('quantity', parseInt(e.target.value) || 1)}
          placeholder="1"
          className="h-8 text-xs w-16 font-mono text-right"
          min={1}
        />
      </td>

      {/* Costi calcolati */}
      <td className="p-2 text-xs font-mono text-right text-muted-foreground">€{calc.materialCost.toFixed(2)}</td>
      <td className="p-2 text-xs font-mono text-right text-muted-foreground">€{calc.machineCost.toFixed(2)}</td>
      <td className="p-2 text-xs font-mono text-right text-muted-foreground">€{calc.laborCost.toFixed(2)}</td>
      <td className="p-2 text-xs font-mono text-right text-muted-foreground">€{calc.costWithFailRate.toFixed(2)}</td>
      <td className="p-2 text-xs font-mono text-right font-medium">x{calc.markup.toFixed(2)}</td>

      {/* Prezzo manuale */}
      <td className="p-2">
        <Input
          type="number"
          value={line.manual_price || ''}
          onChange={e => update('manual_price', parseFloat(e.target.value) || 0)}
          placeholder={calc.netPrice.toFixed(2)}
          className="h-8 text-xs w-24 font-mono text-right"
          step="0.01"
        />
      </td>

      {/* Sconto partner 15% */}
      <td className="p-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <Checkbox
            checked={!!line.partner_discount}
            onCheckedChange={v => update('partner_discount', !!v)}
            className="h-4 w-4"
          />
          <span className="text-[9px] text-muted-foreground">-15%</span>
        </div>
      </td>

      <td className="p-2 text-xs font-mono text-right font-bold text-primary">€{calc.finalPrice.toFixed(2)}</td>
      <td className="p-2 text-xs font-mono text-right text-muted-foreground">€{calc.finalPricePerUnit.toFixed(2)}</td>

      {/* Elimina */}
      <td className="p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}