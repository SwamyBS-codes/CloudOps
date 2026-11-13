import React, { memo, Suspense, useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopNavbar from './TopNavbar';

const DashboardLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMobileSidebar = useCallback(() => setMobileOpen(true), []);
  const closeMobileSidebar = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="relative flex min-h-screen bg-background text-foreground">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex">
        <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/80  lg:hidden"
              onClick={closeMobileSidebar}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <Sidebar mobile onCollapse={closeMobileSidebar} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div
        className="flex min-h-screen flex-1 flex-col transition-[margin] duration-base lg:ml-[var(--sidebar-width,260px)]"
        style={{ '--sidebar-width': collapsed ? '72px' : '260px' } as React.CSSProperties}
      >
        <TopNavbar onToggleMobileSidebar={openMobileSidebar} />
        <main className="flex-1 overflow-auto">
          <div className="page-shell page-shell--wide">
            <Suspense
              fallback={
                <div className="space-y-4" aria-label="Loading page">
                  <div className="h-8 w-48 animate-pulse bg-secondary" />
                  <div className="h-32 animate-pulse border border-border bg-card" />
                  <div className="h-56 animate-pulse border border-border bg-card" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default memo(DashboardLayout);
