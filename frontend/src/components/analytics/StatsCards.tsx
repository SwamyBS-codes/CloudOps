import React from 'react';
import { motion } from 'framer-motion';
import { Server, Code, CheckCircle2, Clock } from 'lucide-react';

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode }>=({label,value,icon})=>{
  return (
    <motion.div whileHover={{ y: -4 }} className=" bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold text-foreground mt-1">{value}</div>
        </div>
        <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-foreground shadow-glow">
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

const StatsCards: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard label="Total Deployments" value="1,284" icon={<Server className="w-6 h-6" />} />
      <StatCard label="Active Containers" value="87" icon={<Code className="w-6 h-6" />} />
      <StatCard label="Success Rate" value="98.6%" icon={<CheckCircle2 className="w-6 h-6" />} />
      <StatCard label="Avg Deploy Time" value="2m 14s" icon={<Clock className="w-6 h-6" />} />
    </div>
  );
}

export default StatsCards;
