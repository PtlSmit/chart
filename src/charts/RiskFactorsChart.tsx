import React from 'react';
import { useData } from '@/context/DataContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function RiskFactorsChart() {
  const { summary } = useData();
  if (!summary) return null;

  const top = Object.entries(summary.riskFactorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const height = top.length * (18 + 8) + 40;

  return (
    <div className="panel">
      <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>Risk Factor Frequency</div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={top} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#304259" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
          <Tooltip formatter={(value: number) => [String(value), 'count']} />
          <Bar dataKey="value" barSize={18} radius={[6, 6, 6, 6]} fill="#45a3ff" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
