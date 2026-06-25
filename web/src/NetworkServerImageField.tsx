import { useId, useState, type ChangeEvent } from 'react';
import { ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { NetworkServerImageCropDialog } from './NetworkServerImageCropDialog.js';
import { NetworkServerImageFallbackCue } from './NetworkServerImageFallbackCue.js';
import { readSelectedImageDataUrl } from './user-avatars/image-selection.js';
import {
  isNetworkServerImageFallback,
  resolveNetworkServerImage,
} from './network-server-image.js';

type NetworkServerImageFieldProps = {
  externalAvatarsEnabled?: boolean;
  username?: string;
  value: string;
  onChange: (value: string) => void;
};

export function NetworkServerImageField(props: NetworkServerImageFieldProps) {
  const inputId = useId();
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasImage = props.value.trim().length > 0;
  const serverImage = resolveNetworkServerImage(
    { iconUrl: props.value, username: props.username },
    props.externalAvatarsEnabled === true,
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    try {
      setCropSource(await readSelectedImageDataUrl(file));
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Image could not be read.');
    }
  };

  return (
    <div className="space-y-1">
      <Label>Server image</Label>
      <div className="flex gap-2">
        <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary">
          {serverImage ? (
            <img src={serverImage.url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
          )}
          {isNetworkServerImageFallback(serverImage) ? (
            <NetworkServerImageFallbackCue className="right-0 top-0" />
          ) : null}
        </div>
        <Input
          value={props.value}
          placeholder="https://example.com/server.png"
          onChange={(event) => {
            setError(null);
            props.onChange(event.target.value);
          }}
        />
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />
        <Button asChild variant="outline" size="icon" title="Choose image">
          <label htmlFor={inputId} className="cursor-pointer">
            <ImageIcon className="size-4" aria-hidden />
          </label>
        </Button>
        {hasImage ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Clear image"
            onClick={() => {
              setError(null);
              props.onChange('');
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="text-[12px] text-destructive">{error}</div>
      ) : null}
      {cropSource ? (
        <NetworkServerImageCropDialog
          source={cropSource}
          onCancel={() => setCropSource(null)}
          onConfirm={(value) => {
            setCropSource(null);
            props.onChange(value);
          }}
        />
      ) : null}
    </div>
  );
}
