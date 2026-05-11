import React, { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search } from 'lucide-react';

export default function MaterialSelector({ materials, value, onChange, hint }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Quando si apre con un hint (tipo filamento), pre-filtra
  const handleOpenChange = (o) => {
    if (o && hint && !search) setSearch(hint);
    if (!o) setSearch('');
    setOpen(o);
  };

  const selected = materials.find(m => m.code === value);

  const filtered = useMemo(() => {
    if (!search) return materials;
    const q = search.toLowerCase();
    return materials.filter(m =>
      m.material_name?.toLowerCase().includes(q) ||
      m.brand?.toLowerCase().includes(q) ||
      m.color?.toLowerCase().includes(q) ||
      m.code?.toLowerCase().includes(q)
    );
  }, [materials, search]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-left font-normal h-9 text-xs">
          {selected ? (
            <span className="truncate">
              {selected.material_name} - {selected.brand} ({selected.color})
            </span>
          ) : (
            <span className="text-muted-foreground">{hint ? `${hint} – seleziona...` : 'Seleziona materiale...'}</span>
          )}
          <ChevronDown className="w-3 h-3 ml-1 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca materiale..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-auto">
          {filtered.map(m => (
            <button
              key={m.code}
              onClick={() => { onChange(m.code); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex justify-between items-center ${
                value === m.code ? 'bg-primary/10 text-primary' : ''
              }`}
            >
              <div>
                <span className="font-medium">{m.material_name}</span>
                <span className="text-muted-foreground ml-1">- {m.brand} ({m.color})</span>
              </div>
              <span className="font-mono text-muted-foreground">€{m.price_per_gram?.toFixed(4)}/g</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center">Nessun materiale trovato</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}