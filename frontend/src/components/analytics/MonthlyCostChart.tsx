import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

const data = Array.from({length:12}).map((_,i)=>({month:`M${i+1}`, cost: Math.round(2000 + Math.random()*4000)}));

const MonthlyCostChart: React.FC = ()=>{
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className=" bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Monthly AWS Cost</h3>
        <div className="text-xs text-muted-foreground">Last 12 months</div>
      </div>
      <div style={{width:'100%',height:200}}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.6)' }} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.6)' }} />
            <Tooltip wrapperStyle={{background:'rgba(2,6,23,0.9)',borderRadius:6,border:'none'}} contentStyle={{color:'#fff'}} formatter={(v:number)=>[`$${v.toLocaleString()}`,'Cost']} />
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="cost" stroke="hsl(var(--chart-1))" fill="url(#costGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

export default MonthlyCostChart;
