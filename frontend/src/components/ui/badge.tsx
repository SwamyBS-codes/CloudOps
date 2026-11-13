import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-success/30 bg-success/15 text-success',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        destructive: 'border-destructive/30 bg-destructive/15 text-destructive',
        outline: 'border-border text-foreground',
        accent: 'border-accent/30 bg-accent/15 text-accent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

export function StatusBadge({ status }: { status?: string }) {
  const normalized = (status || 'pending').toLowerCase();
  const variantMap: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
    success: 'success',
    failed: 'destructive',
    error: 'destructive',
    deploying: 'accent',
    running: 'accent',
    building: 'warning',
    pushing: 'warning',
    pending: 'secondary',
    cancelled: 'secondary',
    stopped: 'secondary',
  };
  return (
    <Badge variant={variantMap[normalized] || 'secondary'}>
      {normalized}
    </Badge>
  );
}
