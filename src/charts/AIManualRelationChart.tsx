import React from 'react';
import { useData } from '@/context/DataContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

export default function AIManualRelationChart() {
  const { summary } = useData();
  if (!summary) return null;
  const ai = summary.kaiStatusCounts['ai-invalid-norisk'] ?? 0;
  const manual = summary.kaiStatusCounts['invalid - norisk'] ?? 0;
  const total = ai + manual;

  const data = [
    { name: 'AI', value: ai, color: '#45a3ff' },
    { name: 'Manual', value: manual, color: '#ffb347' },
  ];

  return (
    <div className="panel">
      <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>AI vs Manual Invalids (Total {total})</div>
      <BarChart width={360} height={160} data={data} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#304259" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
        <Tooltip formatter={(value: number) => [String(value), 'count']} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
}
