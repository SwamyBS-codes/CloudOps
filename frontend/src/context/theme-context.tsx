import React, { createContext, useContext, useEffect } from 'react';

interface ThemeContextType {
  theme: 'dark';
  setTheme: (theme: 'dark') => void;
  isDark: true;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  isDark: true,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => document.documentElement.classList.add('dark'), []);
  return <ThemeContext.Provider value={{ theme: 'dark', setTheme: () => {}, isDark: true }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
