import React from 'react';
import { motion } from 'framer-motion';
import { Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <motion.a
    href="/"
    className={cn('group flex items-center gap-2.5', className)}
    whileHover={{ opacity: 0.85 }}
    whileTap={{ scale: 0.98 }}
  >
    <div className="flex h-8 w-8 items-center justify-center border border-primary/20 bg-primary text-primary-foreground">
      <Cloud className="h-4 w-4" strokeWidth={2} />
    </div>
    <div className="leading-none">
      <span className="font-display text-sm font-bold text-foreground">CloudOps</span>
      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Deploy
      </span>
    </div>
  </motion.a>
);

export default Logo;
