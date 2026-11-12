import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BellRing, Mail, MessageSquare } from 'lucide-react';
import { SETTINGS_KEYS, readStoredValue, writeStoredValue } from './settings-storage';

type NotificationSettingsValue = {
  email: boolean;
  slack: boolean;
  browser: boolean;
};

const DEFAULT_NOTIFICATIONS: NotificationSettingsValue = {
  email: true,
  slack: true,
  browser: false,
};

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-success/10' : 'bg-secondary'}`}
    aria-pressed={checked}
  >
    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-secondary transition ${checked ? 'left-5' : 'left-0.5'}`} />
  </button>
);

const Notifications: React.FC = () => {
  const stored = readStoredValue(SETTINGS_KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATIONS);
  const [email, setEmail] = useState(stored.email);
  const [slack, setSlack] = useState(stored.slack);
  const [browser, setBrowser] = useState(stored.browser);

  const persist = (next: NotificationSettingsValue) => {
    setEmail(next.email);
    setSlack(next.slack);
    setBrowser(next.browser);
    writeStoredValue(SETTINGS_KEYS.NOTIFICATIONS, next);
  };

  return (
    <motion.section whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card  p-5 ">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notification preferences</h2>
          <p className="text-sm text-muted-foreground">Choose how you get deployment updates.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-violet-300">
          <BellRing className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-3">
        {[
          { label: 'Email notifications', icon: <Mail className="h-4 w-4" />, checked: email, onChange: (value: boolean) => persist({ email: value, slack, browser }) },
          { label: 'Slack alerts', icon: <MessageSquare className="h-4 w-4" />, checked: slack, onChange: (value: boolean) => persist({ email, slack: value, browser }) },
          { label: 'Browser notifications', icon: <BellRing className="h-4 w-4" />, checked: browser, onChange: (value: boolean) => persist({ email, slack, browser: value }) },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3">
            <div className="flex items-center gap-3 text-sm text-foreground">
              <span className="text-primary">{item.icon}</span>
              {item.label}
            </div>
            <Toggle checked={item.checked} onChange={item.onChange} />
          </div>
        ))}
      </div>
    </motion.section>
  );
};

export default Notifications;
