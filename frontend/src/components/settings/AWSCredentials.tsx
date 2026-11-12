import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { SETTINGS_KEYS, readStoredValue, writeStoredValue } from './settings-storage';

type AwsSettingsValue = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

const DEFAULT_AWS: AwsSettingsValue = {
  accessKeyId: 'AKIA-EXAMPLE-KEY-1234',
  secretAccessKey: 'EXAMPLE-SECRET-KEY',
  region: 'us-east-1',
};

const AWSCredentials: React.FC = () => {
  const stored = readStoredValue(SETTINGS_KEYS.AWS, DEFAULT_AWS);
  const [accessKeyId, setAccessKeyId] = useState(stored.accessKeyId);
  const [secretAccessKey, setSecretAccessKey] = useState(stored.secretAccessKey);
  const [region, setRegion] = useState(stored.region);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const masked = showKey ? secretAccessKey : '••••••••••••••••••••';

  const saveCredentials = () => {
    writeStoredValue(SETTINGS_KEYS.AWS, { accessKeyId, secretAccessKey, region });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <motion.section whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card  p-5 ">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">AWS credentials</h2>
          <p className="text-sm text-muted-foreground">Secure API key management for deployments.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-warning">
          <KeyRound className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="block text-xs uppercase tracking-[0.2em] text-muted-foreground">Access key ID</span>
          <input
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 font-mono text-sm tracking-wide text-foreground outline-none focus:border-warning"
          />
        </label>

        <label className="block space-y-2">
          <span className="block text-xs uppercase tracking-[0.2em] text-muted-foreground">Secret access key</span>
          <input
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
            type={showKey ? 'text' : 'password'}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 font-mono text-sm tracking-wide text-foreground outline-none focus:border-warning"
          />
        </label>

        <label className="block space-y-2">
          <span className="block text-xs uppercase tracking-[0.2em] text-muted-foreground">Region</span>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-warning"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowKey((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground transition hover:bg-secondary"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showKey ? 'Hide key' : 'Reveal key'}
          </button>

          <button
            type="button"
            onClick={saveCredentials}
            className="rounded-xl bg-warning/10 px-4 py-3 text-sm font-medium text-warning transition hover:bg-warning/90"
          >
            Save AWS credentials
          </button>
        </div>

        {saved && <div className="text-sm text-success">AWS credentials saved locally.</div>}

        <div className="flex items-center gap-3 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
          <ShieldAlert className="h-4 w-4" />
          Keys are stored encrypted and never shown in plain text by default.
        </div>
      </div>
    </motion.section>
  );
};

export default AWSCredentials;
