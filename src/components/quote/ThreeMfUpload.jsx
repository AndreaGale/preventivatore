import React, { useState, useRef } from 'react';
import { parse3MF } from '@/lib/threeMfParser';
import { Button } from '@/components/ui/button';
import { Upload, FileBox, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

/**
 * Componente drag-and-drop per caricare uno o più file .3mf
 * Chiama onParsed(results) con array di { part_name, weight_g, print_time_min, slicer, filaments }
 */
export default function ThreeMfUpload({ onParsed }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
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
      const parsed = await Promise.all(threeMfFiles.map(f => parse3MF(f)));
      setResults(parsed);
      onParsed(parsed);
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
    setResults([]);
    setError(null);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
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
        <input
          ref={inputRef}
          type="file"
          accept=".3mf"
          multiple
          className="hidden"
          onChange={onFileInput}
        />
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

      {/* Errore */}
      {error && (
        <div className="flex items-start gap-2 text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {/* Risultati */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Dati estratti</p>
            <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {results.map((r, i) => (
            <div key={i} className="bg-muted/50 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{r.part_name}</p>
                  <p className="text-xs text-muted-foreground">{r.slicer}</p>
                </div>
              </div>
              <div className="flex gap-3 shrink-0 text-right">
                <div>
                  <p className="text-xs font-mono font-bold">
                    {r.weight_g != null ? `${r.weight_g.toFixed(1)}g` : <span className="text-muted-foreground">—</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">peso</p>
                </div>
                <div>
                  <p className="text-xs font-mono font-bold">
                    {r.print_time_min != null ? `${r.print_time_min}min` : <span className="text-muted-foreground">—</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">tempo</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}