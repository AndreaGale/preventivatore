import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileDown, FilePlus, CheckCircle2 } from 'lucide-react';
import { generateQuotePdf } from '@/lib/generateQuotePdf';
import { toast } from 'sonner';
import QuoteLineRow from '@/components/quote/QuoteLineRow';
import QuoteSummary from '@/components/quote/QuoteSummary';
import ThreeMfUpload from '@/components/quote/ThreeMfUpload';
import { computeDefaultConfig, computeMaterialTotals } from '@/lib/pricingEngine';
import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';

const PAYMENT_TERMS = [
  'DATA FATTURA FINE MESE',
  '30% ANTICIPO FATTURA, POI CONSEGNA FINE MESE',
  '30 GG DATA FATTURA FINE MESE',
  '60 GG DATA FATTURA FINE MESE',
  '90 GG DATA FATTURA FINE MESE',
];

const EMPTY_LINE = {
  part_name: '',
  material_code: '',
  weight_g: 0,
  print_time_min: 0,
  labor_time_min: 0,
  quantity: 1,
  manual_price: 0,
};

export default function Quoter() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('id');

  const [clientName, setClientName] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS[0]);
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [setupPoints, setSetupPoints] = useState(0);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef(null);
  const currentIdRef = useRef(editId); // traccia l'id corrente (utile dopo primo salvataggio auto)

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: () => base44.entities.Material.list('-created_date', 200),
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['business-config'],
    queryFn: () => base44.entities.BusinessConfig.list(),
  });

  const config = configs.length > 0 ? configs[0] : computeDefaultConfig();

  // Carica preventivo esistente se c'è un id nell'URL
  const { data: existingQuote } = useQuery({
    queryKey: ['quote', editId],
    queryFn: () => base44.entities.Quote.filter({ id: editId }),
    enabled: !!editId,
  });

  useEffect(() => {
    if (existingQuote && existingQuote.length > 0) {
      const q = existingQuote[0];
      setClientName(q.client_name || '');
      setPaymentTerms(q.payment_terms || PAYMENT_TERMS[0]);
      setQuoteDate(q.date || new Date().toISOString().split('T')[0]);
      setLines(q.lines && q.lines.length > 0 ? q.lines : [{ ...EMPTY_LINE }]);
      setSetupPoints(q.setup_points || 0);
    }
  }, [existingQuote]);

  const saveMutation = useMutation({
    mutationFn: (data) => currentIdRef.current
      ? base44.entities.Quote.update(currentIdRef.current, data)
      : base44.entities.Quote.create(data),
    onSuccess: (result) => {
      // Se era un create, aggiorna l'URL e il ref senza ricaricare
      if (!currentIdRef.current && result?.id) {
        currentIdRef.current = result.id;
        window.history.replaceState(null, '', `/?id=${result.id}`);
      }
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  // Autosave con debounce 1.5s, solo se c'è almeno il nome cliente
  const scheduleAutoSave = (data) => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (data.clientName.trim()) {
        saveMutation.mutate({
          client_name: data.clientName,
          date: data.quoteDate,
          payment_terms: data.paymentTerms,
          lines: data.lines.filter(l => l.part_name),
          setup_points: data.setupPoints ?? setupPoints,
          status: 'bozza',
        });
      }
    }, 1500);
  };

  const updateLine = (index, newLine) => {
    const updated = [...lines];
    updated[index] = newLine;
    setLines(updated);
    scheduleAutoSave({ clientName, quoteDate, paymentTerms, lines: updated, setupPoints });
  };

  const removeLine = (index) => {
    if (lines.length === 1) return;
    const updated = lines.filter((_, i) => i !== index);
    setLines(updated);
    scheduleAutoSave({ clientName, quoteDate, paymentTerms, lines: updated });
  };

  const addLine = () => {
    const updated = [...lines, { ...EMPTY_LINE }];
    setLines(updated);
  };

  const handleNewQuote = () => {
    currentIdRef.current = null;
    window.history.replaceState(null, '', '/');
    setClientName('');
    setPaymentTerms(PAYMENT_TERMS[0]);
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setLines([{ ...EMPTY_LINE }]);
  };

  const validLines = lines.filter(l => l.part_name && l.material_code);
  const materialTotals = computeMaterialTotals(lines);

  // Cerca il miglior materiale corrispondente al tipo filamento con logica fuzzy a token
  const autoMatchMaterial = (filamentType) => {
    if (!filamentType || materials.length === 0) return '';
    const ft = filamentType.toLowerCase().trim();
    const tokens = ft.split(/[\s\-_]+/).filter(Boolean);

    const score = (m) => {
      const fields = [
        m.material_name?.toLowerCase() || '',
        m.brand?.toLowerCase() || '',
        m.color?.toLowerCase() || '',
        m.code?.toLowerCase() || '',
      ];
      const all = fields.join(' ');
      if (fields.some(f => f === ft)) return 1000; // match esatto
      if (fields.some(f => f.includes(ft))) return 100; // substring esatta
      // conta quanti token combaciano
      return tokens.filter(t => all.includes(t)).length;
    };

    const best = materials
      .map(m => ({ m, s: score(m) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)[0];

    return best ? best.m.code : '';
  };

  // Quando arrivano righe dal parser 3MF, le aggiunge (o sostituisce la riga vuota iniziale)
  const handleImport = (importedLines) => {
    const newLines = importedLines.map(r => {
      const hasSubMaterials = r.sub_materials && r.sub_materials.length > 0;
      if (hasSubMaterials) {
        // Multi-materiale: assegna material_code a ogni sub-materiale
        const subWithMatch = r.sub_materials.map(sm => ({
          ...sm,
          material_code: sm.material_code || autoMatchMaterial(sm.filament_type),
        }));
        return {
          ...EMPTY_LINE,
          part_name: r.part_name || '',
          weight_g: r.weight_g || 0,
          print_time_min: r.print_time_min || 0,
          sub_materials: subWithMatch,
        };
      } else {
        // Singolo materiale
        const filamentType = r.filament_type || '';
        return {
          ...EMPTY_LINE,
          part_name: r.part_name || '',
          weight_g: r.weight_g || 0,
          print_time_min: r.print_time_min || 0,
          material_code: autoMatchMaterial(filamentType),
        };
      }
    });
    setLines(prev => {
      const hasOnlyEmpty = prev.length === 1 && !prev[0].part_name && !prev[0].material_code;
      return hasOnlyEmpty ? newLines : [...prev, ...newLines];
    });
    toast.success(`${importedLines.length} componenti importati`);
  };

  return (
    <div className="p-6 lg:p-8 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {editId ? `Preventivo — ${clientName || '...'}` : 'Nuovo Preventivo'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Calcola il prezzo di vendita dei tuoi prodotti 3D</p>
        </div>
        <div className="flex items-center gap-2">
          {autoSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Salvato
            </span>
          )}
          <Button variant="outline" onClick={handleNewQuote} className="gap-2">
            <FilePlus className="w-4 h-4" />
            Nuovo
          </Button>
          <Button variant="outline" onClick={() => generateQuotePdf({ clientName, paymentTerms, date: quoteDate, lines, materials, config, setupPoints })} className="gap-2">
            <FileDown className="w-4 h-4" />
            Esporta PDF
          </Button>
        </div>
      </div>

      {/* 3MF Upload */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Importa da file .3mf</p>
        <ThreeMfUpload onImport={handleImport} />
      </div>

      {/* Client Info */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cliente</Label>
            <Input
              value={clientName}
              onChange={e => { setClientName(e.target.value); scheduleAutoSave({ clientName: e.target.value, quoteDate, paymentTerms, lines }); }}
              placeholder="Nome cliente"
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data</Label>
            <Input
              type="date"
              value={quoteDate}
              onChange={e => { setQuoteDate(e.target.value); scheduleAutoSave({ clientName, quoteDate: e.target.value, paymentTerms, lines }); }}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pagamento</Label>
            <Select value={paymentTerms} onValueChange={v => { setPaymentTerms(v); scheduleAutoSave({ clientName, quoteDate, paymentTerms: v, lines }); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Lines Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="p-2 text-xs font-medium text-muted-foreground text-center w-10">#</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-left min-w-[160px]">Componente</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-left min-w-[200px]">Materiale</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Peso (g)</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">T.Stampa (min)</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">T.MDO (min)</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Qtà</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Mat. €</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Macch. €</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">MDO €</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">+Fail</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Markup</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Prezzo Man.</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-center">Partner</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Totale</th>
                <th className="p-2 text-xs font-medium text-muted-foreground text-right">Al pz</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <QuoteLineRow
                  key={i}
                  line={line}
                  index={i}
                  materials={materials}
                  config={config}
                  onChange={updateLine}
                  onRemove={removeLine}
                  materialTotals={materialTotals}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={addLine} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
            <Plus className="w-3.5 h-3.5" />
            Aggiungi riga
          </Button>
        </div>
      </div>

      {/* Attrezzaggio */}
      <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Attrezzaggio e preparazione file</p>
          <p className="text-xs text-muted-foreground mt-0.5">€15,00 per punto — totale: <span className="font-mono font-semibold text-foreground">€{(setupPoints * 15).toFixed(2)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { const v = Math.max(0, setupPoints - 1); setSetupPoints(v); scheduleAutoSave({ clientName, quoteDate, paymentTerms, lines, setupPoints: v }); }}
            className="w-8 h-8 rounded-lg border border-border bg-muted hover:bg-muted/80 flex items-center justify-center text-lg font-bold text-foreground transition-colors"
          >−</button>
          <span className="w-10 text-center text-lg font-bold font-mono text-foreground">{setupPoints}</span>
          <button
            type="button"
            onClick={() => { const v = setupPoints + 1; setSetupPoints(v); scheduleAutoSave({ clientName, quoteDate, paymentTerms, lines, setupPoints: v }); }}
            className="w-8 h-8 rounded-lg border border-border bg-muted hover:bg-muted/80 flex items-center justify-center text-lg font-bold text-foreground transition-colors"
          >+</button>
        </div>
      </div>

      {/* Summary */}
      {validLines.length > 0 && (
        <div className="max-w-sm ml-auto">
          <QuoteSummary lines={validLines} materials={materials} config={config} materialTotals={materialTotals} setupPoints={setupPoints} />
        </div>
      )}
    </div>
  );
}