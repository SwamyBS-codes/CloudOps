import React from 'react';
import Skeleton from './Skeleton';

const RepositoryCardSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl border border-border bg-card  p-4 ">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
};

export default RepositoryCardSkeleton;
