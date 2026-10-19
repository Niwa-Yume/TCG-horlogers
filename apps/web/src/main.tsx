import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@wm/ui/tokens.css';
import { sound } from '@wm/ui';
import './i18n';
import { Layout } from './Layout';
import { Catalogue } from './pages/Catalogue';
import { CardPage } from './pages/CardPage';
import { Admin } from './pages/Admin';
import { System } from './pages/System';
import { Home } from './pages/Home';
import { Wind } from './pages/Wind';
import { Album } from './pages/Album';
import { Market } from './pages/Market';
import { initAnalytics } from './track';
import { Balance } from '@wm/ui';

import Tutorial from './pages/duel/Tutorial';

// le duel en direct (Socket.IO) ne pèse que sur sa page ; le tutoriel, léger, part avec le reste
const DuelPage = lazy(() => import('./pages/duel/DuelPage'));
const later = (el: React.ReactNode) => <Suspense fallback={<Balance />}>{el}</Suspense>;

sound.init('/sounds/');
initAnalytics();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/catalogue', element: <Catalogue /> },
      { path: '/remonter', element: <Wind /> },
      { path: '/collection', element: <Album /> },
      { path: '/encheres', element: <Market /> },
      { path: '/duel', element: later(<DuelPage />) },
      { path: '/duel/tutoriel', element: <Tutorial /> },
      { path: '/carte/:slug', element: <CardPage /> },
      { path: '/systeme', element: <System /> },
      { path: '/admin', element: <Admin /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
