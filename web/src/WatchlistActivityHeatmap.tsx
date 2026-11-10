import { memo, useEffect, useMemo, useState } from 'react';
import type { ActivityCell } from '../../shared/watchlist-activity-statistics.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const activityHour = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;
const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;

const currentActivitySlot = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'long', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(Date.now());
  const day = days.indexOf(parts.find(part => part.type === 'weekday')!.value);
  const hour = Number(parts.find(part => part.type === 'hour')!.value);
  return day * 24 + hour;
};

export function WatchlistActivityHeatmap({ cells, timeZone }: { cells: ActivityCell[]; timeZone: string }) {
  const [currentSlot, setCurrentSlot] = useState(() => currentActivitySlot(timeZone));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      setCurrentSlot(currentActivitySlot(timeZone));
      timer = setTimeout(update, 60_000 - Date.now() % 60_000 + 20);
    };
    update();
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timeZone]);
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
      <ActivityGrid cells={cells} descriptions={descriptions} selected={selected} currentSlot={currentSlot} onHover={setHovered} onSelect={setSelected} />
      <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-4"><span>Striped = unknown</span><span className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm border-2 border-amber-300" />Current hour</span></span>
        <span className="flex items-center gap-2">Connected 0% <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(to right, #253342, #34d399)' }} /> 100%</span>
      </div>
      <p className="mt-4 min-h-8 text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        {active === null ? 'Select or hover over an hour to see its observations. Away counts as connected.' : descriptions[active]}
      </p>
    </div>
  );
}

// Hover only changes the detail text; the 168 slots stay unchanged.
const ActivityGrid = memo(function ActivityGrid({ cells, descriptions, selected, currentSlot, onHover, onSelect }: {
  cells: ActivityCell[];
  descriptions: string[];
  selected: number | null;
  currentSlot: number;
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
            style={{ outline: index === currentSlot ? '2px solid #fcd34d' : undefined, outlineOffset: index === currentSlot ? 2 : undefined, background: cell.observedMs
              ? `color-mix(in srgb, #34d399 ${Math.round(ratio * 85)}%, #253342)`
              : 'repeating-linear-gradient(135deg, transparent, transparent 3px, #ffffff08 3px, #ffffff08 4px)' }}
            aria-current={index === currentSlot ? 'time' : undefined}
            aria-label={`${descriptions[index]}${index === currentSlot ? ' · Current hour' : ''}`} aria-pressed={selected === index} title={`${descriptions[index]}${index === currentSlot ? ' · Current hour' : ''}`}
            onMouseEnter={() => onHover(index)} onMouseLeave={() => onHover(null)}
            onFocus={() => onSelect(index)} onClick={() => onSelect(index)} />;
        })}
      </div>)}
    </div>
  );
});
