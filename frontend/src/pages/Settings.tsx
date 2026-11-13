import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Github, RefreshCw, User } from 'lucide-react';
import { apiClient } from '@/services/api/interceptors';
import { API_BASE_URL } from '@/lib/constants';
import { githubService, GitHubRepository, ConnectedRepository } from '@/services/github-service';

type UserProfile = {
  id: string;
  username: string;
  email: string;
  avatar?: string;
};

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [githubRepos, setGithubRepos] = React.useState<GitHubRepository[]>([]);
  const [connectedRepos, setConnectedRepos] = React.useState<ConnectedRepository[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingRepos, setLoadingRepos] = React.useState(false);
  const [loadingConnected, setLoadingConnected] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [repositoryQuery, setRepositoryQuery] = React.useState('');

  const tabParam = (searchParams.get('tab') || '').toLowerCase();
  const activeTab = tabParam === 'profile' ? 'profile' : 'settings';
  const showProfileOnly = activeTab === 'profile';
  const connectedRepoNames = new Set(connectedRepos.map((repo) => repo.fullName));
  const filteredGithubRepos = githubRepos.filter((repo) =>
    !connectedRepoNames.has(repo.fullName)
    && repo.fullName.toLowerCase().includes(repositoryQuery.trim().toLowerCase())
  );

  const loadUser = async () => {
    try {
      const response = await apiClient.get('/api/users/me');
      const data = response.data as any;
      setUser(data.user || data?.data?.user || null);
    } catch (error) {
      setUser(null);
      setActionError('Could not load profile details. Please refresh or sign in again.');
    }
  };

  const loadConnectedRepos = async () => {
    setLoadingConnected(true);
    try {
      const response = await githubService.getConnectedRepositories();
      setConnectedRepos(response.repositories || []);
    } catch (error: any) {
      setConnectedRepos([]);
      setActionError(error.message || 'Could not load connected repositories.');
    } finally {
      setLoadingConnected(false);
    }
  };

  const loadGithubRepos = async () => {
    setLoadingRepos(true);
    try {
      const response = await githubService.listRepositories();
      setGithubRepos(response.data.repositories.slice(0, 25));
    } catch (error: any) {
      setGithubRepos([]);
      const message = error.response?.data?.error || error.message || 'Connect your GitHub account to manage repos.';
      setActionError(message);
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    setActionError(null);
    setActionMessage(null);

    await Promise.all([loadUser(), loadConnectedRepos(), loadGithubRepos()]);
    setLoading(false);
  };

  React.useEffect(() => {
    loadSettings();
  }, []);

  const handleConnectRepository = async (repo: GitHubRepository) => {
    setActionError(null);
    setActionMessage(null);

    try {
      await githubService.connectRepository({
        repositoryName: repo.name,
        repositoryOwner: repo.fullName.split('/')[0],
        repositoryUrl: repo.cloneUrl,
        isPrivate: repo.isPrivate,
        description: repo.description || '',
      });
      setActionMessage(`Connected ${repo.fullName}.`);
      await loadConnectedRepos();
    } catch (error: any) {
      setActionError(error.message || 'Failed to connect repository.');
    }
  };

  const handleDisconnectRepository = async (repo: ConnectedRepository) => {
    setActionError(null);
    setActionMessage(null);

    const [owner, repoName] = repo.fullName.split('/');
    try {
      await githubService.removeRepository(owner, repoName);
      setActionMessage(`Disconnected ${repo.fullName}.`);
      await loadConnectedRepos();
    } catch (error: any) {
      setActionError(error.message || 'Failed to remove repository.');
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
            Account console <span className="px-1 text-neutral-700">/</span> Settings
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            Manage your account identity and the repositories CloudOps can deploy.
          </p>
        </div>
        {activeTab === 'settings' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSettings()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 border border-white/10 bg-[#101010] px-3 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <a
              href={`${API_BASE_URL}/api/auth/github`}
              className="inline-flex h-9 items-center gap-2 border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition hover:bg-primary/15"
            >
              <Github className="h-3.5 w-3.5" />
              Reconnect GitHub
            </a>
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="h-fit border border-white/10 bg-[#0C0C0C] p-2">
          <div className="px-3 pb-2 pt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
            Account
          </div>
          <button
            type="button"
            aria-current={showProfileOnly ? 'page' : undefined}
            onClick={() => setSearchParams({ tab: 'profile' })}
            className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left text-sm transition ${
              showProfileOnly
                ? 'border-primary bg-primary/[0.06] text-white'
                : 'border-transparent text-neutral-400 hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <User className={`h-4 w-4 ${showProfileOnly ? 'text-primary' : 'text-neutral-500'}`} />
            <span>Profile</span>
          </button>
          <button
            type="button"
            aria-current={!showProfileOnly ? 'page' : undefined}
            onClick={() => setSearchParams({ tab: 'settings' })}
            className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left text-sm transition ${
              !showProfileOnly
                ? 'border-primary bg-primary/[0.06] text-white'
                : 'border-transparent text-neutral-400 hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <Github className={`h-4 w-4 ${!showProfileOnly ? 'text-primary' : 'text-neutral-500'}`} />
            <span>GitHub integration</span>
            {connectedRepos.length > 0 && (
              <span className="ml-auto font-mono text-[10px] text-neutral-600">{connectedRepos.length}</span>
            )}
          </button>
          <div className="mt-3 border-t border-white/[0.07] px-3 py-3 text-[10px] leading-5 text-neutral-600">
            Profile details are read-only. Repository access can be changed at any time.
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          {(actionMessage || actionError) && (
            <div
              role={actionError ? 'alert' : 'status'}
              className={`flex items-start gap-2 border px-4 py-3 text-sm ${
                actionError
                  ? 'border-destructive/40 bg-destructive/[0.06] text-destructive'
                  : 'border-emerald-400/30 bg-emerald-400/[0.05] text-emerald-300'
              }`}
            >
              {!actionError && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{actionError || actionMessage}</span>
            </div>
          )}

          {showProfileOnly ? (
            <section className="border border-white/10 bg-[#0C0C0C]">
              <div className="flex flex-col gap-5 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:p-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-primary/30 bg-primary/[0.08] font-mono text-2xl font-semibold text-primary">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    user?.username?.[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-600">Signed-in account</div>
                  <h2 className="mt-1 truncate text-xl font-semibold text-white">{user?.username || 'Profile unavailable'}</h2>
                  <p className="mt-1 truncate text-sm text-neutral-400">{user?.email || 'No email address is available'}</p>
                </div>
                <div className="sm:ml-auto sm:text-right">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600">Account ID</div>
                  <div className="mt-1 break-all font-mono text-xs text-neutral-400">{user?.id || 'Unavailable'}</div>
                </div>
              </div>

              <div className="grid divide-y divide-white/[0.07] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="p-5 sm:p-6">
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-600">Username</div>
                  <div className="mt-2 break-words text-sm font-medium text-neutral-200">{user?.username || 'Not available'}</div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-600">Email address</div>
                  <div className="mt-2 break-words text-sm font-medium text-neutral-200">{user?.email || 'Not available'}</div>
                </div>
              </div>
            </section>
          ) : (
            <section className="min-w-0 border border-white/10 bg-[#0C0C0C]">
              <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-[#141414] text-neutral-300">
                    <Github className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">GitHub repositories</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                      Choose which repositories CloudOps can deploy and redeploy.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 border border-white/[0.07] bg-[#101010] px-3 py-2">
                  <span className={`h-1.5 w-1.5 ${connectedRepos.length > 0 ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    {connectedRepos.length} linked
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <section className="min-w-0 border-b border-white/[0.07] p-4 sm:p-5">
                  <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.07] pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-200">Connected</h3>
                      <p className="mt-1 text-[11px] text-neutral-600">Repositories already enabled for deployments</p>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-600">{connectedRepos.length}</span>
                  </div>

                  {loadingConnected ? (
                    <div className="space-y-2 pt-3" aria-label="Loading connected repositories">
                      {[0, 1, 2].map((item) => <div key={item} className="h-[72px] animate-pulse border border-white/[0.06] bg-[#101010]" />)}
                    </div>
                  ) : connectedRepos.length > 0 ? (
                    <div className="divide-y divide-white/[0.07]">
                      {connectedRepos.map((repo) => (
                        <div key={repo.id} className="flex min-w-0 items-start justify-between gap-3 py-4">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-neutral-200">{repo.fullName}</div>
                            <div className="mt-1 line-clamp-2 text-xs text-neutral-500">{repo.description || 'Connected for deployments'}</div>
                            <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-neutral-600">
                              <span>{repo.status || 'connected'}</span>
                              <span className="text-neutral-800">/</span>
                              <span>{repo.isPrivate ? 'Private' : 'Public'}</span>
                              {repo.lastDeployedAt && (
                                <>
                                  <span className="text-neutral-800">/</span>
                                  <span>Last deployed {new Date(repo.lastDeployedAt).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDisconnectRepository(repo)}
                            className="shrink-0 border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-neutral-400 transition hover:border-destructive/40 hover:text-destructive"
                          >
                            Disconnect
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 border border-dashed border-white/10 bg-[#101010] p-4">
                      <div className="text-sm font-medium text-neutral-300">No repositories connected</div>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Connect a repository from the list to enable deployments and webhook-based redeploys.
                      </p>
                    </div>
                  )}
                </section>

                <section className="min-w-0 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-200">Available repositories</h3>
                      <p className="mt-1 text-[11px] text-neutral-600">{filteredGithubRepos.length} repositories available to connect</p>
                    </div>
                    <label className="relative block sm:w-52">
                      <span className="sr-only">Filter repositories</span>
                      <input
                        type="search"
                        value={repositoryQuery}
                        onChange={(event) => setRepositoryQuery(event.target.value)}
                        placeholder="Filter repositories"
                        className="h-8 w-full border border-white/10 bg-[#101010] px-3 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-primary/60"
                      />
                    </label>
                  </div>

                  {loadingRepos ? (
                    <div className="space-y-2 pt-3" aria-label="Loading available repositories">
                      {[0, 1, 2].map((item) => <div key={item} className="h-[72px] animate-pulse border border-white/[0.06] bg-[#101010]" />)}
                    </div>
                  ) : filteredGithubRepos.length > 0 ? (
                    <div className="divide-y divide-white/[0.07]">
                      {filteredGithubRepos.map((repo) => {
                        return (
                          <div key={repo.id} className="flex min-w-0 items-start justify-between gap-3 py-4">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-neutral-200">{repo.fullName}</div>
                              <div className="mt-1 line-clamp-2 text-xs text-neutral-500">{repo.description || 'No description provided'}</div>
                              <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-neutral-600">
                                <span>{repo.language || 'Unknown language'}</span>
                                <span className="text-neutral-800">/</span>
                                <span>{repo.isPrivate ? 'Private' : 'Public'}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleConnectRepository(repo)}
                              className="shrink-0 border border-primary/40 bg-primary/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-primary transition hover:bg-primary/15"
                            >
                              Connect
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 border border-dashed border-white/10 bg-[#101010] p-4 text-sm text-neutral-500">
                      {repositoryQuery
                        ? 'No repositories match that filter.'
                        : actionError
                          ? 'Could not load repositories. Refresh or reconnect GitHub to try again.'
                          : 'No repositories available. Refresh or reconnect GitHub to try again.'}
                    </div>
                  )}
                </section>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
