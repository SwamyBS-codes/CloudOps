import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { motion } from 'framer-motion';

const data = [
  { name: 'ECS', value: 6120 },
  { name: 'Storage', value: 2480 },
  { name: 'Network', value: 1210 },
  { name: 'Other', value: 2620 },
];

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
];

const CostBreakdownChart: React.FC = () => (
  <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="dark-chart bg-card border border-border rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-foreground">AWS Cost Breakdown</h3>
      <div className="text-xs text-muted-foreground">Last 30 days</div>
    </div>
    <div style={{ width: '100%', height: 210 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={4}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 0,
              color: 'hsl(var(--popover-foreground))',
              fontSize: 12,
              padding: '8px 10px',
            }}
            labelStyle={{ color: '#F5F5F5' }}
            itemStyle={{ color: '#D4D4D4' }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, 'Cost']}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <div className="mt-3 text-sm text-foreground">
      <div className="flex flex-col gap-2">
        {data.map((d,i)=>(
          <div key={d.name} className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0" style={{background:COLORS[i]}} />
            <div className="flex-1 text-sm font-medium text-neutral-300">{d.name}</div>
            <div className="font-mono text-sm text-neutral-100">${d.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  </motion.div>
);

export default CostBreakdownChart;
