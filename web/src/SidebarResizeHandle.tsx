import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/lib/utils.js';
import {
  getSidebarResizeDeltaForKey,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type SidebarEdge,
} from './sidebar-width.js';

type SidebarResizeHandleProps = {
  sidebarWidth: number;
  isResizing: boolean;
  edge?: SidebarEdge;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onNudge: (delta: number) => void;
  onReset: () => void;
};

export function SidebarResizeHandle(props: SidebarResizeHandleProps) {
  const edge = props.edge ?? 'left';
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = getSidebarResizeDeltaForKey(edge, event.key);
    if (delta !== null) {
      event.preventDefault();
      props.onNudge(delta);
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
    <div className="group hidden w-3 shrink-0 items-stretch lg:flex">
      <div
        role="separator"
        tabIndex={0}
        aria-label={`Resize ${edge} sidebar`}
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
          'focus-visible:bg-white/[0.05]',
          props.isResizing && 'bg-white/[0.05]'
        )}
      >
        <div
          className={cn(
            'h-full w-px bg-white/[0.07] transition-colors group-hover:bg-white/[0.16]',
            props.isResizing && 'bg-primary'
          )}
        />
      </div>
    </div>
  );
}
