import { useAccountMediaUrl } from './account-media.js';
import { useId, useRef, useState, type ChangeEvent } from 'react';
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
  networkId?: string;
  blockRemote?: boolean;
  externalAvatarsEnabled?: boolean;
  username?: string;
  value: string;
  onChange: (value: string) => void;
};

export function NetworkServerImageField(props: NetworkServerImageFieldProps) {
  const inputId = useId();
  const urlId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasImage = props.value.trim().length > 0;
  const serverImage = resolveNetworkServerImage(
    { iconUrl: props.value, username: props.username },
    props.externalAvatarsEnabled === true,
  );

  const source = useAccountMediaUrl(props.blockRemote ? undefined : serverImage?.url, props.networkId);
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
      <Label htmlFor={urlId}>Server image</Label>
      <div className="flex gap-2">
        <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary">
          {serverImage ? (
            <img src={source} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
          )}
          {isNetworkServerImageFallback(serverImage) ? (
            <NetworkServerImageFallbackCue className="right-0 top-0" />
          ) : null}
        </div>
        <Input
          id={urlId}
          value={props.value}
          placeholder="https://example.com/server.png"
          onChange={(event) => {
            setError(null);
            props.onChange(event.target.value);
          }}
        />
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button type="button" variant="outline" size="icon" aria-label="Choose image" title="Choose image" onClick={() => inputRef.current?.click()}>
          <ImageIcon className="size-4" aria-hidden />
        </Button>
        {hasImage ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Clear image"
            aria-label="Clear image"
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
