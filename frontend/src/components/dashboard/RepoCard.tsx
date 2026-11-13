import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Github, Lock, CheckCircle2, Rocket, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { githubService } from '../../services/github-service';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type Repo = {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
};

const RepoCard: React.FC<{
  repo: Repo;
  selected?: boolean;
  onConnect?: (repo: Repo) => void;
  onRemove?: (repo: Repo) => void;
  onDeploy?: (repo: Repo) => void;
}> = ({ repo, selected = false, onConnect, onRemove }) => {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setFeedback(null);
    try {
      const repositoryOwner = repo.fullName.split('/')[0];
      await githubService.connectRepository({
        repositoryName: repo.name,
        repositoryOwner,
        repositoryUrl: repo.htmlUrl,
        isPrivate: repo.isPrivate,
        description: repo.description || undefined,
      });
      setFeedback({ type: 'success', message: 'Webhook created successfully!' });
      setTimeout(() => onConnect?.(repo), 1500);
    } catch (error: any) {
      setFeedback({ type: 'error', message: error.message || 'Failed to connect repo.' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    setFeedback(null);
    try {
      const repositoryOwner = repo.fullName.split('/')[0];
      await githubService.removeRepository(repositoryOwner, repo.name);
      setFeedback({ type: 'success', message: 'Repository disconnected successfully!' });
      setTimeout(() => onRemove?.(repo), 1500);
    } catch (error: any) {
      setFeedback({ type: 'error', message: error.message || 'Failed to disconnect repo.' });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <motion.article
      layout
      whileHover={{ y: -2 }}
      className="group flex h-full flex-col"
    >
      <Card className="flex h-full flex-col border-border/60 bg-card/80 p-5 transition-all hover:border-primary/30 hover:shadow-glow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-foreground">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">{repo.name}</h3>
              <p className="text-xs text-muted-foreground">{repo.fullName}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={selected ? 'success' : 'secondary'}>
              {selected ? 'Connected' : 'Available'}
            </Badge>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {repo.isPrivate ? <Lock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {repo.isPrivate ? 'Private' : 'Public'}
            </div>
          </div>
        </div>

        <p className="mt-4 min-h-[3rem] line-clamp-3 text-sm text-muted-foreground">
          {repo.description || 'No description provided.'}
        </p>

        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                'mt-3 flex items-center gap-2 rounded-lg p-2 text-xs',
                feedback.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
              )}
            >
              {feedback.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
              {feedback.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GitHub
          </a>
          <div className="flex items-center gap-2">
            {selected ? (
              <>
                <Button variant="outline" size="sm" onClick={handleRemove} disabled={isRemoving}>
                  {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const owner = repo.fullName.split('/')[0];
                    navigate(`/deploy/${owner}/${repo.name}`);
                  }}
                >
                  <Rocket className="h-4 w-4" />
                  Deploy
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.article>
  );
};

export default RepoCard;
