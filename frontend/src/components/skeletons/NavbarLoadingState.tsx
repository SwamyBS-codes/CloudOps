import React from 'react';
import Skeleton from './Skeleton';

const NavbarLoadingState: React.FC = () => {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3  ">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-4 w-40 flex-1" />
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton className="h-10 w-28 rounded-xl" />
    </div>
  );
};

export default NavbarLoadingState;
