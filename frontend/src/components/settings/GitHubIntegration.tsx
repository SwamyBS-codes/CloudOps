import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Github, Link2, ShieldCheck } from 'lucide-react';
import { API_BASE_URL, AUTH_TOKEN_KEY } from '@/lib/constants';
import { readStoredValue, SETTINGS_KEYS, writeStoredValue } from './settings-storage';

type GitHubSettingsValue = {
  connected: boolean;
  account: string;
};

const DEFAULT_GITHUB: GitHubSettingsValue = {
  connected: true,
  account: 'cloudops/platform-infra',
};

const GitHubIntegration: React.FC = () => {
  const stored = readStoredValue(SETTINGS_KEYS.GITHUB, DEFAULT_GITHUB);
  const [connected, setConnected] = useState(stored.connected);
  const [account, setAccount] = useState(stored.account);

  const persist = (next: GitHubSettingsValue) => {
    setConnected(next.connected);
    setAccount(next.account);
    writeStoredValue(SETTINGS_KEYS.GITHUB, next);
  };

  const handleGitHubAction = () => {
    if (connected) {
      persist({ connected: false, account });
      return;
    }

    window.location.assign(`${API_BASE_URL}/api/auth/github`);
  };

  const handleSyncWithAuth = () => {
    const isAuthenticated = Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
    persist({ connected: isAuthenticated, account: isAuthenticated ? account : '' });
  };

  return (
    <motion.section whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card  p-5 ">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">GitHub integration</h2>
          <p className="text-sm text-muted-foreground">Manage repository access and deployments.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground">
          <Github className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
          <div className="flex items-center gap-3">
            <Link2 className="h-4 w-4 text-primary" />
            <span>{account || 'No GitHub account linked'}</span>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${connected ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleGitHubAction}
          className="w-full rounded-xl border border-primary bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/90"
        >
          {connected ? 'Disconnect GitHub' : 'Connect GitHub'}
        </button>

        <button
          type="button"
          onClick={handleSyncWithAuth}
          className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          Sync with active login
        </button>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          Scoped repository access with deployment-only permissions.
        </div>
      </div>
    </motion.section>
  );
};

export default GitHubIntegration;
