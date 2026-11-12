import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, LockKeyhole } from 'lucide-react';
import { SETTINGS_KEYS, readStoredValue, writeStoredValue } from './settings-storage';

type SecuritySettingsValue = {
  mfa: boolean;
  deployApproval: boolean;
};

const DEFAULT_SECURITY: SecuritySettingsValue = {
  mfa: true,
  deployApproval: true,
};

const SecuritySettings: React.FC = () => {
  const stored = readStoredValue(SETTINGS_KEYS.SECURITY, DEFAULT_SECURITY);
  const [mfa, setMfa] = useState(stored.mfa);
  const [deployApproval, setDeployApproval] = useState(stored.deployApproval);

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-primary/10' : 'bg-secondary'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-secondary transition ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );

  const persist = (next: SecuritySettingsValue) => {
    setMfa(next.mfa);
    setDeployApproval(next.deployApproval);
    writeStoredValue(SETTINGS_KEYS.SECURITY, next);
  };

  return (
    <motion.section whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card  p-5 ">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Security settings</h2>
          <p className="text-sm text-muted-foreground">Protect deployments and account access.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-success">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3">
          <div className="text-sm text-foreground">
            <div>Multi-factor authentication</div>
            <div className="text-muted-foreground">Required for all team members</div>
          </div>
          <Toggle checked={mfa} onChange={(value) => persist({ mfa: value, deployApproval })} />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3">
          <div className="text-sm text-foreground">
            <div>Deployment approval required</div>
            <div className="text-muted-foreground">Manual approval before production pushes</div>
          </div>
          <Toggle checked={deployApproval} onChange={(value) => persist({ mfa, deployApproval: value })} />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
          <LockKeyhole className="h-4 w-4 text-primary" />
          Secrets are encrypted at rest and audited on change.
        </div>
      </div>
    </motion.section>
  );
};

export default SecuritySettings;
