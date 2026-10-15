import { useRef, useState, type ChangeEvent } from 'react';
import { Download, LoaderCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog.js';

type PreferencesBackupSectionProps = {
  onExportBackup: () => Promise<void>;
  onImportBackup: (file: Blob) => Promise<void>;
};

type BackupTask = 'export' | 'import';

type BackupMessage = {
  kind: 'notice' | 'error';
  text: string;
};

export function PreferencesBackupSection(props: PreferencesBackupSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busyTask, setBusyTask] = useState<BackupTask | null>(null);
  const [message, setMessage] = useState<BackupMessage | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const taskRunning = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const runTask = async (task: BackupTask, action: () => Promise<void>) => {
    if (taskRunning.current) return;
    taskRunning.current = true;
    setBusyTask(task);
    setMessage(null);
    try {
      await action();
      setMessage({
        kind: 'notice',
        text: task === 'export'
          ? 'Download started. Check your Downloads folder or save dialog.'
          : 'Backup imported. Reloading...',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Backup action failed',
      });
    } finally {
      taskRunning.current = false;
      setBusyTask(null);
    }
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    setMessage(null);
    if (file.size === 0 || file.size > 512 * 1024 * 1024) {
      setMessage({ kind: 'error', text: file.size === 0
        ? 'This file is empty. Choose a Pulsete backup.'
        : 'This backup exceeds the 512 MB import limit.' });
      return;
    }
    setPendingImport(file);
  };

  return (
    <section className="space-y-4" aria-busy={busyTask !== null}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Backup & Restore
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Export or replace all local Pulsete data, including chat history and saved account passwords.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="flex flex-col gap-3 rounded-md border border-white/6 bg-black/14 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Full backup</p>
            <p className="text-muted-foreground">
              Backup files are plain files. Store them somewhere private.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busyTask !== null || pendingImport !== null}
              onClick={() => void runTask('export', props.onExportBackup)}
            >
              <Download />
              {busyTask === 'export' ? 'Exporting' : 'Export Backup'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busyTask !== null || pendingImport !== null}
              onClick={() => inputRef.current?.click()}
            >
              <Upload />
              {busyTask === 'import' ? 'Importing' : 'Import Backup'}
            </Button>
          </div>
        </div>
        {message ? (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
            {message.text}
          </p>
        ) : null}
      </div>

      <Dialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}>
          <DialogTitle>Replace your current data?</DialogTitle>
          <DialogDescription>
            This replaces all saved networks, messages, settings, and passwords with the backup.
            It does not merge them. Active connections will disconnect and Pulsete will reload.
          </DialogDescription>
          <p className="break-all rounded-md bg-secondary p-3 text-sm">
            {pendingImport?.name}
            <span className="ml-2 text-muted-foreground">
              ({((pendingImport?.size ?? 0) / 1024 / 1024).toFixed(1)} MB)
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            A safety copy of your current data is kept in the app’s data folder under backups/pre-restore-….
            You can export a backup first if you want a copy you can easily import again.
          </p>
          <DialogFooter>
            <Button ref={cancelRef} variant="outline" onClick={() => setPendingImport(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              const file = pendingImport;
              setPendingImport(null);
              if (file) void runTask('import', () => props.onImportBackup(file));
            }}>Replace and import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={busyTask !== null}>
        <DialogContent className="sm:max-w-md" onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}>
          <DialogTitle>{busyTask === 'export' ? 'Preparing your backup' : 'Restoring your backup'}</DialogTitle>
          <DialogDescription>
            {busyTask === 'export'
              ? 'The download will start when your backup is ready.'
              : 'Checking the file and restoring your data. Pulsete will reload when finished.'}
            {' '}Large histories may take a while. Keep Pulsete open.
          </DialogDescription>
          <div role="status" className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            {busyTask === 'export' ? 'Preparing backup…' : 'Import in progress…'}
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={inputRef}
        type="file"
        accept=".pulsete-backup,application/octet-stream,application/gzip"
        className="hidden"
        onChange={handleImport}
      />
    </section>
  );
}
