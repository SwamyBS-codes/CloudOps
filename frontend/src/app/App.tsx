import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Routes from './router';
import AppBackground from '@/components/layout/AppBackground';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/components/ui/ToastProvider';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { AuthProvider } from '@/app/providers/auth-provider';
import './App.css';

const normalizeBasename = (value: string) => {
  if (!value || value === './' || value === '/') return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const computeRouterBasename = () => {
  const baseUrl = import.meta.env.BASE_URL;
  if (baseUrl && baseUrl !== './') {
    return normalizeBasename(baseUrl);
  }

  const baseTagHref = document.querySelector('base')?.getAttribute('href');
  if (baseTagHref && baseTagHref !== './') {
    return normalizeBasename(baseTagHref);
  }

  return '/';
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <Router basename={computeRouterBasename()}>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="relative min-h-screen overflow-hidden bg-background"
                >
                  <AppBackground />
                  <Routes />
                </motion.div>
              </Router>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
