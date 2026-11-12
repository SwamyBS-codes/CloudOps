import React, { useEffect, useMemo, useState } from 'react';
import RepoCard, { Repo } from './RepoCard';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { githubService, GitHubRepository } from '@/services/github-service';
import { axiosClient } from '@/services/api/axios-client';
import { useAuth } from '@/app/providers/auth-provider';
import { useNavigate } from 'react-router-dom';
import { Github, Loader2, Search, Plus, Trash2, X } from 'lucide-react';

const STORAGE_KEY = 'cloudops_connected_repositories';

type EnvDraft = {
  id: number;
  key: string;
  value: string;
};

const isObjectId = (value: string | undefined | null) => !!value && /^[a-f0-9]{24}$/i.test(value);

const buildProjectId = (repoId: string | number, user: any) => {
  const fromUser = user?.id || user?._id || user?.sub;
  if (isObjectId(fromUser)) {
    return fromUser;
  }

  if (typeof repoId === 'number' && Number.isFinite(repoId)) {
    return Math.abs(repoId).toString(16).padStart(24, '0').slice(0, 24);
  }

  return '507f1f77bcf86cd799439011';
};

const RepoList: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [connectedRepos, setConnectedRepos] = useState<Repo[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployingRepo, setDeployingRepo] = useState<Repo | null>(null);
  const [envVars, setEnvVars] = useState<EnvDraft[]>([{ id: 1, key: 'NODE_ENV', value: 'production' }]);
  const [isStartingDeployment, setIsStartingDeployment] = useState(false);
  const [startDeploymentError, setStartDeploymentError] = useState<string | null>(null);

  // Load connected repositories from MongoDB on component mount
  useEffect(() => {
    const loadConnectedRepos = async () => {
      try {
        const data = await githubService.getConnectedRepositories();
        
        // Transform backend data to frontend Repo format
        const mapped = (data.repositories || []).map((repo: any): Repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.fullName,
          description: repo.description || null,
          language: null, // Not available from Projects model
          updatedAt: repo.updatedAt,
          htmlUrl: repo.repositoryUrl,
          cloneUrl: repo.repositoryUrl,
          isPrivate: repo.isPrivate,
          defaultBranch: 'main', // Not stored in Projects model
        }));

        setConnectedRepos(mapped);
        console.log(`✅ Loaded ${mapped.length} connected repositories from MongoDB`);
      } catch (err: any) {
        console.error('Failed to load connected repositories:', err);
        // Fallback to localStorage if backend fails
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            setConnectedRepos(JSON.parse(saved));
          }
        } catch {
          setConnectedRepos([]);
        }
      }
    };

    loadConnectedRepos();
  }, []);

  const persistConnections = (items: Repo[]) => {
    setConnectedRepos(items);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  };

  const fetchRepositories = async () => {
    if (!isAuthenticated) {
      setError('Please sign in first to connect GitHub repositories.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await githubService.listRepositories();
      const mapped = (response.data.repositories || []).map((repository: GitHubRepository): Repo => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName,
        description: repository.description,
        language: repository.language,
        updatedAt: repository.updatedAt,
        htmlUrl: repository.htmlUrl,
        cloneUrl: repository.cloneUrl,
        isPrivate: repository.isPrivate,
        defaultBranch: repository.defaultBranch,
      }));

      setRepos(mapped);
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.error || 'Unable to load GitHub repositories.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectRepository = async () => {
    setShowBrowser(true);
    if (!repos.length) {
      await fetchRepositories();
    }
  };

  const filtered = useMemo(() => {
    const list = repos.filter((repo) => {
      const searchable = `${repo.name} ${repo.fullName} ${repo.language || ''} ${repo.description || ''}`.toLowerCase();
      return searchable.includes(query.toLowerCase());
    });

    return list.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [repos, query]);

  const handleConnect = (repo: Repo) => {
    const next = connectedRepos.some((item) => item.id === repo.id)
      ? connectedRepos
      : [repo, ...connectedRepos];

    persistConnections(next);
  };

  const handleRemove = (repo: Repo) => {
    persistConnections(connectedRepos.filter((item) => item.id !== repo.id));
  };

  const handleDeploy = (repo: Repo) => {
    setDeployingRepo(repo);
    setEnvVars((current) => current.length > 0 ? current : [{ id: Date.now(), key: 'NODE_ENV', value: 'production' }]);
  };

  const addEnvVar = () => {
    setEnvVars((current) => [...current, { id: Date.now(), key: '', value: '' }]);
  };

  const updateEnvVar = (id: number, field: 'key' | 'value', nextValue: string) => {
    setEnvVars((current) => current.map((item) => (item.id === id ? { ...item, [field]: nextValue } : item)));
  };

  const removeEnvVar = (id: number) => {
    setEnvVars((current) => current.filter((item) => item.id !== id));
  };

  const confirmDeploy = async () => {
    if (!deployingRepo) return;

    const repoToDeploy = deployingRepo;

    const normalizedEnvVars = envVars
      .map((item) => ({ key: item.key.trim(), value: item.value.trim() }))
      .filter((item) => item.key.length > 0);

    const environmentVariables = normalizedEnvVars.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    setStartDeploymentError(null);
    setIsStartingDeployment(true);

    try {
      const response = await axiosClient.post('/api/deploy/start', {
        projectId: buildProjectId(repoToDeploy.id, user),
        repositoryUrl: repoToDeploy.cloneUrl,
        branch: repoToDeploy.defaultBranch || 'main',
        environmentVariables,
      });

      const deploymentId = response?.data?.deploymentId;
      if (!deploymentId) {
        throw new Error('Deployment started but no deploymentId was returned by the server.');
      }

      sessionStorage.setItem('cloudops_selected_repository', JSON.stringify({ ...repoToDeploy, envVars: normalizedEnvVars }));
      setDeployingRepo(null);
      navigate(`/deployments/${encodeURIComponent(deploymentId)}`);
    } catch (deployError: any) {
      setStartDeploymentError(
        deployError?.response?.data?.error
        || deployError?.response?.data?.details?.join(', ')
        || deployError?.message
        || 'Unable to start deployment.'
      );
    } finally {
      setIsStartingDeployment(false);
    }
  };

  const closeDeployModal = () => {
    if (isStartingDeployment) return;
    setStartDeploymentError(null);
    setDeployingRepo(null);
  };

  const deployModal = deployingRepo ? (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-secondary px-4 py-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          className="relative z-[10000] w-full max-w-2xl rounded-3xl border border-border bg-card p-6 "
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold text-foreground">
                Deploy {deployingRepo.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">Add environment variables, then start deployment to see real server logs.</p>
            </div>

            <button
              type="button"
              onClick={closeDeployModal}
              className={`rounded-xl border border-border bg-secondary p-2 text-foreground transition ${isStartingDeployment ? 'cursor-not-allowed opacity-40' : 'hover:bg-secondary'}`}
              aria-label="Close deploy dialog"
              disabled={isStartingDeployment}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {envVars.map((item) => (
              <div key={item.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  value={item.key}
                  onChange={(event) => updateEnvVar(item.id, 'key', event.target.value)}
                  placeholder="ENV KEY"
                  className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                />
                <input
                  value={item.value}
                  onChange={(event) => updateEnvVar(item.id, 'value', event.target.value)}
                  placeholder="ENV VALUE"
                  className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeEnvVar(item.id)}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary px-4 py-3 text-foreground transition hover:bg-secondary"
                  aria-label="Remove environment variable"
                  disabled={isStartingDeployment}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {startDeploymentError && (
            <div className="mt-4 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {startDeploymentError}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={addEnvVar}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground transition hover:bg-secondary disabled:opacity-50"
              disabled={isStartingDeployment}
            >
              <Plus className="h-4 w-4" />
              Add variable
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeDeployModal}
                className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground transition hover:bg-secondary disabled:opacity-50"
                disabled={isStartingDeployment}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeploy}
                className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/90 disabled:opacity-50"
                disabled={isStartingDeployment}
              >
                {isStartingDeployment ? 'Starting deployment...' : 'Start deployment'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  ) : null;

  return (
    <div>
      <section className="rounded-2xl border border-border bg-card  p-5  mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Connect a repository</h2>
            <p className="text-sm text-muted-foreground">Pick one or more GitHub repositories to display them as cards.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleConnectRepository}
              className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/90"
            >
              <Github className="h-4 w-4" />
              Connect repository
            </button>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-2xl font-bold text-text-primary">Connected repositories</h3>
            <p className="text-text-secondary">Choose a repository here, then deploy it to show up in Live Projects.</p>
          </div>
          <div className="text-sm text-text-secondary">{connectedRepos.length} selected</div>
        </div>

        {connectedRepos.length > 0 ? (
          <AnimatePresence>
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedRepos.map((repo) => (
                <motion.div key={repo.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                  <RepoCard repo={repo} selected onRemove={handleRemove} onDeploy={handleDeploy} />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-secondary px-6 py-8 text-center text-muted-foreground">
            No connected repositories yet. Use <span className="text-foreground">Connect repository</span> to choose one from GitHub.
          </div>
        )}
      </section>

      {typeof document !== 'undefined' && deployModal ? createPortal(deployModal, document.body) : null}

      {showBrowser && (
        <section className="rounded-2xl border border-border bg-card  p-5 ">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Available GitHub repositories</h3>
              <p className="text-sm text-muted-foreground">Select a repository to add it to your CloudOps cards.</p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search repositories..."
                className="w-full rounded-xl border border-border bg-secondary py-3 pl-10 pr-4 text-foreground placeholder-white/40 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-4 text-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading repositories from GitHub...
            </div>
          ) : filtered.length > 0 ? (
            <AnimatePresence>
              <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((repo) => (
                  <motion.div key={repo.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                    <RepoCard
                      repo={repo}
                      selected={connectedRepos.some((item) => item.id === repo.id)}
                      onConnect={handleConnect}
                      onRemove={handleRemove}
                      onDeploy={handleDeploy}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="rounded-2xl border border-border bg-secondary px-6 py-8 text-center text-muted-foreground">
              No repositories match your search.
            </div>
          )}
        </section>
      )}
    </div>
  );
};
export default RepoList;