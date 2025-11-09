import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useData } from '@/context/DataContext';

export default function App() {
  const { summary, loading, error } = useData();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">Vulnerability Dashboard</Link>
        <div className="spacer" />
        {summary && (
          <div className="header-stats hidden md:flex">
            <span>Total: {summary.total.toLocaleString()}</span>
            <span>Critical: {summary.severityCounts.critical ?? 0}</span>
            <span>High: {summary.severityCounts.high ?? 0}</span>
            <span>Medium: {summary.severityCounts.medium ?? 0}</span>
            <span>Low: {summary.severityCounts.low ?? 0}</span>
          </div>
        )}
      </header>
      {loading && !summary && <div className="banner loading">Loading data…</div>}
      {error && <div className="banner error">{error}</div>}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
