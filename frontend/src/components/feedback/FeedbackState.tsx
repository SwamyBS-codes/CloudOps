import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export type FeedbackTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

const toneStyles: Record<FeedbackTone, { ring: string; accent: string; glow: string }> = {
  neutral: { ring: 'border-border', accent: 'text-primary', glow: '' },
  success: { ring: 'border-success', accent: 'text-success', glow: '' },
  warning: { ring: 'border-warning', accent: 'text-warning', glow: '' },
  error: { ring: 'border-destructive', accent: 'text-destructive', glow: '' },
  info: { ring: 'border-sky-400/15', accent: 'text-sky-200', glow: '' },
};

export interface FeedbackAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary';
}

export interface FeedbackStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: FeedbackAction[];
  tone?: FeedbackTone;
  illustration?: React.ReactNode;
  className?: string;
}

const FeedbackState: React.FC<FeedbackStateProps> = ({
  title,
  description,
  icon: Icon,
  actions = [],
  tone = 'neutral',
  illustration,
  className = '',
}) => {
  const styles = toneStyles[tone];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-3xl border ${styles.ring} ${styles.glow} bg-card  px-5 py-7 sm:px-6 sm:py-8 ${className}`}
    >
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary ${styles.accent}`}>
          <Icon className="h-7 w-7" />
        </div>

        <div className="mt-5">{illustration}</div>

        <h3 className="mt-5 text-2xl font-semibold text-foreground">{title}</h3>
        <p className="mt-3 max-w-lg text-sm leading-6 text-foreground/65 sm:text-base">{description}</p>

        {actions.length > 0 && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {actions.map((action) => {
              const base = 'inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary';
              const variant = action.variant === 'secondary'
                ? 'border border-border bg-secondary text-foreground hover:bg-secondary'
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-foreground  hover:brightness-110';

              if (action.href) {
                return (
                  <a key={action.label} href={action.href} className={`${base} ${variant}`}>
                    {action.label}
                  </a>
                );
              }

              return (
                <button key={action.label} type="button" onClick={action.onClick} className={`${base} ${variant}`}>
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default FeedbackState;
