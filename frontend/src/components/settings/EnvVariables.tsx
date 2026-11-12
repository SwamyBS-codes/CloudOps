import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Braces } from 'lucide-react';
import { SETTINGS_KEYS, readStoredValue, writeStoredValue } from './settings-storage';

type EnvVar = { id: number; key: string; value: string };

const initialVars: EnvVar[] = [
  { id: 1, key: 'NODE_ENV', value: 'production' },
  { id: 2, key: 'AWS_REGION', value: 'us-east-1' },
  { id: 3, key: 'DEPLOY_TARGET', value: 'ecs' },
];

const EnvVariables: React.FC = () => {
  const [items, setItems] = useState<EnvVar[]>(() => readStoredValue(SETTINGS_KEYS.ENV_VARS, initialVars));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const persist = (next: EnvVar[]) => {
    setItems(next);
    writeStoredValue(SETTINGS_KEYS.ENV_VARS, next);
  };

  const resetForm = () => {
    setEditingId(null);
    setKey('');
    setValue('');
  };

  const startEdit = (item: EnvVar) => {
    setEditingId(item.id);
    setKey(item.key);
    setValue(item.value);
  };

  const save = () => {
    if (!key.trim()) return;

    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, key, value } : item)));
    } else {
      persist([...items, { id: Date.now(), key, value }]);
    }
    resetForm();
  };

  const remove = (id: number) => persist(items.filter((item) => item.id !== id));

  const clearAll = () => {
    persist([]);
    resetForm();
  };

  return (
    <motion.section whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card  p-5  lg:col-span-2">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Environment variables</h2>
          <p className="text-sm text-muted-foreground">Add, edit, or delete deployment configuration values.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
          <Braces className="h-5 w-5" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="KEY" className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-primary" />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-primary md:col-span-1" />
        <div className="flex gap-2 md:justify-end">
          <button type="button" onClick={save} className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-medium text-foreground">
            {editingId ? 'Save' : 'Add'}
          </button>
          <button type="button" onClick={resetForm} className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
            Clear
          </button>
          <button type="button" onClick={clearAll} className="rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Reset all
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div key={item.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-foreground">{item.key}</div>
                <div className="truncate text-sm text-muted-foreground">{item.value}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => startEdit(item)} className="rounded-lg bg-secondary p-2 text-foreground hover:bg-secondary" aria-label="Edit variable">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(item.id)} className="rounded-lg bg-destructive/10 p-2 text-destructive hover:bg-destructive/90" aria-label="Delete variable">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
};

export default EnvVariables;
