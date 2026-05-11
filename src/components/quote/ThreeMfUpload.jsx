import React, { useState, useRef } from 'react';
import { parse3MF } from '@/lib/threeMfParser';
import { Button } from '@/components/ui/button';
import { FileBox, AlertCircle, Loader2, X, ChevronDown, ChevronRight, Package, Clock, CheckCircle2, Layers } from 'lucide-react';

/**
 * Mostra l'anteprima strutturata del 3MF (piatti → oggetti)
 * e chiama onImport(lines) con le righe pronte per il Quoter.
 */
export default function ThreeMfUpload({ onImport }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedFiles, setParsedFiles] = useState([]);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const inputRef = useRef();

  const processFiles = async (files) => {
    const threeMfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.3mf'));
    if (threeMfFiles.length === 0) {
      setError('Nessun file .3mf trovato. Carica file esportati dallo slicer (Bambu Studio, OrcaSlicer, PrusaSlicer).');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const results = await Promise.all(threeMfFiles.map(f => parse3MF(f)));
      setParsedFiles(results);
      // Espandi tutto di default
      const exp = {};
      results.forEach((r, fi) => r.plates.forEach((_, pi) => { exp[`${fi}-${pi}`] = true; }));
      setExpanded(exp);
    } catch (e) {
      setError('Errore durante la lettura del file: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const onFileInput = (e) => {
    processFiles(e.target.files);
    e.target.value = '';
  };

  const clear = () => {
    setParsedFiles([]);
    setError(null);
    setExpanded({});
  };

  const togglePlate = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  // Aggrega tutte le righe visibili e le passa al Quoter
  const handleImport = () => {
    const lines = [];
    parsedFiles.forEach(file => {
      file.plates.forEach(plate => {
        plate.objects.forEach(obj => {
          lines.push({
            part_name: obj.name || file.fileName,
            material_code: '',             // l'utente seleziona dopo
            weight_g: obj.weight_g || 0,
            print_time_min: plate.print_time_min || 0,
            labor_time_min: 0,
            quantity: 1,
            manual_price: 0,
            _hint_filament_type: obj.filament_type,
            _hint_has_support: obj.has_support,
            _hint_support_weight_g: obj.support_weight_g,
          });

          // Se ha il supporto, aggiungi una riga separata per il supporto
          if (obj.has_support && obj.support_weight_g) {
            lines.push({
              part_name: `${obj.name || file.fileName} – Supporto`,
              material_code: '',
              weight_g: obj.support_weight_g,
              print_time_min: 0,
              labor_time_min: 0,
              quantity: 1,
              manual_price: 0,
              _hint_filament_type: obj.filament_type,
              _hint_has_support: false,
              _hint_support_weight_g: null,
            });
          }
        });
      });
    });
    onImport(lines);
    clear();
  };

  const totalObjects = parsedFiles.reduce((sum, f) => sum + f.plates.reduce((s, p) => s + p.objects.length, 0), 0);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {parsedFiles.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
        >
          <input ref={inputRef} type="file" accept=".3mf" multiple className="hidden" onChange={onFileInput} />
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Lettura file in corso...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileBox className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Carica file .3mf</p>
              <p className="text-xs text-muted-foreground">
                Trascina qui o clicca · Bambu Studio, OrcaSlicer, PrusaSlicer
              </p>
            </div>
          )}
        </div>
      )}

      {/* Errore */}
      {error && (
        <div className="flex items-start gap-2 text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {/* Anteprima strutturata */}
      {parsedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-xs font-semibold text-foreground">
                {parsedFiles.length} file · {totalObjects} componenti trovati
              </p>
            </div>
            <button onClick={clear} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {parsedFiles.map((file, fi) => (
            <div key={fi} className="rounded-xl border border-border overflow-hidden">
              {/* File header */}
              <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                <FileBox className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground truncate">{file.fileName}</span>
                <span className="text-xs text-muted-foreground ml-auto">{file.slicer}</span>
              </div>

              {/* Piatti */}
              {file.plates.map((plate, pi) => {
                const key = `${fi}-${pi}`;
                const isOpen = expanded[key];
                return (
                  <div key={pi}>
                    {/* Plate header */}
                    <button
                      onClick={() => togglePlate(key)}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/30 transition-colors border-t border-border"
                    >
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium">Piatto {plate.plate_idx}</span>
                      {plate.print_time_min != null && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {plate.print_time_min} min
                        </span>
                      )}
                    </button>

                    {/* Oggetti del piatto */}
                    {isOpen && (
                      <div className="divide-y divide-border/50">
                        {plate.objects.map((obj, oi) => (
                          <div key={oi} className="px-4 py-2.5 flex items-center gap-3 bg-card">
                            <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{obj.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {obj.filament_color && (
                                  <span
                                    className="w-3 h-3 rounded-full border border-border shrink-0"
                                    style={{ backgroundColor: obj.filament_color }}
                                  />
                                )}
                                {obj.filament_type && (
                                  <span className="text-xs text-muted-foreground">{obj.filament_type}</span>
                                )}
                                {obj.has_support && (
                                  <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1.5 py-0.5 font-medium">
                                    + supporto
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {obj.weight_g != null && (
                                <p className="text-xs font-mono font-bold">{obj.weight_g.toFixed(1)}g</p>
                              )}
                              {obj.has_support && obj.support_weight_g && (
                                <p className="text-xs font-mono text-amber-600">+{obj.support_weight_g.toFixed(1)}g supp</p>
                              )}
                              {obj.weight_g == null && (
                                <p className="text-xs text-muted-foreground">—</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Pulsante importa */}
          <Button onClick={handleImport} className="w-full gap-2" size="sm">
            Importa {totalObjects} componenti nel preventivo
          </Button>
        </div>
      )}
    </div>
  );
}