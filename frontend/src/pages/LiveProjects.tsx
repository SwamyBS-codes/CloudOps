import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DEPLOYED_PROJECTS_STORAGE_KEY } from '@/lib/constants';

type DeployedProject = {
  id: string;
  name: string;
  fullName: string;
  language?: string | null;
  deployedAt?: string;
  liveUrl?: string;
};

const DeployedProjectCard: React.FC<{ project: DeployedProject }> = ({ project }) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.16em] text-primary">Live Project</div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{project.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{project.fullName}</p>
        </div>

        <div className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
          Deployed
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded-full bg-secondary px-3 py-1">{project.language || 'Repository'}</span>
        <span className="rounded-full bg-secondary px-3 py-1">{project.deployedAt ? new Date(project.deployedAt).toLocaleString() : 'Just now'}</span>
      </div>
    </>
  );

  if (project.liveUrl) {
    return (
      <motion.a
        layout
        whileHover={{ y: -4 }}
        href={project.liveUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open live project ${project.name}`}
        className="block rounded-2xl border border-border bg-card p-5  transition hover:border-primary"
      >
        {content}
        <div className="mt-4 text-xs text-primary">Open live link in new tab</div>
      </motion.a>
    );
  }

  return (
    <motion.div
      layout
      whileHover={{ y: -4 }}
      className="rounded-2xl border border-border bg-card p-5 "
    >
      {content}
      <div className="mt-4 text-xs text-muted-foreground">Live link unavailable</div>
    </motion.div>
  );
};

export default function LiveProjectsPage() {
  const [deployedProjects, setDeployedProjects] = useState<DeployedProject[]>([]);

  useEffect(() => {
    const loadProjects = () => {
      try {
        const raw = localStorage.getItem(DEPLOYED_PROJECTS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        setDeployedProjects(Array.isArray(parsed) ? parsed : []);
      } catch {
        setDeployedProjects([]);
      }
    };

    loadProjects();
    window.addEventListener('cloudops:deployed-projects-updated', loadProjects as EventListener);
    window.addEventListener('storage', loadProjects);

    return () => {
      window.removeEventListener('cloudops:deployed-projects-updated', loadProjects as EventListener);
      window.removeEventListener('storage', loadProjects);
    };
  }, []);

  return (
    <>
      <main className="space-y-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">Live Projects</h1>
            <p className="text-text-secondary text-lg">Only deployed repositories are shown here.</p>
          </motion.div>

          {deployedProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {deployedProjects.map((project) => (
                <DeployedProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-secondary px-6 py-8 text-center text-text-secondary">
              No live project.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
