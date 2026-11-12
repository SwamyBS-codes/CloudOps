import React, { useEffect } from 'react';

export type Theme = 'dark';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return <>{children}</>;
};
