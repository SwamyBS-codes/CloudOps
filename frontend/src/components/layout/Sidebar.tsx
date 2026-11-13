import React, { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CreditCard,
  Home,
  Layers3,
  Rocket,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SubmenuItem = {
  label: string;
  href: string;
};

type NavItem = {
  key: string;
  label: string;
  icon: React.ElementType;
  href: string;
  children?: SubmenuItem[];
};

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Home, href: '/dashboard' },
  {
    key: 'deployments',
    label: 'Deployments',
    icon: Layers3,
    href: '/deployments?view=all',
    children: [
      { label: 'All deployments', href: '/deployments?view=all' },
      { label: 'Active', href: '/deployments?view=active' },
      { label: 'Needs attention', href: '/deployments?view=attention' },
      { label: 'History', href: '/deployments?view=history' },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: Rocket,
    href: '/live-projects',
    children: [
      { label: 'Live projects', href: '/live-projects' },
      { label: 'Environment variables', href: '/environment-variables' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    href: '/analytics#analytics-summary',
    children: [
      { label: 'Summary', href: '/analytics#analytics-summary' },
      { label: 'Trends', href: '/analytics#analytics-trends' },
      { label: 'Performance', href: '/analytics#analytics-performance' },
      { label: 'Top repositories', href: '/analytics#analytics-repositories' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: CreditCard,
    href: '/billing#billing-overview',
    children: [
      { label: 'Cost overview', href: '/billing#billing-overview' },
      { label: 'Breakdown', href: '/billing#billing-breakdown' },
      { label: 'Forecast', href: '/billing#billing-forecast' },
      { label: 'Recommendations', href: '/billing#billing-recommendations' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    href: '/settings?tab=settings',
    children: [
      { label: 'Profile', href: '/settings?tab=profile' },
      { label: 'GitHub integration', href: '/settings?tab=settings' },
    ],
  },
];

const isItemActive = (href: string, pathname: string, search: string, hash: string) => {
  const url = new URL(href, window.location.origin);
  if (url.pathname !== pathname) return false;
  if (url.search) {
    return url.search === search
      || (search === '' && (url.search === '?view=all' || url.search === '?tab=settings'));
  }
  if (url.hash) return url.hash === hash;
  return true;
};

const Sidebar: React.FC<{
  collapsed?: boolean;
  onCollapse?: (v: boolean) => void;
  mobile?: boolean;
}> = ({ collapsed = false, onCollapse, mobile = false }) => {
  const location = useLocation();
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const isCollapsed = collapsed && !hoverExpanded && !mobile;

  useEffect(() => {
    const activeGroups = navItems
      .filter((item) => item.children?.some((child) =>
        isItemActive(child.href, location.pathname, location.search, location.hash)
      ) || (item.key === 'deployments' && location.pathname.startsWith('/deployments/')))
      .map((item) => item.key);
    setOpenMenus((current) => Array.from(new Set([...current, ...activeGroups])));
  }, [location.pathname, location.search, location.hash]);

  const toggleMenu = (key: string) => {
    setOpenMenus((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

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
        <Link to="/dashboard" className="flex items-center gap-2.5 p-1 hover:bg-secondary" aria-label="Dashboard">
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
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = Boolean(item.children?.length);
            const isGroupActive = item.children?.some((child) =>
              isItemActive(child.href, location.pathname, location.search, location.hash)
            ) || (item.key === 'deployments' && location.pathname.startsWith('/deployments'));
            const isOpen = openMenus.includes(item.key);

            return (
              <li key={item.key}>
                <div className="flex items-center">
                  <NavLink
                    to={item.href}
                    title={isCollapsed ? item.label : undefined}
                    end={!hasChildren}
                    onClick={() => mobile && onCollapse?.(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex min-w-0 flex-1 items-center gap-3 border-l-2 px-3 py-2.5 text-sm font-medium transition-colors',
                        isCollapsed && 'justify-center px-2',
                        isActive || isGroupActive
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                  {hasChildren && !isCollapsed && (
                    <button
                      type="button"
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.label} submenu`}
                      aria-expanded={isOpen}
                      onClick={() => toggleMenu(item.key)}
                      className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {hasChildren && isOpen && !isCollapsed && (
                  <ul className="ml-5 mt-1 border-l border-border py-0.5 pl-2">
                    {item.children?.map((child) => (
                      <li key={child.href}>
                        <NavLink
                          to={child.href}
                          onClick={() => mobile && onCollapse?.(false)}
                          className={() => cn(
                            'block border-l-2 px-3 py-2 text-xs transition-colors',
                            isItemActive(child.href, location.pathname, location.search, location.hash)
                              ? 'border-primary text-primary'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {child.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
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
              'flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
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
