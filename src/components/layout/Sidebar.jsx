import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calculator, Database, Settings, FileText, LayoutDashboard } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Preventivatore', icon: Calculator },
  { path: '/preventivi', label: 'Preventivi', icon: FileText },
  { path: '/materiali', label: 'Materiali', icon: Database },
  { path: '/configurazione', label: 'Configurazione', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-foreground">3D Price</h1>
            <p className="text-xs text-muted-foreground">Preventivatore</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">3D ShapeFarm</p>
      </div>
    </aside>
  );
}