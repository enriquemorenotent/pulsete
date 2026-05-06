import type { MemoryDiagnosticsSample } from './memory-sampler.js';
import {
  getSampleHeapUsed,
  getSampleNativeBytes,
  getSampleServerHeapUsed,
  memorySamplerIntervalMs,
} from './memory-sampler.js';

type MemoryDiagnosticsSamplerPanelProps = {
  samples: readonly MemoryDiagnosticsSample[];
  sampling: boolean;
  samplingPending: boolean;
};

export function MemoryDiagnosticsSamplerPanel(
  props: MemoryDiagnosticsSamplerPanelProps,
) {
  const first = props.samples[0] ?? null;
  const last = props.samples.at(-1) ?? null;
  return (
    <section className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          Sampler
        </div>
        <div className="text-xs text-muted-foreground">
          {props.sampling
            ? `${formatSeconds(memorySamplerIntervalMs)} interval${props.samplingPending ? ', capturing' : ''}`
            : 'Stopped'}
        </div>
      </div>

      {first && last ? (
        <div className="mb-3 grid gap-2 text-xs sm:grid-cols-3">
          <SampleDelta label="JS heap" value={formatDeltaBytes(getSampleHeapUsed(first), getSampleHeapUsed(last))} />
          <SampleDelta label="Native browser" value={formatDeltaBytes(getSampleNativeBytes(first), getSampleNativeBytes(last))} />
          <SampleDelta label="Server heap" value={formatDeltaBytes(getSampleServerHeapUsed(first), getSampleServerHeapUsed(last))} />
          <SampleDelta label="Messages" value={formatDelta(last.appState.messages - first.appState.messages)} />
          <SampleDelta label="Actions" value={formatDelta(last.activity.dispatches - first.activity.dispatches)} />
          <SampleDelta label="Websocket messages" value={formatDelta(last.activity.websocketMessages - first.activity.websocketMessages)} />
          <SampleDelta label="Websocket payload" value={formatDeltaBytesValue(last.activity.websocketPayloadBytes - first.activity.websocketPayloadBytes)} />
          <SampleDelta label="Render commits" value={formatDelta(last.activity.renderCommits - first.activity.renderCommits)} />
          <SampleDelta label="DOM nodes" value={formatNullableDelta(first.dom.nodes, last.dom.nodes)} />
          <SampleDelta label="Transcript rows" value={formatNullableDelta(first.activity.transcript?.rows ?? null, last.activity.transcript?.rows ?? null)} />
        </div>
      ) : (
        <div className="mb-3 text-sm text-muted-foreground">
          Start sampling to capture growth and activity every {formatSeconds(memorySamplerIntervalMs)}.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[50rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-white/8">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 text-right font-medium">Time</th>
              <th className="py-2 pr-3 text-right font-medium">JS Heap</th>
              <th className="py-2 pr-3 text-right font-medium">Native</th>
              <th className="py-2 pr-3 text-right font-medium">Actions</th>
              <th className="py-2 pr-3 text-right font-medium">WS</th>
              <th className="py-2 pr-3 text-right font-medium">Renders</th>
              <th className="py-2 pr-3 text-right font-medium">Rows</th>
            </tr>
          </thead>
          <tbody>
            {props.samples.slice(-12).map((sample) => (
              <tr key={sample.index} className="border-b border-white/[0.045]">
                <td className="py-2 pr-3 tabular-nums">{sample.index}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatSeconds(sample.elapsedMs)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMaybeBytes(getSampleHeapUsed(sample))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMaybeBytes(getSampleNativeBytes(sample))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInteger(sample.activity.dispatches)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInteger(sample.activity.websocketMessages)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInteger(sample.activity.renderCommits)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInteger(sample.activity.transcript?.rows ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SampleDelta(props: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 rounded-md bg-black/15 px-2 py-1">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-mono text-foreground">{props.value}</span>
    </div>
  );
}

const formatDeltaBytes = (start: number | null, end: number | null) =>
  start === null || end === null ? 'Unavailable' : formatDeltaBytesValue(end - start);

const formatDeltaBytesValue = (value: number) =>
  `${value >= 0 ? '+' : '-'}${formatBytes(Math.abs(value))}`;

const formatNullableDelta = (start: number | null, end: number | null) =>
  start === null || end === null ? 'Unavailable' : formatDelta(end - start);

const formatDelta = (value: number) =>
  `${value >= 0 ? '+' : ''}${formatInteger(value)}`;

const formatMaybeBytes = (value: number | null) =>
  value === null ? 'Unavailable' : formatBytes(value);

const formatSeconds = (ms: number) =>
  `${Math.round(ms / 100) / 10}s`;

const formatInteger = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

const formatBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};
