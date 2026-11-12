import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Healthy', value: 86 },
  { name: 'Degraded', value: 10 },
  { name: 'Down', value: 4 },
];

const COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

const ApplicationHealth: React.FC = ()=>{
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className=" bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Application Health</h3>
        <div className="text-xs text-muted-foreground">Overall</div>
      </div>
      <div style={{width:'100%',height:180}}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-sm">
        <div className="text-foreground">Healthy: 86%</div>
        <div className="text-foreground">Degraded: 10%</div>
        <div className="text-foreground">Down: 4%</div>
      </div>
    </motion.div>
  );
}

export default ApplicationHealth;
