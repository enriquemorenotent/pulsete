import { memo, useMemo, useState } from 'react';
import type { ActivityCell } from '../../shared/watchlist-activity-statistics.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const activityHour = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;
const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;

export function WatchlistActivityHeatmap({ cells }: { cells: ActivityCell[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? selected;
  const descriptions = useMemo(() => cells.map((cell, index) => {
    const label = `${days[Math.floor(index / 24)]}, ${activityHour(index % 24)}–${activityHour(index % 24 + 1)}`;
    if (!cell.observedMs) return `${label}: no observations`;
    const percent = Math.round(cell.connectedMs / cell.observedMs * 100);
    return `${label}: connected ${percent}% of ${minutes(cell.observedMs)} observed; away for ${minutes(cell.awayMs)}`;
  }), [cells]);
  return (
    <div>
      <ActivityGrid cells={cells} descriptions={descriptions} selected={selected} onHover={setHovered} onSelect={setSelected} />
      <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
        <span>Striped = unknown</span>
        <span className="flex items-center gap-2">Connected 0% <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(to right, #253342, #34d399)' }} /> 100%</span>
      </div>
      <p className="mt-4 min-h-8 text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        {active === null ? 'Select or hover over an hour to see its observations. Away counts as connected.' : descriptions[active]}
      </p>
    </div>
  );
}

// Hover only changes the detail text; the 168 slots stay unchanged.
const ActivityGrid = memo(function ActivityGrid({ cells, descriptions, selected, onHover, onSelect }: {
  cells: ActivityCell[];
  descriptions: string[];
  selected: number | null;
  onHover(index: number | null): void;
  onSelect(index: number): void;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: '4rem repeat(24, minmax(0, 1fr))' }}>
      <span />
      {Array.from({ length: 24 }, (_, hour) => <span key={hour} className="pb-1 text-center font-mono text-[10px] text-muted-foreground">{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</span>)}
      {days.map((day, dayIndex) => <div key={day} className="contents">
        <span className="self-center text-xs text-muted-foreground">{day.slice(0, 3)}</span>
        {cells.slice(dayIndex * 24, dayIndex * 24 + 24).map((cell, hour) => {
          const index = dayIndex * 24 + hour;
          const ratio = cell.observedMs ? cell.connectedMs / cell.observedMs : 0;
          return <button type="button" key={hour}
            className="watchlist-activity-cell h-6 rounded-[4px] border border-white/10"
            style={{ background: cell.observedMs
              ? `color-mix(in srgb, #34d399 ${Math.round(ratio * 85)}%, #253342)`
              : 'repeating-linear-gradient(135deg, transparent, transparent 3px, #ffffff08 3px, #ffffff08 4px)' }}
            aria-label={descriptions[index]} aria-pressed={selected === index} title={descriptions[index]}
            onMouseEnter={() => onHover(index)} onMouseLeave={() => onHover(null)}
            onFocus={() => onSelect(index)} onClick={() => onSelect(index)} />;
        })}
      </div>)}
    </div>
  );
});
