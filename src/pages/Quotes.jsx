import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, FileText, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const STATUS_COLORS = {
  bozza: 'bg-muted text-muted-foreground',
  inviato: 'bg-primary/10 text-primary',
  accettato: 'bg-green-100 text-green-700',
  rifiutato: 'bg-destructive/10 text-destructive',
};

export default function Quotes() {
  const queryClient = useQueryClient();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => base44.entities.Quote.list('-created_date', 100),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Quote.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Preventivo eliminato');
    },
  });

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Preventivi Salvati</h1>
          <p className="text-sm text-muted-foreground mt-1">{quotes.length} preventivi</p>
        </div>
        <Link to="/">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Nuovo Preventivo
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nessun preventivo salvato</p>
          <Link to="/">
            <Button className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Crea il primo
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {quotes.map(q => (
            <div key={q.id} className="bg-card rounded-xl border border-border p-5 flex items-center justify-between hover:border-primary/30 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{q.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.date ? format(new Date(q.date), 'd MMM yyyy', { locale: it }) : 'Senza data'} · {q.lines?.length || 0} righe
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={STATUS_COLORS[q.status] || STATUS_COLORS.bozza}>
                  {q.status || 'bozza'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(q.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}