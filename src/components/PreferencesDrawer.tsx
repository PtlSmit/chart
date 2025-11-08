import React, { useState } from 'react';
import { useData } from '@/context/DataContext';

export default function PreferencesDrawer() {
  const { preferences, setPreferences } = useData();
  const [open, setOpen] = useState(false);

  return (
    <div className="panel">
      <div className="controls">
        <button className="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'} Preferences</button>
      </div>
      {open && (
        <div className="row" style={{ gap: '1rem' }}>
          <label className="controls" style={{ gap: '.5rem' }}>
            <input type="checkbox" checked={preferences.darkMode} onChange={(e) => setPreferences((p) => ({ ...p, darkMode: e.target.checked }))} />
            <span>Dark mode</span>
          </label>
          <label className="controls" style={{ gap: '.5rem' }}>
            <span>Page size</span>
            <select value={preferences.pageSize} onChange={(e) => setPreferences((p) => ({ ...p, pageSize: Number(e.target.value) }))}>
              {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="controls" style={{ gap: '.5rem' }}>
            <input type="checkbox" checked={preferences.defaultExcludeKai} onChange={(e) => setPreferences((p) => ({ ...p, defaultExcludeKai: e.target.checked }))} />
            <span>Default exclude invalids</span>
          </label>
        </div>
      )}
    </div>
  );
}

