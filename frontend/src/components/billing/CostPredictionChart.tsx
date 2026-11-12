import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

const historical = Array.from({length:8}).map((_,i)=>({month:`M${i+1}`, cost: Math.round(8000 + Math.random()*4000)}));
const forecast = Array.from({length:4}).map((_,i)=>({month:`F${i+1}`, cost: Math.round(9000 + Math.random()*3000)}));
const data = [...historical, ...forecast];

const CostPredictionChart: React.FC = ()=>{
  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className=" bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Cost Prediction</h3>
        <div className="text-xs text-muted-foreground">Next 4 months</div>
      </div>
      <div style={{width:'100%',height:220}}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.6)' }} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.6)' }} />
            <Tooltip wrapperStyle={{background:'rgba(2,6,23,0.9)',borderRadius:6,border:'none'}} formatter={(v:number)=>[`$${v.toLocaleString()}`,'Cost']} />
            <Line type="monotone" dataKey="cost" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 text-sm text-foreground">Prediction uses historical trend and exponential smoothing (mock).</div>
    </motion.div>
  );
}

export default CostPredictionChart;
