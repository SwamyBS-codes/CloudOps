import React, { useEffect, useRef } from 'react';

type Props = {
  logs: string[];
};

const TerminalStream: React.FC<Props> = ({ logs }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="terminal-shell font-jetbrains text-sm" style={{ maxHeight: 320, overflow: 'auto' }} ref={ref}>
      <div className="text-xs text-muted-foreground mb-2">Live logs</div>
      <div>
        {logs.map((ln, idx) => (
          <div key={idx} className="terminal-line text-[13px] text-foreground leading-[1.35]">{ln}</div>
        ))}
      </div>
    </div>
  );
};

export default TerminalStream;
