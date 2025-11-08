import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import ReactLazy = React.lazy;
const Dashboard = ReactLazy(() => import('@/pages/Dashboard'));
const VulnDetail = ReactLazy(() => import('@/pages/VulnDetail'));
const NotFound = ReactLazy(() => import('@/pages/NotFound'));
import { DataProvider } from '@/context/DataContext';
import './styles/global.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'vuln/:id', element: <VulnDetail /> },
      { path: '*', element: <NotFound /> }
    ]
  }
]);

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <DataProvider>
      <React.Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
        <RouterProvider router={router} />
      </React.Suspense>
    </DataProvider>
  </React.StrictMode>
);
