import { DesktopShell } from './DesktopShell.js';
import { Toast } from './Toast.js';
import { useAppController } from './useAppController.js';

function App() {
  const controller = useAppController();

  if (controller.phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <DesktopShell {...controller.desktopShellProps} />
      <Toast banner={controller.banner} onDismiss={controller.dismissBanner} />
    </>
  );
}
export default App;
