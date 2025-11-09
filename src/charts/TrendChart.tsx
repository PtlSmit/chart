import React from 'react';
import { useData } from '@/context/DataContext';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function TrendChart() {
  const { summary } = useData();
  if (!summary) return null;

  const data = Object.entries(summary.publishedByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="panel max-w-2xl w-full">
      <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>Trend Over Time</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 20, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#304259" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9fb0c3' }} axisLine={{ stroke: '#304259' }} tickLine={{ stroke: '#304259' }} />
          <Tooltip formatter={(value: number) => [String(value), 'count']} />
          <Line type="monotone" dataKey="value" stroke="#8fd9a6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
