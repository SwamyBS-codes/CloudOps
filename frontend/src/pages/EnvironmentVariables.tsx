import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Database, Loader2, RefreshCw, Search, Eye, EyeOff, Copy, MoreHorizontal } from 'lucide-react';
import { deploymentService } from '@/services/auth-service';
import { apiClient } from '@/services/api/interceptors';
import { ENDPOINTS, generateEndpoint } from '@/services/api/endpoints';

type EnvItem = {
  key?: string;
  value?: string;
};

type DeploymentRecord = {
  _id?: string;
  projectId?: string | null;
  repositoryName?: string;
  repositoryUrl?: string;
  environmentVariables?: EnvItem[];
  updatedAt?: string;
  createdAt?: string;
};

type ProjectVariable = {
  key: string;
  updatedAt?: string;
};

type ProjectEnvGroup = {
  projectName: string;
  updatedAt?: string;
  variables: ProjectVariable[];
};

const DEFAULT_SCOPE = 'Production, Preview, and Development';
const INITIAL_VISIBLE_VARIABLES = 6;

const deriveProjectName = (deployment: DeploymentRecord) => {
  if (deployment.repositoryName?.trim()) return deployment.repositoryName.trim();

  const rawUrl = deployment.repositoryUrl?.trim();
  if (!rawUrl) return 'Unnamed project';

  const parts = rawUrl.replace(/\.git$/i, '').split('/').filter(Boolean);
  return parts[parts.length - 1] || 'Unnamed project';
};

const normalizeDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatShortDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

export default function EnvironmentVariablesPage() {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [selectedVar, setSelectedVar] = useState<{
    projectName: string;
    key: string;
    updatedAt?: string;
  } | null>(null);
  const [revealValue, setRevealValue] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const fetchDeploymentData = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await deploymentService.getAll();
      const responseData = response?.data as any;
      const raw = responseData?.data || responseData?.deployments || responseData || [];
      setDeployments(Array.isArray(raw) ? raw : []);
      setError(null);
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.error || fetchError?.message || 'Unable to load environment variables.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchDeploymentData();
  }, []);

  // When a variable is selected, derive its current value from deployments
  useEffect(() => {
    if (!selectedVar) {
      setSelectedValue(null);
      setRevealValue(false);
      return;
    }

    const { projectName, key } = selectedVar;

    // Find the latest deployment for this project that contains the key
    let latestValue = null;
    let latestDate = 0;

    for (const d of deployments) {
      const name = deriveProjectName(d);
      if (name !== projectName) continue;
      const vars = Array.isArray(d.environmentVariables) ? d.environmentVariables : [];
      for (const v of vars) {
        if (!v || !v.key) continue;
        if (v.key === key) {
          const t = normalizeDate(d.updatedAt || d.createdAt)?.getTime?.() || new Date(d.updatedAt || d.createdAt || Date.now()).getTime();
          if (t > latestDate) {
            latestDate = t;
            latestValue = v.value ?? null;
          }
        }
      }
    }

    setSelectedValue(latestValue);
    setRevealValue(false);
    // set editing field
    setEditingValue(latestValue ?? '');
  }, [selectedVar, deployments]);

  useEffect(() => {
    if (!selectedVar) {
      setSelectedProjectId(null);
      return;
    }

    // find a deployment for this project that has a projectId
    const { projectName, key } = selectedVar;
    for (const d of deployments) {
      if (!d) continue;
      const name = deriveProjectName(d);
      if (name !== projectName) continue;
      const vars = Array.isArray(d.environmentVariables) ? d.environmentVariables : [];
      if (vars.some((v) => v?.key === key) && d.projectId) {
        setSelectedProjectId(String(d.projectId));
        return;
      }
    }
    setSelectedProjectId(null);
  }, [selectedVar, deployments]);

  const groupedProjects = useMemo<ProjectEnvGroup[]>(() => {
    const groupMap = new Map<string, { updatedAt?: string; variableMap: Map<string, ProjectVariable> }>();

    for (const deployment of deployments) {
      const envVars = Array.isArray(deployment.environmentVariables) ? deployment.environmentVariables : [];
      if (!envVars.length) continue;

      const projectName = deriveProjectName(deployment);
      if (!groupMap.has(projectName)) {
        groupMap.set(projectName, { updatedAt: deployment.updatedAt || deployment.createdAt, variableMap: new Map() });
      }

      const currentGroup = groupMap.get(projectName);
      if (!currentGroup) continue;

      const currentUpdated = normalizeDate(currentGroup.updatedAt);
      const nextUpdated = normalizeDate(deployment.updatedAt || deployment.createdAt);
      if (!currentUpdated || (nextUpdated && nextUpdated > currentUpdated)) {
        currentGroup.updatedAt = deployment.updatedAt || deployment.createdAt;
      }

      for (const envVar of envVars) {
        const rawKey = envVar?.key?.trim();
        if (!rawKey) continue;

        const existing = currentGroup.variableMap.get(rawKey);
        const candidateUpdatedAt = deployment.updatedAt || deployment.createdAt;

        if (!existing) {
          currentGroup.variableMap.set(rawKey, {
            key: rawKey,
            updatedAt: candidateUpdatedAt,
          });
          continue;
        }

        const existingDate = normalizeDate(existing.updatedAt);
        const candidateDate = normalizeDate(candidateUpdatedAt);
        if (!existingDate || (candidateDate && candidateDate > existingDate)) {
          existing.updatedAt = candidateUpdatedAt;
        }
      }
    }

    return Array.from(groupMap.entries())
      .map(([projectName, group]) => ({
        projectName,
        updatedAt: group.updatedAt,
        variables: Array.from(group.variableMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [deployments]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return groupedProjects;

    return groupedProjects
      .map((project) => {
        const projectMatches = project.projectName.toLowerCase().includes(normalizedQuery);
        if (projectMatches) return project;

        const matchedVariables = project.variables.filter((item) => item.key.toLowerCase().includes(normalizedQuery));
        return {
          ...project,
          variables: matchedVariables,
        };
      })
      .filter((project) => project.variables.length > 0 || project.projectName.toLowerCase().includes(normalizedQuery));
  }, [groupedProjects, query]);

  const totalVariableCount = useMemo(
    () => groupedProjects.reduce((count, project) => count + project.variables.length, 0),
    [groupedProjects]
  );

  return (
    <>
      <main className="space-y-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Environment Variables
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">Project environment variables</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                View all environment variable keys grouped by project. Keys are collected from deployment records and shown without attention tags.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void fetchDeploymentData(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </motion.div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 ">
              <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Projects</div>
              <div className="mt-3 text-3xl font-semibold text-foreground">{groupedProjects.length}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 ">
              <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Variables</div>
              <div className="mt-3 text-3xl font-semibold text-primary">{totalVariableCount}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 ">
              <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Data Source</div>
              <div className="mt-3 text-lg font-semibold text-foreground">Deployments</div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-border bg-card p-4 ">
            <div className="relative w-full lg:max-w-lg">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects or environment keys"
                className="w-full rounded-2xl border border-border bg-secondary py-3 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-8 grid gap-4">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-44 animate-pulse rounded-3xl border border-border bg-secondary" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-border bg-card p-10 text-center text-muted-foreground">
              No environment variables found for your projects.
            </div>
          ) : (
            <div className="mt-8 space-y-5">
              {filteredProjects.map((project) => {
                const isExpanded = Boolean(expandedProjects[project.projectName]);
                const visibleVariables = isExpanded
                  ? project.variables
                  : project.variables.slice(0, INITIAL_VISIBLE_VARIABLES);

                return (
                  <motion.section
                    key={project.projectName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-3xl border border-border bg-card p-5 "
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-foreground">{project.projectName}</h2>
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                          {project.variables.length}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">Updated {formatShortDate(project.updatedAt)}</div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-border">
                      <table className="w-full min-w-[760px]">
                        <thead>
                          <tr className="bg-secondary text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            <th className="px-4 py-3">Variable</th>
                            <th className="px-4 py-3">Environment</th>
                            <th className="px-4 py-3">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleVariables.map((variable) => (
                            <tr
                              key={`${project.projectName}:${variable.key}`}
                              className="border-t border-border text-sm text-foreground hover:bg-secondary cursor-pointer"
                              onClick={() => setSelectedVar({ projectName: project.projectName, key: variable.key!, updatedAt: variable.updatedAt })}
                            >
                              <td className="px-4 py-3 font-mono text-[13px] text-primary">{variable.key}</td>
                              <td className="px-4 py-3 text-foreground">{DEFAULT_SCOPE}</td>
                              <td className="px-4 py-3 text-foreground">{formatShortDate(variable.updatedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {project.variables.length > INITIAL_VISIBLE_VARIABLES && (
                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProjects((prev) => ({
                              ...prev,
                              [project.projectName]: !isExpanded,
                            }))
                          }
                          className="rounded-full border border-border bg-secondary px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
                        >
                          {isExpanded ? 'Show Less' : 'Show More'}
                        </button>
                      </div>
                    )}
                  </motion.section>
                );
              })}
            </div>
          )}
        </div>
      </main>
  
      {/* Variable detail modal */}
      {selectedVar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-secondary" onClick={() => setSelectedVar(null)} />
          <div className="relative z-60 w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto">
            <div className="rounded-2xl bg-card border border-border p-6 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded bg-secondary text-foreground font-mono">{selectedVar.key}</div>
                    <div className="text-sm text-muted-foreground">All Environments</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">Added {formatShortDate(selectedVar.updatedAt)}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="p-2 rounded-full bg-secondary">
                    <MoreHorizontal className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs text-muted-foreground mb-2">Value</label>
                <div className="flex items-center gap-3">
                  <input
                    type={revealValue ? 'text' : 'password'}
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-secondary px-4 py-3 font-mono text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealValue((v) => !v)}
                    className="p-2 rounded-lg border border-border bg-secondary text-foreground"
                    aria-label="Toggle reveal value"
                  >
                    {revealValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => editingValue && navigator.clipboard?.writeText(String(editingValue))}
                    className="p-2 rounded-lg border border-border bg-secondary text-foreground"
                    aria-label="Copy value"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    onClick={async () => {
                      if (!selectedProjectId || !selectedVar) return;
                      try {
                        const payload = { key: selectedVar.key, value: editingValue };
                        await apiClient.put(generateEndpoint(ENDPOINTS.PROJECTS.UPDATE, { id: selectedProjectId }), payload);
                        // refresh deployments to reflect change
                        await fetchDeploymentData();
                        setSelectedValue(editingValue);
                        // close modal and clear editing state
                        setSelectedVar(null);
                        setEditingValue('');
                        setSelectedProjectId(null);
                      } catch (err) {
                        console.error('Failed to save env var', err);
                      }
                    }}
                    className="rounded-lg px-4 py-2 bg-primary/10 text-primary"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
