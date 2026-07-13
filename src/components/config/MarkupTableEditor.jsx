import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { DEFAULT_MARKUP_TABLE } from '@/lib/pricingEngine';

export default function MarkupTableEditor({ value, onChange }) {
  const table = (value && value.length > 0)
    ? value
    : DEFAULT_MARKUP_TABLE.map(r => ({ ...r }));

  const updateRow = (i, field, val) => {
    const updated = table.map((row, idx) => idx === i ? { ...row, [field]: val } : row);
    onChange(updated);
  };

  const addRow = () => {
    const last = table[table.length - 1];
    onChange([...table, { qty: (last?.qty || 0) + 1, markup: 1.20 }]);
  };

  const removeRow = (i) => {
    if (table.length <= 1) return;
    onChange(table.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground">
          <span>Quantit\u00e0 (soglia)</span>
          <span>Markup</span>
          <span />
        </div>
        {table.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <Input
              type="number"
              value={row.qty}
              onChange={e => updateRow(i, 'qty', parseInt(e.target.value) || 0)}
              className="font-mono text-sm h-8"
            />
            <Input
              type="number"
              step="0.01"
              value={row.markup}
              onChange={e => updateRow(i, 'markup', parseFloat(e.target.value) || 0)}
              className="font-mono text-sm h-8"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => removeRow(i)}
              disabled={table.length <= 1}
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={addRow} className="mt-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
        <Plus className="w-3.5 h-3.5" />
        Aggiungi riga
      </Button>
    </div>
  );
}