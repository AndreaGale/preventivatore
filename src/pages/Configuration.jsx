import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { computeDefaultConfig, computeDerivedCosts, getMarkupTable } from '@/lib/pricingEngine';

const FIELDS = [
  { section: 'Costi Fissi', fields: [
    { key: 'monthly_fixed_costs', label: 'Costi Fissi Mensili', unit: '€', desc: 'Affitto, Mkt, Software' },
    { key: 'working_days_per_month', label: 'Giorni lavorativi/mese', unit: 'gg' },
    { key: 'hours_per_day', label: 'Ore operative/giorno', unit: 'h' },
    { key: 'num_printers', label: 'Stampanti disponibili', unit: 'pz' },
    { key: 'farm_efficiency', label: 'Efficienza Farm', unit: '%', isPercent: true },
  ]},
  { section: 'Costi Macchina', fields: [
    { key: 'printer_cost', label: 'Costo Stampante Media', unit: '€' },
    { key: 'printer_lifespan_years', label: 'Vita Stimata', unit: 'anni' },
    { key: 'maintenance_cost_per_hour', label: 'Manutenzione/Ricambi', unit: '€/h' },
    { key: 'power_consumption_kw', label: 'Consumo Elettrico Medio', unit: 'kW' },
    { key: 'energy_cost_per_kwh', label: 'Costo Energia', unit: '€/kWh' },
  ]},
  { section: 'Manodopera & Margini', fields: [
    { key: 'monthly_gross_salary', label: 'Stipendio Lordo Mensile', unit: '€' },
    { key: 'monthly_work_hours', label: 'Ore Lavorative Mensili', unit: 'h' },
    { key: 'fail_rate', label: 'Fail Rate', unit: '%', isPercent: true },
  ]},
];

export default function Configuration() {
  const queryClient = useQueryClient();
  const defaultConfig = computeDefaultConfig();
  const [form, setForm] = useState(defaultConfig);
  const [configId, setConfigId] = useState(null);

  const { data: configs = [] } = useQuery({
    queryKey: ['business-config'],
    queryFn: () => base44.entities.BusinessConfig.list(),
  });

  useEffect(() => {
    if (configs.length > 0) {
      setForm(configs[0]);
      setConfigId(configs[0].id);
    }
  }, [configs]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (configId) {
        return base44.entities.BusinessConfig.update(configId, data);
      }
      return base44.entities.BusinessConfig.create(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['business-config'] });
      if (!configId && result?.id) setConfigId(result.id);
      toast.success('Configurazione salvata');
    },
  });

  const derived = computeDerivedCosts(form);
  const markupTable = getMarkupTable();

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurazione</h1>
          <p className="text-sm text-muted-foreground mt-1">Parametri aziendali e costi fissi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setForm(defaultConfig)} className="gap-2 text-sm">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
          <Button onClick={() => saveMutation.mutate(form)} className="gap-2 text-sm">
            <Save className="w-3.5 h-3.5" />
            Salva
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {FIELDS.map(section => (
          <Card key={section.section}>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold">{section.section}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.fields.map(f => (
                  <div key={f.key}>
                    <Label className="text-xs text-muted-foreground">{f.label}</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        step={f.isPercent ? '0.01' : '1'}
                        value={f.isPercent ? ((form[f.key] || 0) * 100) : (form[f.key] || '')}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setForm({ ...form, [f.key]: f.isPercent ? val / 100 : val });
                        }}
                        className="font-mono text-sm"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{f.unit}</span>
                    </div>
                    {f.desc && <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Derived costs */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Costi Calcolati (automatici)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DerivedField label="Costo Fisso Orario" value={derived.fixedCostPerHour} unit="€/h" />
              <DerivedField label="Ammortamento Orario" value={derived.depreciationPerHour} unit="€/h" />
              <DerivedField label="Costo Energia Orario" value={derived.energyCostPerHour} unit="€/h" />
              <DerivedField label="Costo Orario Macchina Totale" value={derived.totalMachineCostPerHour} unit="€/h" highlight />
              <DerivedField label="Costo Minuto Macchina" value={derived.machineCostPerMinute} unit="€/min" />
              <DerivedField label="Costo Orario MDO" value={derived.laborCostPerHour} unit="€/h" highlight />
            </div>
          </CardContent>
        </Card>

        {/* Markup table */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Tabella Markup</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {markupTable.map(row => (
                <div key={row.qty} className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{row.qty} pz</p>
                  <p className="font-mono font-bold text-sm text-primary">x{row.markup.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DerivedField({ label, value, unit, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-primary/10' : 'bg-muted'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono font-bold text-sm mt-0.5 ${highlight ? 'text-primary' : 'text-foreground'}`}>
        {value.toFixed(4)} {unit}
      </p>
    </div>
  );
}