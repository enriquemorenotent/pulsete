import { useEffect, useState } from 'react';

export const useDocumentActivityState = () => {
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  const [windowFocused, setWindowFocused] = useState(() =>
    typeof document === 'undefined' ? true : document.hasFocus(),
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const handleVisibilityChange = () =>
      setDocumentVisible(document.visibilityState === 'visible');
    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return { documentVisible, windowFocused };
};
