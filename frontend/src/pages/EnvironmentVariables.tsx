import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { projectService } from '@/services/auth-service';

type ProjectEnvItem = {
  key: string;
  value: string;
  encrypted?: boolean;
  _id?: string;
};

type ProjectData = {
  _id: string;
  repositoryName: string;
  repositoryOwner: string;
  repositoryUrl: string;
  environmentVariables: ProjectEnvItem[];
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  latestDeployment?: {
    _id: string;
    status: string;
    liveUrl?: string | null;
    provider?: string;
    containerGroupName?: string | null;
    updatedAt?: string;
  } | null;
};

export default function EnvironmentVariablesPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    message: string;
    deploymentId?: string | null;
    containerGroupName?: string | null;
  } | null>(null);
  const [query, setQuery] = useState('');

  // Visibility map: `${projectId}:${key}` -> boolean
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals & form state
  const [addModalOpen, setAddModalOpen] = useState<{ projectId: string; projectName: string } | null>(null);
  const [editModalOpen, setEditModalOpen] = useState<{ projectId: string; projectName: string; key: string; value: string; encrypted?: boolean } | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState<{ projectId: string; projectName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ projectId: string; key: string; projectName: string } | null>(null);

  const [varKey, setVarKey] = useState('');
  const [varValue, setVarValue] = useState('');
  const [varEncrypted, setVarEncrypted] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const fetchProjects = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await projectService.getAll();
      const raw = (response?.data as any)?.projects || (response?.data as any)?.data || response?.data || [];
      setProjects(Array.isArray(raw) ? raw : []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setError(err?.response?.data?.error || err?.message || 'Unable to load project environment variables.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedKey(id);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. Add variable handler
  const handleAddVariable = async () => {
    if (!addModalOpen || !varKey.trim()) return;
    setSaving(true);
    setError(null);
    setSyncFeedback(null);

    try {
      const res = await projectService.addEnvVariable(addModalOpen.projectId, {
        key: varKey.trim().toUpperCase(),
        value: varValue,
        encrypted: varEncrypted,
      });

      const data = res.data as any;
      const aciSynced = data?.aciSynced;
      const deploymentId = data?.deploymentId;
      const containerGroupName = data?.containerGroupName;

      setSyncFeedback({
        message: aciSynced
          ? `Added "${varKey.trim()}" and synced to live container${containerGroupName ? ` (${containerGroupName})` : ''}!`
          : `Added "${varKey.trim()}" successfully.`,
        deploymentId: aciSynced ? deploymentId : null,
        containerGroupName,
      });

      setAddModalOpen(null);
      setVarKey('');
      setVarValue('');
      setVarEncrypted(false);
      await fetchProjects(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to add environment variable.');
    } finally {
      setSaving(false);
    }
  };

  // 2. Edit variable handler
  const handleEditVariable = async () => {
    if (!editModalOpen || !editModalOpen.key) return;
    setSaving(true);
    setError(null);
    setSyncFeedback(null);

    try {
      const res = await projectService.addEnvVariable(editModalOpen.projectId, {
        key: editModalOpen.key,
        value: varValue,
        encrypted: varEncrypted,
      });

      const data = res.data as any;
      const aciSynced = data?.aciSynced;
      const deploymentId = data?.deploymentId;
      const containerGroupName = data?.containerGroupName;

      setSyncFeedback({
        message: aciSynced
          ? `Updated "${editModalOpen.key}" and synced to live container${containerGroupName ? ` (${containerGroupName})` : ''}!`
          : `Updated "${editModalOpen.key}" successfully.`,
        deploymentId: aciSynced ? deploymentId : null,
        containerGroupName,
      });

      setEditModalOpen(null);
      setVarValue('');
      await fetchProjects(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to update environment variable.');
    } finally {
      setSaving(false);
    }
  };

  // 3. Delete variable handler
  const handleDeleteVariable = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    setError(null);
    setSyncFeedback(null);

    try {
      const res = await projectService.deleteEnvVariable(deleteConfirm.projectId, deleteConfirm.key);
      const data = res.data as any;
      const aciSynced = data?.aciSynced;
      const deploymentId = data?.deploymentId;
      const containerGroupName = data?.containerGroupName;

      setSyncFeedback({
        message: aciSynced
          ? `Deleted "${deleteConfirm.key}" and updated live container${containerGroupName ? ` (${containerGroupName})` : ''}!`
          : `Deleted "${deleteConfirm.key}" successfully.`,
        deploymentId: aciSynced ? deploymentId : null,
        containerGroupName,
      });

      setDeleteConfirm(null);
      await fetchProjects(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete environment variable.');
    } finally {
      setSaving(false);
    }
  };

  // 4. Bulk import handler
  const handleBulkImport = async () => {
    if (!bulkModalOpen || !bulkText.trim()) return;
    setSaving(true);
    setError(null);
    setSyncFeedback(null);

    try {
      // Parse key=value lines
      const parsedVars: Record<string, string> = {};
      const lines = bulkText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim().toUpperCase();
          let v = trimmed.slice(eqIdx + 1).trim();
          // Remove surrounding quotes if present
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (k) parsedVars[k] = v;
        }
      }

      if (Object.keys(parsedVars).length === 0) {
        throw new Error('No valid KEY=VALUE lines found to import.');
      }

      const res = await projectService.update(bulkModalOpen.projectId, {
        environmentVariables: parsedVars,
      });

      const data = res.data as any;
      const aciSynced = data?.aciSynced;
      const deploymentId = data?.deploymentId;
      const containerGroupName = data?.containerGroupName;

      setSyncFeedback({
        message: aciSynced
          ? `Imported ${Object.keys(parsedVars).length} variables and synced to live container${containerGroupName ? ` (${containerGroupName})` : ''}!`
          : `Imported ${Object.keys(parsedVars).length} variables successfully.`,
        deploymentId: aciSynced ? deploymentId : null,
        containerGroupName,
      });

      setBulkModalOpen(null);
      setBulkText('');
      await fetchProjects(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to import environment variables.');
    } finally {
      setSaving(false);
    }
  };

  // Filtering
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;

    return projects.filter((p) => {
      const matchName = p.repositoryName?.toLowerCase().includes(q) || p.repositoryOwner?.toLowerCase().includes(q);
      const matchKey = (p.environmentVariables || []).some((v) => v.key?.toLowerCase().includes(q));
      return matchName || matchKey;
    });
  }, [projects, query]);

  const totalVarCount = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.environmentVariables?.length || 0), 0);
  }, [projects]);

  return (
    <main className="space-y-6 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              Project Settings
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">Environment Variables</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Manage application environment variables per project. Changes can be saved and hot-synced directly to live containers without rebuilds.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void fetchProjects(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-foreground transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Connected Projects</div>
            <div className="mt-3 text-3xl font-semibold text-foreground">{projects.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Total Variables</div>
            <div className="mt-3 text-3xl font-semibold text-primary">{totalVarCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Live Hot-Sync</div>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Supported for Azure ACI & Containers
            </div>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {syncFeedback && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              <span>{syncFeedback.message}</span>
            </div>
            {syncFeedback.deploymentId && (
              <button
                type="button"
                onClick={() => navigate(`/deployments/${syncFeedback.deploymentId}`)}
                className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/30"
              >
                <span>View Live Restart Logs</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-3">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by project name or variable key (e.g. MONGODB_URI, PORT)..."
              className="w-full rounded-xl border border-border bg-secondary py-2.5 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>

        {/* Projects List */}
        {loading ? (
          <div className="mt-8 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl border border-border bg-secondary" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
            No projects found matching your query.
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {filteredProjects.map((project) => {
              const envList = project.environmentVariables || [];
              const liveDep = project.latestDeployment;
              const isLive = liveDep && ['running', 'success'].includes(liveDep.status);

              return (
                <div key={project._id} className="rounded-2xl border border-border bg-card p-5">
                  {/* Project Top Bar */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-semibold text-foreground">{project.repositoryName}</h2>
                        <span className="text-xs font-mono text-muted-foreground">({project.repositoryOwner})</span>
                        {isLive && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live ACI
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{envList.length} variable{envList.length === 1 ? '' : 's'}</span>
                        {liveDep?.liveUrl && (
                          <a
                            href={liveDep.liveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Globe2 className="h-3 w-3" />
                            {liveDep.liveUrl}
                          </a>
                        )}
                        {liveDep?._id && (
                          <button
                            type="button"
                            onClick={() => navigate(`/deployments/${liveDep._id}`)}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-mono"
                            title="Inspect live deployment and restart logs"
                          >
                            <span>Deployment logs ({liveDep._id.slice(-8)})</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setVarKey('');
                          setVarValue('');
                          setVarEncrypted(false);
                          setAddModalOpen({ projectId: project._id, projectName: project.repositoryName });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Variable
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBulkText('');
                          setBulkModalOpen({ projectId: project._id, projectName: project.repositoryName });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/[0.06]"
                        title="Import multiple variables from .env format"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Bulk Import (.env)
                      </button>
                    </div>
                  </div>

                  {/* Variables Table */}
                  {envList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No environment variables defined yet for this project. Click &ldquo;Add Variable&rdquo; to configure one.
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-secondary text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                          <tr>
                            <th className="px-4 py-2.5">Key</th>
                            <th className="px-4 py-2.5">Value</th>
                            <th className="px-4 py-2.5">Scope</th>
                            <th className="px-4 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {envList.map((item) => {
                            const rowId = `${project._id}:${item.key}`;
                            const isRevealed = Boolean(revealedKeys[rowId]);
                            const isCopied = copiedKey === rowId;

                            return (
                              <tr key={item.key} className="hover:bg-secondary/40 transition">
                                <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                                  {item.key}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-foreground">
                                  <div className="flex items-center gap-2 max-w-md">
                                    <span className="truncate">
                                      {isRevealed ? item.value : '••••••••••••••••'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleReveal(rowId)}
                                      className="text-muted-foreground hover:text-foreground"
                                      title={isRevealed ? 'Hide' : 'Reveal'}
                                    >
                                      {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(item.value, rowId)}
                                      className="text-muted-foreground hover:text-foreground"
                                      title="Copy value"
                                    >
                                      {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px]">
                                    {item.encrypted ? <Lock className="h-3 w-3 text-amber-400" /> : <Unlock className="h-3 w-3 text-neutral-400" />}
                                    Production / All
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVarValue(item.value || '');
                                        setVarEncrypted(Boolean(item.encrypted));
                                        setEditModalOpen({
                                          projectId: project._id,
                                          projectName: project.repositoryName,
                                          key: item.key,
                                          value: item.value || '',
                                          encrypted: Boolean(item.encrypted),
                                        });
                                      }}
                                      className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteConfirm({
                                          projectId: project._id,
                                          key: item.key,
                                          projectName: project.repositoryName,
                                        });
                                      }}
                                      className="rounded-lg border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                                      title="Delete variable"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Add Variable */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAddModalOpen(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Add Environment Variable</h3>
                <p className="text-xs text-muted-foreground">Project: {addModalOpen.projectName}</p>
              </div>
              <button type="button" onClick={() => setAddModalOpen(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground uppercase tracking-wider mb-1.5">
                  Key
                </label>
                <input
                  type="text"
                  value={varKey}
                  onChange={(e) => setVarKey(e.target.value)}
                  placeholder="e.g. MONGODB_URI, JWT_SECRET, PORT"
                  className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground uppercase tracking-wider mb-1.5">
                  Value
                </label>
                <textarea
                  rows={3}
                  value={varValue}
                  onChange={(e) => setVarValue(e.target.value)}
                  placeholder="Enter variable value..."
                  className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="add-encrypted"
                  checked={varEncrypted}
                  onChange={(e) => setVarEncrypted(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-0"
                />
                <label htmlFor="add-encrypted" className="text-xs text-muted-foreground cursor-pointer">
                  Encrypt & mask by default (sensitive credentials, API keys)
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setAddModalOpen(null)}
                className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !varKey.trim()}
                onClick={() => void handleAddVariable()}
                className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Variable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Variable */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditModalOpen(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Edit Environment Variable</h3>
                <p className="text-xs font-mono text-primary">{editModalOpen.key}</p>
              </div>
              <button type="button" onClick={() => setEditModalOpen(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground uppercase tracking-wider mb-1.5">
                  Value
                </label>
                <textarea
                  rows={4}
                  value={varValue}
                  onChange={(e) => setVarValue(e.target.value)}
                  className="w-full rounded-xl border border-border bg-secondary px-3.5 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-encrypted"
                  checked={varEncrypted}
                  onChange={(e) => setVarEncrypted(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-0"
                />
                <label htmlFor="edit-encrypted" className="text-xs text-muted-foreground cursor-pointer">
                  Mask value in UI
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setEditModalOpen(null)}
                className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleEditVariable()}
                className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save & Hot-Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Bulk Import (.env) */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setBulkModalOpen(null)} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Bulk Import .env</h3>
                <p className="text-xs text-muted-foreground">Project: {bulkModalOpen.projectName}</p>
              </div>
              <button type="button" onClick={() => setBulkModalOpen(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Paste your <code className="font-mono text-primary">.env</code> file content below. Lines with <code className="font-mono">#</code> comments will be ignored.
              </p>
              <textarea
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="PORT=5000&#10;MONGODB_URI=mongodb+srv://...&#10;JWT_SECRET=supersecret123&#10;NODE_ENV=production"
                className="w-full rounded-xl border border-border bg-secondary p-3 font-mono text-xs text-foreground outline-none focus:border-primary"
                autoFocus
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setBulkModalOpen(null)}
                className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !bulkText.trim()}
                onClick={() => void handleBulkImport()}
                className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import Variables
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-destructive">Delete Variable</h3>
            <p className="mt-2 text-xs text-neutral-300">
              Are you sure you want to delete <code className="font-mono font-bold text-primary">{deleteConfirm.key}</code> from project <strong>{deleteConfirm.projectName}</strong>?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              If an Azure ACI container is currently running, it will be automatically restarted without this variable.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDeleteVariable()}
                className="inline-flex items-center gap-2 rounded-xl border border-destructive bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
