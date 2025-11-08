import React from 'react';
import { useData } from '@/context/DataContext';

export default function ExportButton() {
  const { results, filters } = useData();
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), filters, results }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vuln-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  return <button className="ghost" onClick={exportJson}>Export (.json)</button>;
}

