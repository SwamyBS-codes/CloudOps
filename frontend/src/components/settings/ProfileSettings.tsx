import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, UserCircle2 } from 'lucide-react';
import { SETTINGS_KEYS, readStoredValue, writeStoredValue } from './settings-storage';

type ProfileSettingsValue = {
  name: string;
  email: string;
};

const DEFAULT_PROFILE: ProfileSettingsValue = {
  name: 'Avery Carter',
  email: 'avery@cloudops.dev',
};

const ProfileSettings: React.FC = () => {
  const [name, setName] = useState(() => readStoredValue(SETTINGS_KEYS.PROFILE, DEFAULT_PROFILE).name);
  const [email, setEmail] = useState(() => readStoredValue(SETTINGS_KEYS.PROFILE, DEFAULT_PROFILE).email);
  const [saved, setSaved] = useState(false);

  const saveProfile = () => {
    writeStoredValue(SETTINGS_KEYS.PROFILE, { name, email });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <motion.section whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card  p-5 ">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Profile settings</h2>
          <p className="text-sm text-muted-foreground">Manage your personal account details.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
          <UserCircle2 className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveProfile}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted-foreground">Email address</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={saveProfile}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </label>

        <button
          type="button"
          onClick={saveProfile}
          className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/90"
        >
          Save profile
        </button>

        {saved && <div className="text-sm text-success">Profile saved.</div>}

        <div className="flex items-center gap-3 rounded-xl border border-success bg-success/10 px-4 py-3 text-sm text-success">
          <BadgeCheck className="h-4 w-4" />
          Profile synced with GitHub and CloudOps workspace.
        </div>
      </div>
    </motion.section>
  );
};

export default ProfileSettings;
