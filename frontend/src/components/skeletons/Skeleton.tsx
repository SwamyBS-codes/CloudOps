import React from 'react';

const Skeleton: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className = '', style }) => {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-secondary before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
};

export default Skeleton;
