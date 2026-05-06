import { Activity, Clipboard, RefreshCw, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { MemoryDiagnosticsSamplerPanel } from './MemoryDiagnosticsSamplerPanel.js';
import type {
  MemoryDiagnosticsReport,
  MemoryDiagnosticsSample,
} from './memory-sampler.js';

type MemoryDiagnosticsDialogProps = {
  copyStatus: 'copied' | 'failed' | 'idle';
  loading: boolean;
  open: boolean;
  report: MemoryDiagnosticsReport | null;
  samples: readonly MemoryDiagnosticsSample[];
  sampling: boolean;
  samplingPending: boolean;
  serverError: string | null;
  onClose: () => void;
  onCopy: () => void;
  onLog: () => void;
  onRefresh: () => void;
  onStartSampling: () => void;
  onStopSampling: () => void;
};

export function MemoryDiagnosticsDialog(props: MemoryDiagnosticsDialogProps) {
  const report = props.report;
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(84dvh,48rem)] max-h-[84dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),58rem)]">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 space-y-1 border-b border-white/6 px-4 py-4">
            <DialogTitle>Memory Diagnostics</DialogTitle>
            <DialogDescription>
              Snapshot of browser heap, retained app state, DOM size, and server runtime memory.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {report ? (
              <div className="space-y-4">
                <Overview report={report} serverError={props.serverError} />
                <MemoryDiagnosticsSamplerPanel
                  samples={props.samples}
                  sampling={props.sampling}
                  samplingPending={props.samplingPending}
                />
                <LargestConversations report={report} />
              </div>
            ) : (
              <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-8 text-center text-sm text-muted-foreground">
                {props.loading ? 'Capturing memory diagnostics...' : 'No snapshot captured yet.'}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-white/6 px-4 py-3">
            <div className="mr-auto text-xs text-muted-foreground">
              {report ? `Captured ${new Date(report.capturedAt).toLocaleTimeString()}` : null}
            </div>
            <Button variant="outline" onClick={props.onLog} disabled={!report}>
              <Terminal />
              Log
            </Button>
            <Button variant="outline" onClick={props.onCopy} disabled={!report}>
              <Clipboard />
              {props.copyStatus === 'copied' ? 'Copied' : props.copyStatus === 'failed' ? 'Copy Failed' : 'Copy JSON'}
            </Button>
            <Button variant="secondary" onClick={props.onRefresh} disabled={props.loading}>
              <RefreshCw />
              {props.loading ? 'Refreshing' : 'Refresh'}
            </Button>
            <Button
              variant={props.sampling ? 'outline' : 'default'}
              onClick={props.sampling ? props.onStopSampling : props.onStartSampling}
            >
              <Activity />
              {props.sampling ? 'Stop Sampling' : 'Start Sampling'}
            </Button>
            <Button variant="outline" onClick={props.onClose}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Overview(props: {
  report: MemoryDiagnosticsReport;
  serverError: string | null;
}) {
  const { appState, browserHeap, dom, server } = props.report;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Section title="Client App State" icon={<Activity className="size-3.5" />}>
        <Metric label="Messages" value={formatInteger(appState.messages)} />
        <Metric label="Message buckets" value={formatInteger(appState.messageBuckets)} />
        <Metric label="Buckets at cap" value={formatInteger(appState.messagesAtRetainedLimit)} />
        <Metric label="Retained text" value={formatBytes(appState.retainedMessageTextBytes)} />
        <Metric label="Buffers" value={formatInteger(appState.buffers)} />
        <Metric label="Channels" value={formatInteger(appState.channels)} />
        <Metric label="Channel users" value={formatInteger(appState.channelUsers)} />
        <Metric label="Channel list entries" value={formatInteger(appState.channelListEntries)} />
        <Metric label="DOM elements" value={formatInteger(dom.elements)} />
        <Metric label="DOM nodes" value={dom.nodes === null ? 'Unavailable' : formatInteger(dom.nodes)} />
        <Metric label="Images" value={formatInteger(dom.images)} />
      </Section>

      <Section title="Heap And Runtime" icon={<Activity className="size-3.5" />}>
        {browserHeap.available ? (
          <>
            <Metric label="Browser heap used" value={formatBytes(browserHeap.usedJSHeapSize)} />
            <Metric label="Browser heap total" value={formatBytes(browserHeap.totalJSHeapSize)} />
            <Metric label="Browser heap limit" value={formatBytes(browserHeap.jsHeapSizeLimit)} />
          </>
        ) : (
          <Metric label="Browser heap" value={browserHeap.reason} />
        )}
        <Metric
          label="Native browser memory"
          value={
            props.report.browserNativeMemory.available
              ? formatBytes(props.report.browserNativeMemory.bytes)
              : props.report.browserNativeMemory.reason
          }
        />
        <Metric label="Actions" value={formatInteger(props.report.activity.dispatches)} />
        <Metric label="State changes" value={formatInteger(props.report.activity.stateChangingDispatches)} />
        <Metric label="Websocket messages" value={formatInteger(props.report.activity.websocketMessages)} />
        <Metric label="Websocket payload" value={formatBytes(props.report.activity.websocketPayloadBytes)} />
        <Metric label="Render commits" value={formatInteger(props.report.activity.renderCommits)} />
        <Metric label="Top action" value={formatTopCount(props.report.activity.actionCounts)} />
        <Metric label="Top websocket" value={formatTopCount(props.report.activity.websocketMessageCounts)} />
        <Metric label="Top render" value={formatTopCount(props.report.activity.renderCommitCounts)} />
        <Metric
          label="Transcript rows"
          value={props.report.activity.transcript
            ? formatInteger(props.report.activity.transcript.rows)
            : 'Unavailable'}
        />
        {server ? (
          <>
            <Metric label="Server RSS" value={formatBytes(server.process.rss)} />
            <Metric label="Server heap used" value={formatBytes(server.process.heapUsed)} />
            <Metric label="Server heap total" value={formatBytes(server.process.heapTotal)} />
            <Metric label="Server external" value={formatBytes(server.process.external)} />
            <Metric label="Websocket clients" value={formatInteger(server.runtime.websocketClients)} />
            <Metric label="Active IRC connections" value={formatInteger(server.runtime.activeConnections)} />
            <Metric label="Runtime buffers" value={formatInteger(server.runtime.buffers)} />
            <Metric label="Runtime channel users" value={formatInteger(server.runtime.channelUsers)} />
          </>
        ) : (
          <Metric label="Server snapshot" value={props.serverError ?? 'Loading...'} />
        )}
      </Section>
    </div>
  );
}

function LargestConversations(props: { report: MemoryDiagnosticsReport }) {
  return (
    <Section title="Largest Conversations" icon={<Activity className="size-3.5" />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-white/8">
              <th className="py-2 pr-3 font-medium">Target</th>
              <th className="py-2 pr-3 font-medium">Kind</th>
              <th className="py-2 pr-3 text-right font-medium">Messages</th>
              <th className="py-2 pr-3 text-right font-medium">Text</th>
              <th className="py-2 pr-3 font-medium">Buffer</th>
            </tr>
          </thead>
          <tbody>
            {props.report.largestConversations.map((conversation) => (
              <tr key={conversation.bufferId} className="border-b border-white/[0.045]">
                <td className="max-w-48 truncate py-2 pr-3 text-foreground">{conversation.target}</td>
                <td className="py-2 pr-3 text-muted-foreground">{conversation.kind ?? 'unknown'}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInteger(conversation.messages)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatBytes(conversation.textBytes)}</td>
                <td className="max-w-56 truncate py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                  {conversation.bufferId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Section(props: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {props.icon}
        {props.title}
      </div>
      <div className="space-y-1">{props.children}</div>
    </section>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="max-w-[65%] truncate font-mono text-xs text-foreground">{props.value}</span>
    </div>
  );
}

const formatInteger = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unavailable';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatTopCount = (counts: Record<string, number>) => {
  const [name, count] = Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .at(0) ?? [];
  return name ? `${name} (${formatInteger(count ?? 0)})` : 'None';
};
