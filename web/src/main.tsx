import { createRoot } from 'react-dom/client';
import App from './App.js';
import { bootstrapLaunchAuthentication } from './launch-authentication.js';
import './globals.css';

const root = createRoot(document.getElementById('root')!);

void bootstrapLaunchAuthentication().then(() => {
  root.render(<App />);
}).catch((error: unknown) => {
  console.error('Failed to authenticate this Pulsete browser session', error);
  root.render(
    <main role="alert">
      Pulsete could not authenticate this browser session. Restart Pulsete and
      open the newest one-time local link.
    </main>,
  );
});
