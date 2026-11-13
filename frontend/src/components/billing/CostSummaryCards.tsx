import React from 'react';
import { motion } from 'framer-motion';
import { Banknote, ServerCog, Database, Share2 } from 'lucide-react';

const Card = ({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) => (
  <motion.div whileHover={{ y: -6 }} className="p-4 rounded-xl bg-gradient-to-tr from-[rgba(255,255,255,0.02)] to-[rgba(255,255,255,0.01)] border border-border ">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold text-foreground mt-1">{value}</div>
      </div>
      <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-foreground shadow-glow">
        {icon}
      </div>
    </div>
  </motion.div>
);

const CostSummaryCards: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card label="Total AWS Cost (30d)" value="$12,430" icon={<Banknote className="w-5 h-5" />} />
      <Card label="ECS Usage" value="$6,120" icon={<ServerCog className="w-5 h-5" />} />
      <Card label="Storage" value="$2,480" icon={<Database className="w-5 h-5" />} />
      <Card label="Network" value="$1,210" icon={<Share2 className="w-5 h-5" />} />
    </div>
  );
};

export default CostSummaryCards;
