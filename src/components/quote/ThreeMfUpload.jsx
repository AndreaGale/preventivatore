import React, { useState, useRef } from 'react';
import { parse3MF } from '@/lib/threeMfParser';
import { Button } from '@/components/ui/button';
import { FileBox, AlertCircle, Loader2, X, ChevronDown, ChevronRight, Package, Clock, CheckCircle2, Layers, Zap } from 'lucide-react';

/**
 * Carica uno o più file .3mf, mostra l'anteprima strutturata (piatti → filamenti + oggetti)
 * e chiama onImport(lines) con le righe pronte per il Quoter.
 *
 * In Bambu Studio / OrcaSlicer i dati reali nel slice_info.config sono:
 *   - <plate> con <metadata key="print_time" value="1h54m20s"/>
 *   - <filament id="1" type="PLA" color="#..." used_g="83.39" used_m="28.89"/>
 *   - <object name="NomeComponente"/>
 *
 * Un piatto può avere più filamenti → genera una riga per filamento.
 * Gli oggetti (nomi) sono mostrati come riferimento ma non generano righe separate
 * perché nel formato Bambu non c'è un mapping diretto oggetto↔filamento.
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
      setError('Nessun file .3mf trovato. Carica file slicizzati da Bambu Studio, OrcaSlicer o PrusaSlicer.');
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

  const clear = () => { setParsedFiles([]); setError(null); setExpanded({}); };
  const togglePlate = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  // Genera righe per il Quoter:
  // Una riga per PIATTO (= un componente), con peso totale di tutti i filamenti sommati.
  // Il nome viene preso dall'oggetto del piatto (es. "E130 BASE DI CENTRAGGIO 2026.STL").
  const handleImport = () => {
    const lines = [];
    parsedFiles.forEach(file => {
      file.plates.forEach(plate => {
        const partName = plate.objects[0]?.name?.replace(/\.stl$/i, '').trim()
          || file.fileName;
        const totalWeight = plate.filaments.reduce((s, f) => s + (f.used_g || 0), 0);

        if (plate.filaments.length > 1) {
          // Multi-materiale: sub_materials con peso per ciascun filamento
          lines.push({
            part_name: partName,
            material_code: '',
            weight_g: Math.round(totalWeight * 100) / 100,
            print_time_min: plate.print_time_min || 0,
            labor_time_min: 0,
            quantity: 1,
            manual_price: 0,
            sub_materials: plate.filaments.map(fil => ({
              filament_type: fil.type || '',
              filament_color: fil.color || '',
              material_code: '',
              weight_g: Math.round((fil.used_g || 0) * 100) / 100,
            })),
          });
        } else {
          lines.push({
            part_name: partName,
            material_code: '',
            weight_g: Math.round(totalWeight * 100) / 100,
            print_time_min: plate.print_time_min || 0,
            labor_time_min: 0,
            quantity: 1,
            manual_price: 0,
          });
        }
      });
    });
    onImport(lines);
    clear();
  };

  const totalLines = parsedFiles.reduce((sum, f) => sum + f.plates.length, 0);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {parsedFiles.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
        >
          <input ref={inputRef} type="file" accept=".3mf" multiple className="hidden" onChange={onFileInput} />
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Lettura file in corso...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileBox className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Carica file .3mf slicizzato</p>
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

      {/* Anteprima */}
      {parsedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-xs font-semibold text-foreground">
                {parsedFiles.length} file · {totalLines} componenti
              </p>
            </div>
            <button onClick={clear} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {parsedFiles.map((file, fi) => (
            <div key={fi} className="rounded-xl border border-border overflow-hidden">
              {/* File header */}
              <div className="bg-muted/60 px-4 py-2 flex items-center gap-2">
                <FileBox className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate flex-1">{file.fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">{file.slicer}</span>
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
                      {plate.printer_model && (
                        <span className="text-xs text-muted-foreground">· {plate.printer_model}</span>
                      )}
                      {plate.support_used && (
                        <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1.5 py-0.5 font-medium">supporto</span>
                      )}
                      {plate.print_time_min != null && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {plate.print_time_min} min
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-border/40">
                        {/* Filamenti */}
                        {plate.filaments.length > 0 && (
                          <div className="px-4 py-2 bg-card space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Filamenti</p>
                            {plate.filaments.map((fil, fli) => (
                              <div key={fli} className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full border border-border shrink-0"
                                  style={{ backgroundColor: fil.color || '#888' }}
                                />
                                <span className="text-xs font-medium flex-1">{fil.type || `Filamento ${fil.id}`}</span>
                                <span className="text-xs font-mono text-muted-foreground">
                                  {fil.used_g > 0 ? `${fil.used_g.toFixed(1)}g` : '—'}
                                </span>
                                {fil.used_m > 0 && (
                                  <span className="text-xs font-mono text-muted-foreground">
                                    {fil.used_m.toFixed(1)}m
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Oggetti / Componenti */}
                        {plate.objects.length > 0 && (
                          <div className="px-4 py-2 bg-muted/20 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Componenti</p>
                            {plate.objects.map((obj, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs truncate">{obj.name}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Nessun dato */}
                        {plate.filaments.length === 0 && plate.objects.length === 0 && (
                          <div className="px-4 py-3 bg-card">
                            <p className="text-xs text-muted-foreground italic">
                              Nessun dato trovato — il file potrebbe non essere slicizzato.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <Button onClick={handleImport} className="w-full gap-2" size="sm">
            <Zap className="w-4 h-4" />
            Importa {totalLines} righe nel preventivo
          </Button>
        </div>
      )}
    </div>
  );
}