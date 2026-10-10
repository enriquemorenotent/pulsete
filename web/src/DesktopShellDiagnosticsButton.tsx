import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button.js';

type DesktopShellDiagnosticsButtonProps = {
  onDownloadDiagnostics: () => void;
};

export function DesktopShellDiagnosticsButton(props: DesktopShellDiagnosticsButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-10"
      aria-label="Capture memory diagnostics"
      title="Capture memory diagnostics"
      onClick={props.onDownloadDiagnostics}
    >
      <Bug />
      <span>Diagnostics</span>
    </Button>
  );
}
