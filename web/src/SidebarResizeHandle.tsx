import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/lib/utils.js';
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_STEP,
} from './sidebar-width.js';

type SidebarResizeHandleProps = {
  sidebarWidth: number;
  isResizing: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onNudge: (delta: number) => void;
  onReset: () => void;
};

export function SidebarResizeHandle(props: SidebarResizeHandleProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      props.onNudge(-SIDEBAR_WIDTH_STEP);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      props.onNudge(SIDEBAR_WIDTH_STEP);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      props.onReset();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      props.onNudge(MAX_SIDEBAR_WIDTH - props.sidebarWidth);
    }
  };

  return (
    <div className="group hidden w-4 shrink-0 items-stretch xl:flex">
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={props.sidebarWidth}
        aria-valuetext={`${props.sidebarWidth}px`}
        onPointerDown={props.onPointerDown}
        onDoubleClick={props.onReset}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex w-full cursor-col-resize touch-none items-center justify-center outline-none',
          'focus-visible:bg-accent/60',
          props.isResizing && 'bg-accent/60'
        )}
      >
        <div
          className={cn(
            'h-full w-px bg-border transition-colors group-hover:bg-muted-foreground/50',
            props.isResizing && 'bg-primary'
          )}
        />
      </div>
    </div>
  );
}
