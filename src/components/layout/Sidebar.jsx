import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calculator, Database, Settings, FileText } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Preventivatore', icon: Calculator },
  { path: '/preventivi', label: 'Preventivi', icon: FileText },
  { path: '/materiali', label: 'Materiali', icon: Database },
  { path: '/configurazione', label: 'Configurazione', icon: Settings },
];

/** Marchio: tre strati sfalsati, come i layer di una stampa. */
function LayerMark() {
  return (
    <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0" aria-hidden>
      <rect x="4" y="18" width="20" height="5" rx="1.5" fill="hsl(210 100% 34%)" />
      <rect x="6" y="11.5" width="16" height="5" rx="1.5" fill="hsl(210 100% 50%)" />
      <rect x="8" y="5" width="12" height="5" rx="1.5" fill="hsl(210 90% 72%)" />
    </svg>
  );
}

export function MobileNav() {
  const location = useLocation();
  return (
    <header className="md:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 h-12">
        <LayerMark />
        <p className="text-sm font-bold text-white" style={{ fontStretch: '115%' }}>3D ShapeFarm</p>
      </div>
      <nav className="flex overflow-x-auto px-2 pb-2 gap-1" aria-label="Sezioni">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${isActive ? 'bg-sidebar-accent text-white font-semibold' : 'text-sidebar-foreground'}`}>
              <item.icon className="w-3.5 h-3.5" />{item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col h-screen sticky top-0 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
        <LayerMark />
        <div className="leading-tight">
          <p className="text-[15px] font-bold text-white" style={{ fontStretch: '115%' }}>3D ShapeFarm</p>
          <p className="text-xs text-[hsl(var(--sidebar-foreground)/0.7)]">Preventivatore</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5" aria-label="Sezioni">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-ring ${
                isActive
                  ? 'bg-sidebar-accent text-white font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-[hsl(210_100%_60%)]'
                  : 'text-sidebar-foreground hover:text-white hover:bg-sidebar-accent'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <p className="px-5 py-4 text-[11px] text-[hsl(var(--sidebar-foreground)/0.5)] border-t border-sidebar-border">Materia SRL</p>
    </aside>
  );
}
