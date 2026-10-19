import { StrictMode } from 'react';
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

sound.init('/sounds/');

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Catalogue /> },
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
