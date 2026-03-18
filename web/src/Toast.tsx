import type { Banner } from './app-types.js';

type ToastProps = {
  banner: Banner;
  onDismiss: () => void;
};

export function Toast({ banner, onDismiss }: ToastProps) {
  if (!banner) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <div className={`toast toast--${banner.kind}`}>
        <div className="toast__body">
          <strong className="toast__title">{banner.kind === 'error' ? 'Error' : 'Notice'}</strong>
          <span>{banner.message}</span>
        </div>
        <button className="toast__close" onClick={onDismiss} aria-label="Dismiss notification">
          ×
        </button>
      </div>
    </div>
  );
}
