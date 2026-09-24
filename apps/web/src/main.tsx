import { AppErrorBoundary } from './components/AppErrorBoundary';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useThemeStore } from './stores/theme.store';
import { App } from './App';
import './app.css';

useThemeStore.getState().init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
