import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
// Add page imports here
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import Quoter from '@/pages/Quoter';
import Materials from '@/pages/Materials';
import Configuration from '@/pages/Configuration';
import Quotes from '@/pages/Quotes';
import RequestQuote from '@/pages/RequestQuote';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated, user } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Se non autenticato, forza il login
  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  // Clienti e partner (ruolo 'user') → solo pagina richiesta preventivo
  if (user?.role === 'user') {
    return (
      <Routes>
        <Route path="*" element={<RequestQuote />} />
      </Routes>
    );
  }

  // Admin → pannello completo
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Quoter />} />
        <Route path="/preventivi" element={<Quotes />} />
        <Route path="/materiali" element={<Materials />} />
        <Route path="/configurazione" element={<Configuration />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* Pagina pubblica — nessuna autenticazione richiesta */}
            <Route path="/richiedi-preventivo" element={<RequestQuote />} />
            {/* App interna autenticata */}
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App