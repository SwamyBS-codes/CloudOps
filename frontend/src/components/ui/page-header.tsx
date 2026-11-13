import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Card } from './card';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, badge, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="max-w-2xl text-base text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex flex-col items-center justify-center border border-dashed border-border bg-card/50 px-6 py-16 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center border border-border bg-secondary">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button className="mt-6" variant="default" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-border">/</span>}
            {item.href ? (
              <a href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </a>
            ) : (
              <span className="font-medium text-foreground" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

export function Progress({ value, max = 100, className, showLabel, variant = 'default' }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColors = {
    default: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
  };

  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden bg-secondary"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <motion.div
          className={cn('h-full', barColors[variant])}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export function ChartContainer({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn('border-border bg-card shadow-sm', className)}>
      <div className="flex items-start justify-between border-b border-border/60 px-6 py-4">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </Card>
  );
}
