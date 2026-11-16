import React, { useEffect, useRef, useState } from 'react';

/**
 * Campo durata in giorni / ore / minuti.
 * Il valore esterno resta in minuti totali (print_time_min), così il motore prezzi non cambia.
 */
export function splitMinutes(total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  return { d: Math.floor(t / 1440), h: Math.floor((t % 1440) / 60), m: t % 60 };
}

export function formatMinutes(total) {
  const { d, h, m } = splitMinutes(total);
  const parts = [];
  if (d) parts.push(`${d}g`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

const toStr = (n) => (n ? String(n) : '');

export default function DurationInput({ value, onChange, showDays = true }) {
  const [parts, setParts] = useState(() => {
    const s = splitMinutes(value);
    return { d: toStr(s.d), h: toStr(s.h), m: toStr(s.m) };
  });
  const lastEmitted = useRef(Math.round(Number(value) || 0));

  // Allinea i campi se il valore cambia dall'esterno (import 3MF, duplica, carica preventivo)
  useEffect(() => {
    const v = Math.round(Number(value) || 0);
    if (v !== lastEmitted.current) {
      const s = splitMinutes(v);
      setParts({ d: toStr(s.d), h: toStr(s.h), m: toStr(s.m) });
      lastEmitted.current = v;
    }
  }, [value]);

  const set = (key, raw) => {
    const clean = raw.replace(/[^\d]/g, '');
    const next = { ...parts, [key]: clean };
    setParts(next);
    const total = (parseInt(next.d) || 0) * 1440 + (parseInt(next.h) || 0) * 60 + (parseInt(next.m) || 0);
    lastEmitted.current = total;
    onChange(total);
  };

  // Su blur normalizza (es. 90 min → 1h 30m)
  const normalize = () => {
    const s = splitMinutes(lastEmitted.current);
    setParts({ d: toStr(s.d), h: toStr(s.h), m: toStr(s.m) });
  };

  const fields = showDays ? [['d', 'g'], ['h', 'h'], ['m', 'm']] : [['h', 'h'], ['m', 'm']];

  return (
    <div
      className="qf-field qf-duration"
      title={`${lastEmitted.current} minuti totali`}
    >
      {fields.map(([key, unit]) => (
        <label key={key} className="flex items-baseline flex-1 min-w-0 justify-center">
          <input
            inputMode="numeric"
            value={parts[key]}
            onChange={(e) => set(key, e.target.value)}
            onBlur={normalize}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            aria-label={{ d: 'giorni', h: 'ore', m: 'minuti' }[key]}
          />
          <span className="qf-unit">{unit}</span>
        </label>
      ))}
    </div>
  );
}
