import { createRoot } from 'react-dom/client';
import App from './App.js';
import { bootstrapClientAuthentication } from './client-authentication.js';
import './globals.css';

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
