import { useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Label } from '@/components/ui/label.js';
import {
  clampPan,
  cropImageDataUrl,
  cropViewportSize,
  type ImageDimensions,
  type Point,
} from './network-server-image-crop-utils.js';

type NetworkServerImageCropDialogProps = {
  source: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function NetworkServerImageCropDialog(
  props: NetworkServerImageCropDialogProps,
) {
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [dragStart, setDragStart] = useState<{ origin: Point; pointer: Point } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const previewSize = `${cropViewportSize}px`;

  const clampNextPan = (nextPan: Point, nextZoom = zoom) =>
    dimensions ? clampPan(nextPan, dimensions, nextZoom) : nextPan;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart || !dimensions) {
      return;
    }
    setPan(clampNextPan({
      x: dragStart.origin.x + event.clientX - dragStart.pointer.x,
      y: dragStart.origin.y + event.clientY - dragStart.pointer.y,
    }));
  };

  const handleZoom = (value: string) => {
    const nextZoom = Number(value);
    setZoom(nextZoom);
    setPan((current) => clampNextPan(current, nextZoom));
  };

  const handleConfirm = async () => {
    if (!dimensions) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      props.onConfirm(await cropImageDataUrl(props.source, dimensions, pan, zoom));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'Image could not be cropped');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(calc(100vw-1rem),28rem)]"
      >
        <DialogHeader>
          <DialogTitle>Crop Server Image</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className="relative mx-auto touch-none overflow-hidden rounded-sm border border-white/10 bg-black/35"
            style={{ width: previewSize, height: previewSize }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragStart({ origin: pan, pointer: { x: event.clientX, y: event.clientY } });
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragStart(null)}
            onPointerCancel={() => setDragStart(null)}
          >
            <img
              src={props.source}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                height: dimensions
                  ? `${dimensions.height * Math.max(cropViewportSize / dimensions.width, cropViewportSize / dimensions.height)}px`
                  : 'auto',
                transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                transformOrigin: 'center',
                width: dimensions
                  ? `${dimensions.width * Math.max(cropViewportSize / dimensions.width, cropViewportSize / dimensions.height)}px`
                  : 'auto',
              }}
              onLoad={(event) => {
                const image = event.currentTarget;
                setDimensions({ height: image.naturalHeight, width: image.naturalWidth });
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="server-image-zoom">Zoom</Label>
            <input
              id="server-image-zoom"
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={zoom}
              onChange={(event) => handleZoom(event.target.value)}
              className="w-full accent-primary"
            />
          </div>
          {error ? <div className="text-[12px] text-destructive">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={!dimensions || saving}
            onClick={() => void handleConfirm()}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
