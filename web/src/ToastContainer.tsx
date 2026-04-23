import { selectBanner } from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import { Toast } from './Toast.js';

export function ToastContainer() {
  const banner = useAppSelector(selectBanner);
  const dispatch = useAppDispatch();

  return (
    <Toast
      banner={banner}
      onDismiss={() => dispatch({ type: 'set-banner', banner: null })}
    />
  );
}
