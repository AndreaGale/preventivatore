import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import MaterialSelector from './MaterialSelector';
import { calculateLinePrice } from '@/lib/pricingEngine';

export default function QuoteLineRow({ line, index, materials, config, onChange, onRemove }) {
  const hasSubMaterials = line.sub_materials && line.sub_materials.length > 0;

  // Per il calcolo usiamo sempre allMaterials
  const material = hasSubMaterials ? null : materials.find(m => m.code === line.material_code);
  const calc = calculateLinePrice(line, material, config, materials);

  const update = (field, value) => onChange(index, { ...line, [field]: value });

  const updateSubMaterial = (si, field, value) => {
    const updated = line.sub_materials.map((sm, i) => i === si ? { ...sm, [field]: value } : sm);
    onChange(index, { ...line, sub_materials: updated });
  };

  return (
    <>
      {/* Riga principale */}
      <tr className="border-b border-border hover:bg-muted/30 transition-colors group">
        <td className="p-2 text-center text-xs text-muted-foreground font-mono" rowSpan={hasSubMaterials ? line.sub_materials.length + 1 : 1}>
          {index + 1}
        </td>
        <td className="p-2" rowSpan={hasSubMaterials ? line.sub_materials.length + 1 : 1}>
          <Input
            value={line.part_name || ''}
            onChange={e => update('part_name', e.target.value)}
            placeholder="Nome componente"
            className="h-8 text-xs"
          />
        </td>
        {hasSubMaterials ? (
          // Multi-materiale: prima colonna materiale mostra la prima sub-riga
          <>
            <td className="p-2 min-w-[200px]">
              <div className="flex items-center gap-1.5">
                {line.sub_materials[0].filament_color && (
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: line.sub_materials[0].filament_color }} />
                )}
                <MaterialSelector
                  materials={materials}
                  value={line.sub_materials[0].material_code}
                  onChange={v => updateSubMaterial(0, 'material_code', v)}
                  hint={line.sub_materials[0].filament_type}
                />
              </div>
            </td>
            <td className="p-2 text-xs font-mono text-right text-muted-foreground">
              {line.sub_materials[0].weight_g}
            </td>
          </>
        ) : (
          <>
            <td className="p-2 min-w-[200px]">
              <MaterialSelector
                materials={materials}
                value={line.material_code}
                onChange={v => update('material_code', v)}
              />
            </td>
            <td className="p-2">
              <Input
                type="number"
                value={line.weight_g || ''}
                onChange={e => update('weight_g', parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="h-8 text-xs w-20 font-mono text-right"
              />
            </td>
          </>
        )}
        <td className="p-2">
          <Input
            type="number"
            value={line.print_time_min || ''}
            onChange={e => update('print_time_min', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs w-20 font-mono text-right"
          />
        </td>
        <td className="p-2">
          <Input
            type="number"
            value={line.labor_time_min || ''}
            onChange={e => update('labor_time_min', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs w-20 font-mono text-right"
          />
        </td>
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
        <td className="p-2 text-xs font-mono text-right text-muted-foreground">
          €{calc.materialCost.toFixed(2)}
        </td>
        <td className="p-2 text-xs font-mono text-right text-muted-foreground">
          €{calc.machineCost.toFixed(2)}
        </td>
        <td className="p-2 text-xs font-mono text-right text-muted-foreground">
          €{calc.laborCost.toFixed(2)}
        </td>
        <td className="p-2 text-xs font-mono text-right text-muted-foreground">
          €{calc.costWithFailRate.toFixed(2)}
        </td>
        <td className="p-2 text-xs font-mono text-right font-medium">
          x{calc.markup.toFixed(2)}
        </td>
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
        <td className="p-2 text-xs font-mono text-right font-bold text-primary">
          €{calc.finalPrice.toFixed(2)}
        </td>
        <td className="p-2 text-xs font-mono text-right text-muted-foreground">
          €{calc.finalPricePerUnit.toFixed(2)}
        </td>
        <td className="p-2" rowSpan={hasSubMaterials ? line.sub_materials.length + 1 : 1}>
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

      {/* Sub-righe materiale (dalla seconda in poi) */}
      {hasSubMaterials && line.sub_materials.slice(1).map((sm, si) => (
        <tr key={si} className="border-b border-border/50 bg-muted/10">
          <td className="p-2 min-w-[200px] pl-4">
            <div className="flex items-center gap-1.5">
              {sm.filament_color && (
                <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                  style={{ backgroundColor: sm.filament_color }} />
              )}
              <MaterialSelector
                materials={materials}
                value={sm.material_code}
                onChange={v => updateSubMaterial(si + 1, 'material_code', v)}
                hint={sm.filament_type}
              />
            </div>
          </td>
          <td className="p-2 text-xs font-mono text-right text-muted-foreground">
            {sm.weight_g}
          </td>
          {/* Celle vuote per allineare con le colonne successive */}
          <td colSpan={11} />
        </tr>
      ))}
    </>
  );
}