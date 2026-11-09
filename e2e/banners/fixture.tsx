import { useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { initialState, reducer } from '../../web/src/app-state.js';
import { gatewayReconnectBannerOptions, gatewayReconnectMessage } from '../../web/src/gateway.js';
import { useBannerDismissal } from '../../web/src/useBannerDismissal.js';
import { Toast } from '../../web/src/Toast.js';
import '../../web/src/globals.css';

function Fixture() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const banner = state.transient.banner;
  useBannerDismissal(banner, dispatch);
  return <main className="flex flex-col gap-4 p-8">
    <h1>Notification regression fixture</h1>
    <button onClick={() => dispatch({ type: 'set-banner', banner: { kind: 'notice', message: gatewayReconnectMessage } })}>Timed notification</button>
    <button onClick={() => dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Connection interrupted; trying again.', ...gatewayReconnectBannerOptions } })}>Persistent notification</button>
    <button onClick={() => dispatch({ type: 'gateway-connected' })}>Reconnect</button>
    <Toast banner={banner} onDismiss={() => dispatch({ type: 'set-banner', banner: null })} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
