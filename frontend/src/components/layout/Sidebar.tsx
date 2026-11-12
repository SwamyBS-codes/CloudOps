import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavLink, Link } from 'react-router-dom';
import {
  Home,
  BarChart3,
  CreditCard,
  Settings,
  Rocket,
  Layers3,
  Cloud,
  Database,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  key: string;
  label: string;
  icon: React.ElementType;
  href: string;
}

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Home, href: '/dashboard' },
  { key: 'deployments', label: 'Deployments', icon: Layers3, href: '/deployments' },
  { key: 'live-projects', label: 'Live Projects', icon: Rocket, href: '/live-projects' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { key: 'billing', label: 'Billing', icon: CreditCard, href: '/billing' },
  { key: 'environment-variables', label: 'Environment', icon: Database, href: '/environment-variables' },
  { key: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
];

const Sidebar: React.FC<{
  collapsed?: boolean;
  onCollapse?: (v: boolean) => void;
  mobile?: boolean;
}> = ({ collapsed = false, onCollapse, mobile = false }) => {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const isCollapsed = collapsed && !hoverExpanded && !mobile;

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 260 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      onMouseEnter={() => collapsed && setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className={cn(
        'relative z-20 flex h-full flex-col border-r border-border bg-background',
        mobile && 'w-[260px]'
      )}
      aria-label="Main navigation"
    >
      <div className={cn('flex min-h-16 items-center border-b border-border px-4 py-4', isCollapsed && 'justify-center px-2')}>
        <Link to="/dashboard" className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-secondary" aria-label="Dashboard">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-primary/20 bg-primary text-primary-foreground">
            <Cloud className="h-4 w-4" />
          </div>
          {!isCollapsed && (
            <div className="leading-none">
              <div className="font-display text-sm font-bold text-foreground">CloudOps</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Deploy</div>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <NavLink
                  to={item.href}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => mobile && onCollapse?.(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      isCollapsed && 'justify-center px-2',
                      isActive
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {!isCollapsed && item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {!mobile && onCollapse && (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => onCollapse(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
              isCollapsed && 'justify-center px-2'
            )}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      )}
    </motion.aside>
  );
};

export default memo(Sidebar);
