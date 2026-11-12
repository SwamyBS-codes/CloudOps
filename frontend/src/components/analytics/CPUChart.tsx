import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Area, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

const data = Array.from({length: 24}).map((_,i)=>({time:`${i}:00`, cpu: Math.round(30+Math.sin(i/3)*20 + Math.random()*8)}));

const CPUChart: React.FC = ()=>{
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className=" bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">CPU Usage</h3>
        <div className="text-xs text-muted-foreground">Last 24 hours</div>
      </div>
      <div style={{width:'100%',height:200}}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
            <Tooltip wrapperStyle={{background:'rgba(2,6,23,0.9)',borderRadius:6,border:'none'}} contentStyle={{color:'#fff'}}/>
            <Area type="monotone" dataKey="cpu" stroke="transparent" fill="url(#cpuGradient)" />
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Line type="monotone" dataKey="cpu" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

export default CPUChart;
