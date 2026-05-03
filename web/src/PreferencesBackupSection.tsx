import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button.js';

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

  const runTask = async (task: BackupTask, action: () => Promise<void>) => {
    setBusyTask(task);
    setMessage(null);
    try {
      await action();
      setMessage({
        kind: 'notice',
        text: task === 'export' ? 'Backup exported.' : 'Backup imported. Reloading...',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Backup action failed',
      });
    } finally {
      setBusyTask(null);
    }
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    void runTask('import', () => props.onImportBackup(file));
  };

  return (
    <section className="space-y-4">
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
              disabled={busyTask !== null}
              onClick={() => void runTask('export', props.onExportBackup)}
            >
              <Download />
              {busyTask === 'export' ? 'Exporting' : 'Export Backup'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busyTask !== null}
              onClick={() => inputRef.current?.click()}
            >
              <Upload />
              {busyTask === 'import' ? 'Importing' : 'Import Backup'}
            </Button>
          </div>
        </div>
        {message ? (
          <p className={message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
            {message.text}
          </p>
        ) : null}
      </div>

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
