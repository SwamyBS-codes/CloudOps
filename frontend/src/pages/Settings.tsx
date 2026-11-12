import React from 'react';
import { useSearchParams } from 'react-router-dom';
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

  const tabParam = (searchParams.get('tab') || '').toLowerCase();
  const activeTab = tabParam === 'profile' ? 'profile' : 'settings';
  const showProfileOnly = activeTab === 'profile';

  const loadUser = async () => {
    try {
      const response = await apiClient.get('/api/users/me');
      const data = response.data as any;
      setUser(data.user || data?.data?.user || null);
    } catch (error) {
      setUser(null);
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

  const hasRepoConnection = (fullName: string) => connectedRepos.some((connected) => connected.fullName === fullName);

  return (
    <>
      <main className="space-y-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">
              Manage your account and GitHub repository connections for CloudOps.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-border bg-secondary p-1">
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'profile' })}
              className={`rounded-lg px-4 py-2 text-sm transition ${activeTab === 'profile' ? 'bg-primary/10 text-primary' : 'text-foreground hover:text-foreground hover:bg-secondary'}`}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'settings' })}
              className={`rounded-lg px-4 py-2 text-sm transition ${activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'text-foreground hover:text-foreground hover:bg-secondary'}`}
            >
              Integrations
            </button>
          </div>

          {showProfileOnly ? (
            <section className="rounded-2xl border border-border bg-card p-6 ">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="text-xl font-semibold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">{user?.username || 'Unknown user'}</h2>
                    <p className="text-sm text-muted-foreground">{user?.email || 'No email available'}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-secondary p-4">
                    <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Username</p>
                    <p className="mt-2 text-base text-foreground">{user?.username || 'Not connected'}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary p-4">
                    <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Email</p>
                    <p className="mt-2 text-base text-foreground">{user?.email || 'Not connected'}</p>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <section className="rounded-2xl border border-border bg-card p-6 ">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">GitHub Integration</h2>
                    <p className="text-sm text-muted-foreground">
                      Connect repositories to enable automated deployments and webhook-based redeploys.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => loadSettings()}
                      className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-foreground transition hover:bg-secondary"
                    >
                      Refresh
                    </button>
                    <a
                      href={`${API_BASE_URL}/api/auth/github`}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                    >
                      Reconnect GitHub
                    </a>
                  </div>
                </div>

                {(actionMessage || actionError) && (
                  <div className={`mt-4 rounded-2xl border p-4 ${actionError ? 'border-destructive bg-destructive/10 text-destructive' : 'border-success bg-success/10 text-success'}`}>
                    {actionError || actionMessage}
                  </div>
                )}

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-secondary p-5">
                    <h3 className="text-lg font-semibold text-foreground">Connected repositories</h3>
                    <p className="text-sm text-muted-foreground">Repositories already linked to CloudOps.</p>

                    {loadingConnected ? (
                      <div className="mt-4 text-sm text-muted-foreground">Loading connected repos…</div>
                    ) : connectedRepos.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {connectedRepos.map((repo) => (
                          <div key={repo.id} className="rounded-2xl border border-border bg-secondary p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="font-medium text-foreground">{repo.fullName}</div>
                                <div className="text-sm text-muted-foreground">{repo.description || 'Connected for deploys'}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDisconnectRepository(repo)}
                                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
                              >
                                Disconnect
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full bg-secondary px-2 py-1">{repo.status || 'connected'}</span>
                              <span className="rounded-full bg-secondary px-2 py-1">{repo.isPrivate ? 'Private' : 'Public'}</span>
                              {repo.lastDeployedAt ? <span className="rounded-full bg-secondary px-2 py-1">Last deploy: {new Date(repo.lastDeployedAt).toLocaleDateString()}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary p-4 text-sm text-muted-foreground">
                        No repositories are connected yet. Use the list on the right to connect a repository.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-secondary p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">Available GitHub repos</h3>
                        <p className="text-sm text-muted-foreground">Select repositories to connect for automated deployments.</p>
                      </div>
                    </div>

                    {loadingRepos ? (
                      <div className="mt-4 text-sm text-muted-foreground">Loading GitHub repositories…</div>
                    ) : githubRepos.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {githubRepos.map((repo) => {
                          const isConnected = hasRepoConnection(repo.fullName);
                          return (
                            <div key={repo.id} className="rounded-2xl border border-border bg-secondary p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-medium text-foreground">{repo.fullName}</div>
                                  <div className="text-sm text-muted-foreground">{repo.description || 'No description available'}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleConnectRepository(repo)}
                                  disabled={isConnected}
                                  className={`rounded-lg px-3 py-2 text-sm transition ${isConnected ? 'border border-border bg-secondary text-foreground/40' : 'border border-primary bg-primary/10 text-primary hover:bg-primary/90'}`}
                                >
                                  {isConnected ? 'Connected' : 'Connect'}
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full bg-secondary px-2 py-1">{repo.language || 'Unknown'}</span>
                                <span className="rounded-full bg-secondary px-2 py-1">{repo.isPrivate ? 'Private' : 'Public'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary p-4 text-sm text-muted-foreground">
                        {actionError || 'No repositories available. Connect GitHub or refresh the page.'}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
