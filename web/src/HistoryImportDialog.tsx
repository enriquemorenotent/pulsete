import { type DragEvent, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  historyImportFileLimit,
  type BufferHistoryImportRequest,
  type HistoryImportTextFile,
} from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { cn } from '@/lib/utils.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { historyImportFileInputAccept, prepareHistoryImportFiles } from './history-import-files.js';
import { hasDroppedFiles, listDroppedFiles } from './text-file-attachments.js';

type HistoryImportDialogProps = {
  open: boolean;
  targetLabel: string;
  onClose: () => void;
  onImport: (input: BufferHistoryImportRequest) => Promise<boolean>;
};

export function HistoryImportDialog(props: HistoryImportDialogProps) {
  const [files, setFiles] = useState<HistoryImportTextFile[]>([]);
  const [selfNickText, setSelfNickText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropDepthRef = useRef(0);

  useEffect(() => {
    if (props.open) {
      return;
    }
    setFiles([]);
    setSelfNickText('');
    setError(null);
    setSubmitting(false);
    setDropActive(false);
    dropDepthRef.current = 0;
  }, [props.open]);

  const addFiles = async (incoming: File[]) => {
    if (incoming.length === 0) {
      return;
    }
    try {
      const prepared = await prepareHistoryImportFiles(incoming, files.length);
      setFiles((current) => [...current, ...prepared]);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to read log files.');
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (submitting || !hasDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dropDepthRef.current += 1;
    setDropActive(true);
    setError(null);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = submitting ? 'none' : 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) {
      setDropActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dropDepthRef.current = 0;
    setDropActive(false);
    if (submitting) {
      return;
    }
    void addFiles(listDroppedFiles(event.dataTransfer));
  };

  const handleImport = async () => {
    if (files.length === 0 || submitting) {
      return;
    }
    setSubmitting(true);
    const imported = await props.onImport({
      files,
      selfNicks: parseCommaSeparatedNicks(selfNickText),
    });
    setSubmitting(false);
    if (imported) {
      props.onClose();
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && !submitting && props.onClose()}>
      <DialogContent className="w-[min(calc(100vw-1rem),32rem)]">
        <DialogHeader>
          <DialogTitle>Import logs</DialogTitle>
          <DialogDescription>
            Import HexChat text logs into {props.targetLabel}. Attach up to {historyImportFileLimit} files.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept={historyImportFileInputAccept}
          onChange={async (event) => {
            const selectedFiles = event.currentTarget.files;
            event.currentTarget.value = '';
            if (!selectedFiles || selectedFiles.length === 0) {
              return;
            }
            await addFiles(Array.from(selectedFiles));
          }}
        />

        <div
          className={cn(
            'space-y-3 rounded-lg border border-dashed p-3 transition-colors',
            dropActive ? 'border-primary bg-primary/5' : 'border-border'
          )}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              type="button"
              disabled={submitting}
              onClick={() => {
                setError(null);
                fileInputRef.current?.click();
              }}
            >
              Add files
            </Button>
            <p className="text-[12px] text-muted-foreground">
              Text logs only. HexChat format is supported in v1.
            </p>
          </div>

          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {files.map((file) => (
                <div
                  key={`${file.name}:${file.size}`}
                  className="flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    className="text-muted-foreground transition hover:text-foreground"
                    disabled={submitting}
                    onClick={() => {
                      setFiles((current) => current.filter((entry) => entry !== file));
                      setError(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                'rounded-md border border-dashed px-3 py-4 text-[13px] text-muted-foreground transition-colors',
                dropActive ? 'border-primary bg-primary/5 text-foreground' : 'border-border'
              )}
            >
              {dropActive ? 'Drop log files to attach.' : 'Drag log files here or use Add files.'}
            </div>
          )}

          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        </div>

        <div className="space-y-2">
          <label className="block text-[12px] font-medium text-foreground" htmlFor="history-import-self-nicks">
            Old self nicks
            <span className="ml-1 text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="history-import-self-nicks"
            value={selfNickText}
            disabled={submitting}
            placeholder="comma-separated, e.g. oldnick, oldnick_"
            onChange={(event) => setSelfNickText(event.target.value)}
          />
          <p className="text-[12px] text-muted-foreground">
            Useful for old logs from before a nick change. Configured alt nicks are included automatically.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" disabled={submitting} onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={files.length === 0 || submitting} onClick={handleImport}>
            {submitting ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const parseCommaSeparatedNicks = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
