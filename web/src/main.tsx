/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { bootstrapClientAuthentication } from './client-authentication.js';
import './globals.css';
import { startDevelopmentPerformanceCleanup } from './client-development-performance.js';

if (import.meta.env.DEV && import.meta.env.VITE_RETAIN_REACT_TIMINGS !== '1') {
  const stopCleanup = startDevelopmentPerformanceCleanup(performance, window);
  import.meta.hot?.dispose(stopCleanup);
}

const root = createRoot(document.getElementById('root')!);

void bootstrapClientAuthentication().then(() => {
  root.render(<App />);
}).catch(() => {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
      <p>Pulsete must be opened from the running application.</p>
    </main>,
  );
});
