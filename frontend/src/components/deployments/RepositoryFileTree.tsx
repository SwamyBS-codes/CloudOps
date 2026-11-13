import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, File, Folder, FolderOpen, Target } from 'lucide-react';
import type { FileNode } from '@/services/deployment-service';

type Props = {
  fileTree: FileNode[];
  rootDirectory: string;
  onSelectRoot: (path: string) => void;
};

const normalizePath = (path: string) => path.replace(/^\.\//, '').replace(/\/$/, '') || '.';

export default function RepositoryFileTree({ fileTree, rootDirectory, onSelectRoot }: Props) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    new Set(fileTree.filter((node) => node.type === 'directory').map((node) => node.name))
  );
  const selectedPath = normalizePath(rootDirectory);

  const toggleDirectory = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNodes = (nodes: FileNode[], parentPath = '', depth = 0) => (
    <ul className="space-y-0.5" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((node) => {
        const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        const isDirectory = node.type === 'directory';
        const isExpanded = expandedPaths.has(nodePath);
        const isSelected = selectedPath === normalizePath(nodePath);

        return (
          <li key={nodePath} role="treeitem" aria-expanded={isDirectory ? isExpanded : undefined}>
            <div
              className={`group/entry flex min-w-0 items-center gap-1 border px-1 py-1 ${
                isSelected ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-transparent hover:bg-white/[0.035]'
              }`}
              style={{ paddingLeft: `${depth * 14 + 4}px` }}
            >
              {isDirectory ? (
                <button
                  type="button"
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
                  aria-expanded={isExpanded}
                  onClick={() => toggleDirectory(nodePath)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-neutral-500 hover:text-white"
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              {isDirectory
                ? <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-neutral-400'}`} />
                : <File className="h-3.5 w-3.5 shrink-0 text-neutral-600" />}
              <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${isSelected ? 'text-emerald-200' : isDirectory ? 'text-neutral-300' : 'text-neutral-500'}`}>
                {node.name}
              </span>
              {isDirectory && (
                <button
                  type="button"
                  title={isSelected ? `${nodePath} is the selected project root` : `Use ${nodePath} as project root`}
                  aria-label={isSelected ? `${nodePath} selected as project root` : `Use ${nodePath} as project root`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectRoot(`./${nodePath}`)}
                  className={`flex h-6 shrink-0 items-center gap-1 px-1.5 text-[9px] uppercase tracking-wide transition ${
                    isSelected ? 'text-emerald-300' : 'text-neutral-600 opacity-0 group-hover/entry:opacity-100 hover:text-white focus-visible:opacity-100'
                  }`}
                >
                  {isSelected ? <Check className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                  <span className="hidden sm:inline">{isSelected ? 'Root' : 'Set root'}</span>
                </button>
              )}
            </div>
            {isDirectory && isExpanded && node.children && node.children.length > 0 && (
              renderNodes(node.children, nodePath, depth + 1)
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border border-white/[0.07] bg-[#090909] px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Project root</span>
        </div>
        <code className="max-w-[55%] truncate font-mono text-[10px] text-emerald-300" title={rootDirectory}>
          {rootDirectory}
        </code>
      </div>
      <div className="max-h-64 overflow-auto border border-white/[0.07] bg-[#080808] p-2">
        <div className="mb-1 flex items-center gap-1">
          <span className="w-6 shrink-0" />
          <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${selectedPath === '.' ? 'text-emerald-200' : 'text-neutral-300'}`}>
            Repository root
          </span>
          <button
            type="button"
            aria-pressed={selectedPath === '.'}
            onClick={() => onSelectRoot('./')}
            className={`px-1.5 py-1 text-[9px] uppercase tracking-wide ${
              selectedPath === '.' ? 'text-emerald-300' : 'text-neutral-600 hover:text-white'
            }`}
          >
            {selectedPath === '.' ? 'Selected' : 'Set root'}
          </button>
        </div>
        {fileTree.length > 0 ? renderNodes(fileTree) : (
          <p className="px-2 py-3 text-xs text-neutral-500">Repository files will appear after cloning finishes.</p>
        )}
      </div>
      <p className="text-[10px] leading-4 text-neutral-600">
        Expand folders to browse. Choose <span className="text-neutral-400">Set root</span> to build from a folder.
      </p>
    </div>
  );
}
