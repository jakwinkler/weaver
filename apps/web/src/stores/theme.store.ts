import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  init: () => void;
}

function getEffective(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const effective = getEffective(theme);
  document.documentElement.classList.toggle('dark', effective === 'dark');
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('weaver-theme') as Theme) || 'system',

  setTheme: (theme: Theme) => {
    localStorage.setItem('weaver-theme', theme);
    applyTheme(theme);
    set({ theme });
  },

  init: () => {
    const theme = get().theme;
    applyTheme(theme);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (get().theme === 'system') {
        applyTheme('system');
      }
    });
  },
}));
