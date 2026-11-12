import React from 'react';
import Skeleton from './Skeleton';

const DeploymentLogsSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 ">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-success bg-secondary p-4 font-jetbrains">
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  );
};

export default DeploymentLogsSkeleton;
