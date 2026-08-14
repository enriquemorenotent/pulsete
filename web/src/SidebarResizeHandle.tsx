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
    <div className="group relative hidden w-px shrink-0 items-stretch bg-transparent lg:flex">
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
          'absolute inset-y-0 left-1/2 z-10 flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none',
          'bg-transparent focus-visible:bg-transparent'
        )}
      >
        <div
          className={cn(
            'h-full w-px bg-[#292d33] transition-colors group-hover:bg-[#42464f]',
            props.isResizing && 'bg-primary'
          )}
        />
      </div>
    </div>
  );
}
