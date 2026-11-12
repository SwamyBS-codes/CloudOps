import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, FileCode2, Terminal, X } from 'lucide-react';
import { deploymentService } from '../../services/deployment-service';

type DeployWizardProps = {
  repoName: string;
  repoOwner: string;
  onClose: () => void;
};

export default function DeployWizardModal({ repoName, repoOwner, onClose }: DeployWizardProps) {
  const [step, setStep] = useState<'cloning' | 'env' | 'dockerfile' | 'saving' | 'done'>('cloning');
  const [clonePath, setClonePath] = useState('');
  const [hasDockerfile, setHasDockerfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form States
  const [envPath, setEnvPath] = useState('.env');
  const [envContent, setEnvContent] = useState('');
  const [dockerfileContent, setDockerfileContent] = useState('');

  // Step 1: Clone immediately on mount
  useEffect(() => {
    const startClone = async () => {
      try {
        const result = await deploymentService.initDeploy(repoName, repoOwner);
        setClonePath(result.clonePath);
        setHasDockerfile(result.hasDockerfile);
        setStep('env'); // Move to env setup after cloning
      } catch (err: any) {
        setError(err.message);
      }
    };
    startClone();
  }, [repoName, repoOwner]);

  const handleNextFromEnv = () => {
    if (!hasDockerfile) {
      setStep('dockerfile');
    } else {
      handleSaveAll();
    }
  };

  const handleSaveAll = async () => {
    setStep('saving');
    try {
      await deploymentService.saveFiles({
        clonePath,
        envPath,
        envContent,
        dockerfileContent: !hasDockerfile ? dockerfileContent : undefined
      });
      setStep('done');
    } catch (err: any) {
      setError(err.message);
      setStep('env'); // Go back on error
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary  p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-secondary">
          <h2 className="text-lg font-semibold text-foreground">Deploying {repoName}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* STATE: CLONING OR SAVING */}
          {(step === 'cloning' || step === 'saving') && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-foreground text-lg">
                {step === 'cloning' ? 'Cloning repository from GitHub...' : 'Configuring files...'}
              </p>
              <p className="text-foreground/40 text-sm mt-2">This will only take a moment.</p>
            </div>
          )}

          {/* STATE: ENV SETUP */}
          {step === 'env' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="w-5 h-5 text-primary" />
                <h3 className="text-md font-medium text-foreground">Environment Variables</h3>
              </div>
              <p className="text-muted-foreground text-sm mb-4">Provide any environment variables required by your application. Leave blank if none are needed.</p>
              
              <div className="mb-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1">File Path (e.g., .env or server/.env)</label>
                <input 
                  type="text" value={envPath} onChange={(e) => setEnvPath(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg p-2 text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-medium text-muted-foreground mb-1">.env Content</label>
                <textarea 
                  value={envContent} onChange={(e) => setEnvContent(e.target.value)}
                  placeholder={"PORT=8080\nDB_URL=mongodb://..."}
                  className="w-full h-40 bg-secondary border border-border rounded-lg p-3 text-foreground font-mono text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end">
                <button onClick={handleNextFromEnv} className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition">
                  {hasDockerfile ? 'Save & Continue' : 'Next Step'}
                </button>
              </div>
            </motion.div>
          )}

          {/* STATE: DOCKERFILE SETUP */}
          {step === 'dockerfile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-2 mb-4">
                <FileCode2 className="w-5 h-5 text-yellow-400" />
                <h3 className="text-md font-medium text-foreground">Missing Dockerfile Detected</h3>
              </div>
              <p className="text-muted-foreground text-sm mb-4">We couldn't find a Dockerfile in your repository root. CloudOps requires one to build your app. Paste your Docker configuration below.</p>
              
              <div className="mb-6">
                <textarea 
                  value={dockerfileContent} onChange={(e) => setDockerfileContent(e.target.value)}
                  placeholder={"FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD [\"npm\", \"start\"]"}
                  className="w-full h-48 bg-secondary border border-border rounded-lg p-3 text-foreground font-mono text-sm focus:outline-none focus:border-yellow-500/50"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setStep('env')} className="bg-secondary text-foreground px-4 py-2 rounded-lg font-medium hover:bg-secondary transition">Back</button>
                <button onClick={handleSaveAll} disabled={!dockerfileContent.trim()} className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50">
                  Save & Prepare Build
                </button>
              </div>
            </motion.div>
          )}

          {/* STATE: DONE */}
          {step === 'done' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
              <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
              <h3 className="text-xl font-bold text-foreground mb-2">Configuration Complete!</h3>
              <p className="text-muted-foreground mb-6">Your environment files and Dockerfile are ready. The deployment engine is primed.</p>
              <button onClick={onClose} className="bg-primary text-black font-bold px-6 py-2 rounded-lg hover:bg-primary/90 transition">
                Close Wizard
              </button>
            </motion.div>
          )}

        </div>
      </motion.div>
    </div>
  );
}