import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="panel">
      <div style={{ fontSize: 18, fontWeight: 700 }}>Not Found</div>
      <div className="tiny">The page you requested does not exist.</div>
      <Link to="/"><button className="ghost" style={{ marginTop: '.75rem' }}>Back</button></Link>
    </div>
  );
}

