import React from 'react';
import { Copy, RotateCw, ExternalLink } from 'lucide-react';

const DeployControls: React.FC<{
  liveUrl: string;
  onCopy?: () => void;
  onRestart?: () => void;
}> = ({ liveUrl, onCopy, onRestart }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      onCopy && onCopy();
    } catch (e) {
      // noop
    }
  };

  return (
    <div className="flex items-center gap-3">
      <a href={liveUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-secondary hover:bg-secondary">
        <ExternalLink className="w-4 h-4" />
        <span className="truncate max-w-[220px]">{liveUrl}</span>
      </a>

      <button onClick={handleCopy} className="p-2 rounded-md copy-btn hover:bg-secondary" aria-label="Copy URL">
        <Copy className="w-4 h-4 text-foreground" />
      </button>

      <button onClick={onRestart} className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 hover:bg-destructive/90 text-destructive hover:text-destructive-foreground">
        <RotateCw className="w-4 h-4" />
        Restart
      </button>
    </div>
  );
};

export default DeployControls;
