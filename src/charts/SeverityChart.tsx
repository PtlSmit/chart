import React from 'react';
import { useData } from '@/context/DataContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

export default function SeverityChart() {
  const { summary } = useData();
  if (!summary) return null;

  const order: Array<{ name: string; value: number; color: string }> = [
    { name: 'critical', value: summary.severityCounts['critical'] ?? 0, color: '#ff5c7a' },
    { name: 'high', value: summary.severityCounts['high'] ?? 0, color: '#ffb347' },
    { name: 'medium', value: summary.severityCounts['medium'] ?? 0, color: '#ffd166' },
    { name: 'low', value: summary.severityCounts['low'] ?? 0, color: '#2ecc71' },
    { name: 'unknown', value: summary.severityCounts['unknown'] ?? 0, color: '#9fb0c3' },
  ];
  const total = order.reduce((a, b) => a + b.value, 0);

  return (
    <div className="panel max-w-2xl w-full">
      <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>Severity Distribution</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={order} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#304259" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
          <Tooltip formatter={(value: number) => [`${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`, 'count']} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {order.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
