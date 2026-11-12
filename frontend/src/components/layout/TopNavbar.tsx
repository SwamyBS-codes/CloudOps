import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Menu, Plus, Settings, LogOut, User } from 'lucide-react';
import { useAuth } from '@/app/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const TopNavbar: React.FC<{ onToggleMobileSidebar?: () => void }> = ({ onToggleMobileSidebar }) => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const userName = user?.username || user?.name || user?.login || 'User';
  const userInitial = userName[0]?.toUpperCase() || 'U';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        {/* Mobile menu */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onToggleMobileSidebar}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="hidden flex-1 sm:block sm:max-w-md">
          <Input
            placeholder="Search deployments, repos..."
            icon={<Search className="h-4 w-4" />}
            aria-label="Search"
            className="h-9 bg-background"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Quick deploy */}
          <Button size="sm" className="hidden sm:inline-flex gap-1.5" onClick={() => navigate('/dashboard')}>
            <Plus className="h-4 w-4" />
            New deploy
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-background" />
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
                aria-label="User menu"
              >
                <div className="flex h-8 w-8 items-center justify-center border border-primary/20 bg-primary text-xs font-bold text-primary-foreground">
                  {userInitial}
                </div>
                <span className="hidden text-sm font-medium text-foreground md:block">{userName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <div className="font-normal">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || 'CloudOps account'}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings?tab=profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default memo(TopNavbar);
