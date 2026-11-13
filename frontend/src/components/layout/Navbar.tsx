import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Github } from 'lucide-react';
import { useAuth } from '@/app/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from './Logo';

const navLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Docs', href: '/docs' },
];

const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const userName = user?.username || user?.name || user?.login || 'User';

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 border-b transition-all duration-base',
          scrolled
            ? 'border-border bg-background/90  shadow-sm'
            : 'border-transparent bg-transparent'
        )}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate('/dashboard')}>
                  Dashboard
                </Button>
                <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => { logout(); navigate('/login'); }}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button size="sm" className="hidden sm:inline-flex gap-2" onClick={() => navigate('/login')}>
                <Github className="h-4 w-4" />
                Sign in
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close menu' : 'Open menu'}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed inset-x-0 top-14 z-40 border-b border-border bg-background p-4 shadow-md md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-foreground hover:border-primary hover:bg-secondary"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              {isAuthenticated ? (
                <>
                  <button type="button" className="border-l-2 border-transparent px-3 py-2.5 text-left text-sm font-medium hover:border-primary hover:bg-secondary" onClick={() => { setOpen(false); navigate('/dashboard'); }}>
                    Dashboard
                  </button>
                  <button type="button" className="border-l-2 border-transparent px-3 py-2.5 text-left text-sm text-destructive hover:border-destructive hover:bg-secondary" onClick={() => { logout(); navigate('/login'); }}>
                    Sign out ({userName})
                  </button>
                </>
              ) : (
                <Button className="mt-2 w-full gap-2" onClick={() => { setOpen(false); navigate('/login'); }}>
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </Button>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-14" aria-hidden />
    </>
  );
};

export default Navbar;
