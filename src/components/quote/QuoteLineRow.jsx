import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import MaterialSelector from './MaterialSelector';
import { calculateLinePrice } from '@/lib/pricingEngine';

export default function QuoteLineRow({ line, index, materials, config, onChange, onRemove, materialTotals = {} }) {
  const [expanded, setExpanded] = useState(false);
  const hasSubMaterials = line.sub_materials && line.sub_materials.length > 0;
  const material = hasSubMaterials ? null : materials.find(m => m.code === line.material_code);
  const calc = calculateLinePrice(line, material, config, materials, materialTotals);

  const update = (field, value) => onChange(index, { ...line, [field]: value });

  const updateSubMaterial = (si, field, value) => {
    const updated = line.sub_materials.map((sm, i) => i === si ? { ...sm, [field]: value } : sm);
    onChange(index, { ...line, sub_materials: updated });
  };

  return (
    <>
      {/* Riga principale */}
      <tr className="border-b border-border hover:bg-muted/30 transition-colors group">
        {/* # + expand toggle */}
        <td className="p-2 text-center">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Dettagli costi"
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 mx-auto" />
              : <ChevronRight className="w-3.5 h-3.5 mx-auto" />
            }
          </button>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{index + 1}</div>
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
        <td className="p-2">
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

        {/* Peso */}
        <td className="p-2">
          {hasSubMaterials ? (
            <span className="text-xs font-mono block text-center text-muted-foreground">{line.weight_g}g</span>
          ) : (
            <Input
              type="number"
              value={line.weight_g || ''}
              onChange={e => update('weight_g', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="h-8 text-xs w-full font-mono text-center"
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
            className="h-8 text-xs w-full font-mono text-center"
          />
        </td>

        {/* T.MDO */}
        <td className="p-2">
          <Input
            type="number"
            value={line.labor_time_min || ''}
            onChange={e => update('labor_time_min', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs w-full font-mono text-center"
          />
        </td>

        {/* Qtà */}
        <td className="p-2">
          <Input
            type="number"
            value={line.quantity || ''}
            onChange={e => update('quantity', parseInt(e.target.value) || 1)}
            placeholder="1"
            className="h-8 text-xs w-full font-mono text-center"
            min={1}
          />
        </td>

        {/* Prezzo manuale */}
        <td className="p-2">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-muted-foreground">suggerito: €{(calc.netPrice / (line.quantity || 1)).toFixed(2)}</span>
            <Input
              type="number"
              value={line.manual_price || ''}
              onChange={e => update('manual_price', parseFloat(e.target.value) || 0)}
              placeholder={(calc.netPrice / (line.quantity || 1)).toFixed(2)}
              className="h-8 text-xs w-full font-mono text-center"
              step="0.01"
            />
          </div>
        </td>

        {/* Partner */}
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

        {/* Totale */}
        <td className="p-2 text-center">
          {line.partner_discount ? (
            <div className="flex flex-col items-center">
              <span className="text-xs font-mono text-muted-foreground line-through">€{(calc.finalPrice / 0.85).toFixed(2)}</span>
              <span className="text-xs font-mono font-bold text-green-600">€{calc.finalPrice.toFixed(2)}</span>
            </div>
          ) : (
            <span className="text-xs font-mono font-bold text-primary">€{calc.finalPrice.toFixed(2)}</span>
          )}
        </td>

        {/* Al pz */}
        <td className="p-2 text-xs font-mono text-center text-muted-foreground whitespace-nowrap">
          €{calc.finalPricePerUnit.toFixed(2)}
        </td>

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

      {/* Riga dettagli costi — visibile solo se expanded */}
      {expanded && (
        <tr className="bg-muted/20 border-b border-border">
          <td />
          <td colSpan={11} className="px-3 py-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <CostItem label="Materiale" value={calc.materialCost} />
              <CostItem label="Macchina" value={calc.machineCost} />
              <CostItem label="MDO" value={calc.laborCost} />
              <CostItem label="+Fail" value={calc.costWithFailRate} />
              <CostItem label="Markup" value={null} text={`×${calc.markup.toFixed(2)}`} />
            </div>
          </td>
          <td colSpan={2} />
        </tr>
      )}
    </>
  );
}

function CostItem({ label, value, text }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <span className="text-xs font-mono font-medium">
        {text ?? `€${value.toFixed(2)}`}
      </span>
    </div>
  );
}