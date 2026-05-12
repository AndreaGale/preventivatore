import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Trash2, Download, RefreshCw } from 'lucide-react';
import { downloadMaterialTemplate } from '@/lib/exportMaterialTemplate';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1l06n8BLvqUyaXri4nTedsNoNu6cTAWyC8ypiC1cNr_U/export?format=csv&gid=1973544283';

function parseEuro(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace('€', '').replace(',', '.').trim()) || 0;
}

async function syncFromSheet(existingMaterials, createFn, updateFn) {
  const res = await fetch(SHEET_CSV_URL);
  const text = await res.text();
  const lines = text.trim().split('\n');
  // Skip header row
  const rows = lines.slice(1);
  
  let created = 0, updated = 0, skipped = 0;
  
  for (const row of rows) {
    // CSV parse (handles quoted fields)
    const cols = row.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || row.split(',');
    const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
    
    const code = clean[0];
    const material_name = clean[1];
    const brand = clean[2];
    const color = clean[3];
    const price_per_spool = parseEuro(clean[4]);
    const spool_weight = parseFloat(clean[5]) || 1000;
    const price_per_gram = parseEuro(clean[6]);
    
    if (!code || code === 'N/A' || !material_name || material_name === 'N/A') {
      skipped++;
      continue;
    }
    
    const existing = existingMaterials.find(m => m.code === code);
    const data = { code, material_name, brand, color, price_per_spool, spool_weight, price_per_gram };
    
    if (existing) {
      if (existing.price_per_gram !== price_per_gram || existing.price_per_spool !== price_per_spool) {
        await updateFn(existing.id, data);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await createFn(data);
      created++;
    }
  }
  
  return { created, updated, skipped };
}

export default function Materials() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [newMat, setNewMat] = useState({ code: '', material_name: '', brand: '', color: '', price_per_spool: 0, spool_weight: 1000, price_per_gram: 0 });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => base44.entities.Material.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Material.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setShowAdd(false);
      toast.success('Materiale aggiunto');
      setNewMat({ code: '', material_name: '', brand: '', color: '', price_per_spool: 0, spool_weight: 1000, price_per_gram: 0 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Material.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Materiale eliminato');
    },
  });

  const filtered = materials.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.material_name?.toLowerCase().includes(q) || m.brand?.toLowerCase().includes(q) || m.color?.toLowerCase().includes(q);
  });

  const handleSync = async () => {
    setSyncing(true);
    const { created, updated, skipped } = await syncFromSheet(
      materials,
      (data) => base44.entities.Material.create(data),
      (id, data) => base44.entities.Material.update(id, data)
    );
    queryClient.invalidateQueries({ queryKey: ['materials'] });
    setSyncing(false);
    toast.success(`Sync completato: ${created} aggiunti, ${updated} aggiornati, ${skipped} invariati`);
  };

  const handleSpoolChange = (field, value) => {
    const updated = { ...newMat, [field]: value };
    if (field === 'price_per_spool' || field === 'spool_weight') {
      updated.price_per_gram = updated.spool_weight > 0 ? updated.price_per_spool / updated.spool_weight : 0;
    }
    setNewMat(updated);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Database Materiali</h1>
          <p className="text-sm text-muted-foreground mt-1">{materials.length} materiali registrati</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadMaterialTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Template Excel
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizzazione...' : 'Sync Google Sheets'}
          </Button>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Aggiungi Materiale
          </Button>
        </div>
      </div>

      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Cerca materiale, brand, colore..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="p-3 text-xs font-medium text-muted-foreground text-left">Codice</th>
                <th className="p-3 text-xs font-medium text-muted-foreground text-left">Materiale</th>
                <th className="p-3 text-xs font-medium text-muted-foreground text-left">Brand</th>
                <th className="p-3 text-xs font-medium text-muted-foreground text-left">Colore</th>
                <th className="p-3 text-xs font-medium text-muted-foreground text-right">€/Bobina</th>
                <th className="p-3 text-xs font-medium text-muted-foreground text-right">Peso (g)</th>
                <th className="p-3 text-xs font-medium text-muted-foreground text-right">€/g</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">Caricamento...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">Nessun materiale trovato</td></tr>
              ) : (
                filtered.map(m => (
                  <tr key={m.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                    <td className="p-3 text-xs font-mono text-muted-foreground">{m.code}</td>
                    <td className="p-3 text-sm font-medium">{m.material_name}</td>
                    <td className="p-3 text-sm">{m.brand}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">{m.color}</Badge>
                    </td>
                    <td className="p-3 text-sm font-mono text-right">€{m.price_per_spool?.toFixed(2)}</td>
                    <td className="p-3 text-sm font-mono text-right">{m.spool_weight}g</td>
                    <td className="p-3 text-sm font-mono text-right font-medium text-primary">€{m.price_per_gram?.toFixed(4)}</td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteMutation.mutate(m.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi Materiale</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Codice</Label>
                <Input value={newMat.code} onChange={e => setNewMat({ ...newMat, code: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Materiale</Label>
                <Input value={newMat.material_name} onChange={e => setNewMat({ ...newMat, material_name: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Brand</Label>
                <Input value={newMat.brand} onChange={e => setNewMat({ ...newMat, brand: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Colore</Label>
                <Input value={newMat.color} onChange={e => setNewMat({ ...newMat, color: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">€/Bobina</Label>
                <Input type="number" step="0.01" value={newMat.price_per_spool || ''} onChange={e => handleSpoolChange('price_per_spool', parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Peso bobina (g)</Label>
                <Input type="number" value={newMat.spool_weight || ''} onChange={e => handleSpoolChange('spool_weight', parseFloat(e.target.value) || 1000)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">€/g (auto)</Label>
                <Input type="number" value={newMat.price_per_gram?.toFixed(6)} readOnly className="mt-1 bg-muted font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annulla</Button>
            <Button onClick={() => createMutation.mutate(newMat)}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}