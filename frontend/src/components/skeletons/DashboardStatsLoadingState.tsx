import React from 'react';
import Skeleton from './Skeleton';

const DashboardStatsLoadingState: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="rounded-2xl border border-border bg-card p-5  ">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-20" />
            </div>
            <Skeleton className="h-12 w-12 rounded-xl" />
          </div>
          <Skeleton className="mt-5 h-3 w-32" />
        </div>
      ))}
    </div>
  );
};

export default DashboardStatsLoadingState;
