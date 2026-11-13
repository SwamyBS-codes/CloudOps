import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { motion } from 'framer-motion';

const historical = Array.from({length:8}).map((_,i)=>({month:`M${i+1}`, cost: Math.round(8000 + Math.random()*4000)}));
const forecast = Array.from({length:4}).map((_,i)=>({month:`F${i+1}`, cost: Math.round(9000 + Math.random()*3000)}));
const data = [...historical, ...forecast];

const CostPredictionChart: React.FC = ()=>{
  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="dark-chart bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Cost Prediction</h3>
        <div className="text-xs text-muted-foreground">Next 4 months</div>
      </div>
      <div style={{width:'100%',height:220}}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.10)" />
            <XAxis
              dataKey="month"
              tick={{ fill: '#B8B8B8', fontSize: 11 }}
              tickLine={{ stroke: '#737373' }}
              axisLine={{ stroke: '#525252' }}
            />
            <YAxis
              tick={{ fill: '#B8B8B8', fontSize: 11 }}
              tickLine={{ stroke: '#737373' }}
              axisLine={{ stroke: '#525252' }}
              tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 0,
                color: 'hsl(var(--popover-foreground))',
                fontSize: 12,
              }}
              labelStyle={{ color: '#F5F5F5' }}
              itemStyle={{ color: '#D4D4D4' }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, 'Cost']}
            />
            <Legend wrapperStyle={{ color: '#D4D4D4', fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="cost" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 text-sm text-foreground">Prediction uses historical trend and exponential smoothing (mock).</div>
    </motion.div>
  );
}

export default CostPredictionChart;
