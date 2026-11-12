import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

const data = Array.from({length:24}).map((_,i)=>({time:`${i}:00`, mem: Math.round(40+Math.cos(i/4)*18 + Math.random()*6)}));

const MemoryChart: React.FC = ()=>{
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className=" bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Memory Usage</h3>
        <div className="text-xs text-muted-foreground">Last 24 hours</div>
      </div>
      <div style={{width:'100%',height:200}}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
            <Tooltip wrapperStyle={{background:'rgba(2,6,23,0.9)',borderRadius:6,border:'none'}} contentStyle={{color:'#fff'}}/>
            <defs>
              <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="mem" stroke="hsl(var(--chart-2))" fill="url(#memGradient)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

export default MemoryChart;
