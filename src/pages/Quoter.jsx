import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileDown, FilePlus, CheckCircle2, BarChart2, FileBox } from 'lucide-react';
import { generateQuotePdf } from '@/lib/generateQuotePdf';
import { generateCostReportPdf, DEFAULT_DEDICATED } from '@/lib/generateCostReportPdf';
import { toast } from 'sonner';
import QuoteLineCard from '@/components/quote/QuoteLineCard';
import QuoteSummary from '@/components/quote/QuoteSummary';
import ThreeMfUpload from '@/components/quote/ThreeMfUpload';
import DedicatedScenarioCard from '@/components/quote/DedicatedScenarioCard';
import { computeDefaultConfig, computeMaterialTotals, isPricedLine } from '@/lib/pricingEngine';
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
  const [dedicated, setDedicated] = useState({ ...DEFAULT_DEDICATED });
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
      setDedicated({ ...DEFAULT_DEDICATED, ...(q.dedicated_scenario || {}) });
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

  // ── Autosave: ogni modifica fatta dall'utente segna "dirty"; si salva 1,2 s dopo l'ultima ──
  const dirty = useRef(false);
  const edit = (fn) => { dirty.current = true; fn(); };

  useEffect(() => {
    if (!dirty.current) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!clientName.trim()) return;
      saveMutation.mutate({
        client_name: clientName,
        date: quoteDate,
        payment_terms: paymentTerms,
        lines: lines.filter((l) => l.part_name),
        setup_points: setupPoints,
        dedicated_scenario: dedicated,
        status: 'bozza',
      });
    }, 1200);
    return () => clearTimeout(autoSaveTimer.current);
  }, [clientName, quoteDate, paymentTerms, lines, setupPoints, dedicated]);

  const [focusIndex, setFocusIndex] = useState(null);

  const updateLine = (index, newLine) => edit(() => setLines((prev) => prev.map((l, i) => (i === index ? newLine : l))));

  const removeLine = (index) => {
    if (lines.length === 1) return;
    edit(() => setLines((prev) => prev.filter((_, i) => i !== index)));
  };

  const duplicateLine = (index) => edit(() => {
    // La copia ricalcola il prezzo dal motore: il prezzo manuale dell'originale non va copiato
    const copy = { ...JSON.parse(JSON.stringify(lines[index])), manual_price: 0 };
    setLines((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
    setFocusIndex(index + 1);
  });

  // Nuova riga: eredita materiale, sconto e manodopera dall'ultima, così si compila più in fretta
  const addLine = () => edit(() => {
    const last = lines[lines.length - 1];
    const inherited = last && !last.sub_materials?.length
      ? {
          material_code: last.material_code || '',
          labor_time_min: last.labor_time_min || 0,
          quantity: last.quantity || 1,
          partner_discount: !!last.partner_discount,
          continuoativo_discount: !!last.continuoativo_discount,
        }
      : {};
    setLines((prev) => [...prev, { ...EMPTY_LINE, ...inherited }]);
    setFocusIndex(lines.length);
  });

  // Ctrl/⌘ + Invio aggiunge un componente da qualsiasi campo
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addLine(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleNewQuote = () => {
    dirty.current = false;
    currentIdRef.current = null;
    window.history.replaceState(null, '', '/');
    setClientName('');
    setPaymentTerms(PAYMENT_TERMS[0]);
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setLines([{ ...EMPTY_LINE }]);
    setSetupPoints(0);
    setDedicated({ ...DEFAULT_DEDICATED });
    setFocusIndex(0);
  };

  const validLines = lines.filter(isPricedLine);
  const materialTotals = computeMaterialTotals(lines);
  const totalMaterialGrams = lines
    .filter(l => l.part_name)
    .reduce((sum, l) => sum + (l.weight_g || 0) * (l.quantity || 1), 0);

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
    dirty.current = true;
    setLines(prev => {
      const hasOnlyEmpty = prev.length === 1 && !prev[0].part_name && !prev[0].material_code;
      return hasOnlyEmpty ? newLines : [...prev, ...newLines];
    });
    toast.success(`${importedLines.length} componenti importati`);
  };

  const [showImport, setShowImport] = useState(false);
  const exportCostReport = () => generateCostReportPdf({ clientName, date: quoteDate, lines: validLines, materials, config, setupPoints, dedicated });
  const exportClientPdf = () => generateQuotePdf({ clientName, paymentTerms, date: quoteDate, lines, materials, config, setupPoints });

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-[1500px]">
      {/* Testata: cliente, data, pagamento, azioni */}
      <header className="flex flex-col xl:flex-row xl:items-end gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
            {editId || currentIdRef.current ? 'Preventivo' : 'Nuovo preventivo'}
            <span className="text-[hsl(var(--success))] flex items-center gap-1 transition-opacity" style={{ opacity: autoSaved ? 1 : 0 }} aria-live="polite">
              <CheckCircle2 className="w-3.5 h-3.5" /> Salvato
            </span>
            {!clientName.trim() && lines.some((l) => l.part_name) && (
              <span className="text-amber-700">Inserisci il cliente per salvare</span>
            )}
          </p>
          <h1 className="m-0">
            <input
              value={clientName}
              onChange={(e) => edit(() => setClientName(e.target.value))}
              placeholder="Nome cliente"
              aria-label="Cliente"
              className="w-full bg-transparent text-2xl md:text-3xl font-bold outline-none border-b-2 border-transparent hover:border-border focus:border-primary placeholder:text-muted-foreground/50 pb-0.5"
              style={{ fontStretch: '115%' }}
            />
          </h1>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Data</span>
              <Input type="date" value={quoteDate} onChange={(e) => edit(() => setQuoteDate(e.target.value))} className="h-9 w-40" />
            </label>
            <label className="flex flex-col gap-1 min-w-[16rem]">
              <span className="text-[11px] text-muted-foreground">Pagamento</span>
              <Select value={paymentTerms} onValueChange={(v) => edit(() => setPaymentTerms(v))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={handleNewQuote} className="gap-2">
            <FilePlus className="w-4 h-4" /> Nuovo
          </Button>
          <Button variant="outline" onClick={exportCostReport} disabled={validLines.length === 0} className="gap-2">
            <BarChart2 className="w-4 h-4" /> Report costi
          </Button>
          <Button onClick={exportClientPdf} disabled={validLines.length === 0} className="gap-2">
            <FileDown className="w-4 h-4" /> PDF per il cliente
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        {/* Componenti */}
        <div className="space-y-3 min-w-0 qf-list">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Componenti <span className="text-muted-foreground font-normal tabular-nums">{lines.filter((l) => l.part_name).length}</span>
            </h2>
            <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)} className="gap-2" aria-expanded={showImport}>
              <FileBox className="w-4 h-4" /> Importa da .3mf
            </Button>
          </div>

          {showImport && (
            <div className="qf-panel p-4">
              <ThreeMfUpload onImport={(rows) => { handleImport(rows); setShowImport(false); }} />
            </div>
          )}

          {lines.map((line, i) => (
            <QuoteLineCard
              key={i}
              line={line}
              index={i}
              materials={materials}
              config={config}
              materialTotals={materialTotals}
              onChange={updateLine}
              onRemove={removeLine}
              onDuplicate={duplicateLine}
              canRemove={lines.length > 1}
              autoFocus={focusIndex === i}
            />
          ))}

          <button
            type="button"
            onClick={addLine}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-card transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Plus className="w-4 h-4" /> Aggiungi componente
            <span className="qf-kbd ml-1">Ctrl + Invio</span>
          </button>

          <div className="pt-3">
            <DedicatedScenarioCard
              value={dedicated}
              onChange={(v) => edit(() => setDedicated(v))}
              lines={validLines}
              materials={materials}
              config={config}
              setupPoints={setupPoints}
            />
          </div>
        </div>

        {/* Riepilogo */}
        <aside className="xl:sticky xl:top-6 space-y-3 max-w-xl xl:max-w-none">
          <QuoteSummary
            lines={validLines}
            materials={materials}
            config={config}
            materialTotals={materialTotals}
            setupPoints={setupPoints}
            onSetupChange={(v) => edit(() => setSetupPoints(v))}
            totalGrams={totalMaterialGrams}
          />
          {validLines.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              Il riepilogo si riempie quando un componente ha nome e materiale.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
