import { motion } from 'framer-motion';
import { ArrowRight, Check, Cloud, GitBranch, Github, Layers3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const stages = [
  { name: 'SOURCE', detail: 'GitHub · main', icon: Github, state: 'Connected' },
  { name: 'BUILD', detail: 'Container image', icon: Layers3, state: 'Passed' },
  { name: 'DEPLOY', detail: 'AWS · production', icon: Cloud, state: 'Live' },
];

export default function Hero() {
  const navigate = useNavigate();

  return (
    <section className="border-b border-border bg-background px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_0.92fr] lg:gap-16">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            <span className="h-2 w-2 bg-success" aria-hidden />
            Cloud deployments, minus the busywork
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="max-w-2xl font-display text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl"
          >
            Push to main.
            <span className="block text-primary">Go live.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
          >
            Ship from GitHub to AWS or Azure, then follow every build, deployment, and live service from one clear control room.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Button size="lg" className="gap-2" onClick={() => navigate('/login')}>
              <Github className="h-4 w-4" />
              Connect GitHub
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/docs')}>
              Explore the docs
            </Button>
          </motion.div>

          <p className="mt-6 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" aria-hidden />
            One workflow for AWS and Azure
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border border-border bg-card"
          aria-label="Example deployment pipeline from GitHub to production"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">
                DEPLOYMENT PIPELINE
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">web-app / production</p>
            </div>
            <span className="flex items-center gap-2 border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-success">
              <span className="h-1.5 w-1.5 bg-success" aria-hidden />
              Live
            </span>
          </div>

          <div className="divide-y divide-border">
            {stages.map(({ name, detail, icon: Icon, state }, index) => (
              <div key={name} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center border border-border bg-secondary text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
                    {name}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">{detail}</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {state}
                </span>
                {index < stages.length - 1 && (
                  <span className="sr-only">Next pipeline stage</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-border bg-secondary/60 px-5 py-3 font-mono text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>commit 8d3f2a1 · main</span>
            <span>deployed in 42s</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
