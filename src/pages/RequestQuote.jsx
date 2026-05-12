import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const QUALITY_OPTIONS = [
  { value: 'prototipo', label: 'Prototipo', desc: 'Veloce, per test e verifiche dimensionali' },
  { value: 'classico', label: 'Classico', desc: 'Equilibrio tra qualità e costo' },
  { value: 'alta_qualita', label: 'Alta Qualità', desc: 'Finitura superiore, strati sottili' },
];

const PERFORMANCE_OPTIONS = [
  { value: 'fast', label: 'Fast', desc: 'Stampa rapida, uso generico' },
  { value: 'classico', label: 'Classico', desc: 'Parametri standard bilanciati' },
  { value: 'performance', label: 'Performance', desc: 'Ottimizzato per resistenza meccanica' },
  { value: 'meccanico', label: 'Meccanico', desc: 'Per parti funzionali e ingegneristiche' },
];

const EMPTY_COMPONENT = {
  file_url: '',
  file_name: '',
  material_code: '',
  quantity: 1,
  quality: 'classico',
  performance: 'classico',
  notes: '',
};

export default function RequestQuote() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: '', last_name: '', company: '', vat_number: '',
    address: '', email: '', phone: '', general_notes: '',
  });

  const [components, setComponents] = useState([{ ...EMPTY_COMPONENT }]);
  const [uploadingIdx, setUploadingIdx] = useState(null);

  const { data: allMaterials = [] } = useQuery({
    queryKey: ['materials-public'],
    queryFn: () => base44.entities.Material.list('-created_date', 200),
  });
  // Solo materiali visibili ai clienti
  const materials = allMaterials.filter(m => m.visible_clients);

  const updateForm = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const updateComponent = (i, field, value) => {
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const addComponent = () => setComponents(prev => [...prev, { ...EMPTY_COMPONENT }]);

  const removeComponent = (i) => {
    if (components.length === 1) return;
    setComponents(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleFileUpload = async (i, file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['stl', 'step', 'stp', '3mf'].includes(ext)) {
      toast.error('Formato non supportato. Usa STL, STEP o 3MF.');
      return;
    }
    setUploadingIdx(i);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    updateComponent(i, 'file_url', file_url);
    updateComponent(i, 'file_name', file.name);
    setUploadingIdx(null);
    toast.success(`${file.name} caricato`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error('Compila almeno nome, cognome e email.');
      return;
    }
    if (components.some(c => !c.file_url)) {
      toast.error('Carica un file 3D per ogni componente.');
      return;
    }
    setLoading(true);
    await base44.entities.QuoteRequest.create({ ...form, components, status: 'nuova' });
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Richiesta inviata!</h2>
          <p className="text-muted-foreground">Abbiamo ricevuto la tua richiesta di preventivo. Ti contatteremo al più presto all'indirizzo <strong>{form.email}</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-bold">3D</span>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Richiesta Preventivo</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Stampa 3D professionale</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Dati personali */}
        <section>
          <h2 className="text-base font-semibold mb-4">Dati di contatto</h2>
          <div className="bg-card rounded-xl border border-border p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome *">
              <Input value={form.first_name} onChange={e => updateForm('first_name', e.target.value)} placeholder="Mario" required />
            </Field>
            <Field label="Cognome *">
              <Input value={form.last_name} onChange={e => updateForm('last_name', e.target.value)} placeholder="Rossi" required />
            </Field>
            <Field label="Email *">
              <Input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="mario@esempio.it" required />
            </Field>
            <Field label="Telefono">
              <Input value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+39 333 1234567" />
            </Field>
            <Field label="Azienda">
              <Input value={form.company} onChange={e => updateForm('company', e.target.value)} placeholder="Acme Srl" />
            </Field>
            <Field label="Partita IVA">
              <Input value={form.vat_number} onChange={e => updateForm('vat_number', e.target.value)} placeholder="IT12345678901" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Indirizzo">
                <Input value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="Via Roma 1, 20100 Milano" />
              </Field>
            </div>
          </div>
        </section>

        {/* Componenti */}
        <section>
          <h2 className="text-base font-semibold mb-1">Componenti da stampare</h2>
          <p className="text-xs text-muted-foreground mb-4">Aggiungi uno o più componenti. Formati accettati: STL, STEP, 3MF.</p>

          <div className="space-y-4">
            {components.map((comp, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5 relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Componente {i + 1}</span>
                  {components.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeComponent(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>

                {/* File upload */}
                <div className="mb-4">
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">File 3D *</Label>
                  {comp.file_url ? (
                    <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-xs text-green-700 font-medium truncate">{comp.file_name}</span>
                      <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => { updateComponent(i, 'file_url', ''); updateComponent(i, 'file_name', ''); }}>
                        Cambia
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                      {uploadingIdx === i ? (
                        <><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Caricamento...</span></>
                      ) : (
                        <><Upload className="w-5 h-5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Clicca o trascina il file</span><span className="text-[10px] text-muted-foreground/70">STL, STEP, 3MF</span></>
                      )}
                      <input type="file" className="hidden" accept=".stl,.step,.stp,.3mf" onChange={e => handleFileUpload(i, e.target.files[0])} />
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Materiale */}
                  <Field label="Materiale">
                    <Select value={comp.material_code} onValueChange={v => updateComponent(i, 'material_code', v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Seleziona materiale" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map(m => (
                          <SelectItem key={m.code} value={m.code} className="text-xs">
                            {m.material_name}{m.color ? ` (${m.color})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Quantità */}
                  <Field label="Quantità">
                    <Input type="number" min={1} value={comp.quantity} onChange={e => updateComponent(i, 'quantity', parseInt(e.target.value) || 1)} className="h-9 text-xs" />
                  </Field>

                  {/* Qualità */}
                  <Field label="Qualità">
                    <Select value={comp.quality} onValueChange={v => updateComponent(i, 'quality', v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUALITY_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            <span className="font-medium">{o.label}</span>
                            <span className="text-muted-foreground ml-1">— {o.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Performance */}
                  <Field label="Performance">
                    <Select value={comp.performance} onValueChange={v => updateComponent(i, 'performance', v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERFORMANCE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            <span className="font-medium">{o.label}</span>
                            <span className="text-muted-foreground ml-1">— {o.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Note componente */}
                  <div className="sm:col-span-2">
                    <Field label="Note componente">
                      <Input value={comp.notes} onChange={e => updateComponent(i, 'notes', e.target.value)} placeholder="Tolleranze, finitura, colore preferito…" className="h-9 text-xs" />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addComponent} className="mt-3 gap-2 text-xs">
            <Plus className="w-3.5 h-3.5" />
            Aggiungi componente
          </Button>
        </section>

        {/* Note generali */}
        <section>
          <h2 className="text-base font-semibold mb-4">Note generali</h2>
          <div className="bg-card rounded-xl border border-border p-5">
            <Textarea
              value={form.general_notes}
              onChange={e => updateForm('general_notes', e.target.value)}
              placeholder="Informazioni aggiuntive, tempistiche richieste, domande..."
              className="min-h-[100px] text-sm resize-none"
            />
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end pb-8">
          <Button type="submit" size="lg" disabled={loading} className="gap-2 px-8">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Invio in corso...' : 'Invia Richiesta'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}