import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  CaseUpper,
  Cloud,
  ImageIcon,
  ImagePlus,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { NetworkServerImageCropDialog } from './NetworkServerImageCropDialog.js';
import type { QueryProfileAvatarUser } from './QueryProfileAvatarBanner.js';
import { headerIconButtonClass } from './header-icon-button-style.js';
import { failedAvatarUrls } from './user-avatars/failure-cache.js';
import { readSelectedImageDataUrl } from './user-avatars/image-selection.js';
import { resolveIrcCloudAvatarUrl } from './user-avatars/irccloud.js';
import { resolveUserAvatarTarget } from './user-avatars/override-model.js';
import { useQueryAvatarOverride } from './user-avatars/query-overrides.js';

type QueryAvatarOptionsMenuProps = {
  externalAvatarsEnabled: boolean;
  failedAvatarUrl?: string | null;
  networkId: string;
  user: QueryProfileAvatarUser;
};

type QueryAvatarSource = 'custom' | 'initial' | 'irccloud';

type QueryAvatarSourcePresentation = {
  buttonClassName: string;
  icon: LucideIcon;
  iconClassName: string;
  label: string;
};

export function QueryAvatarOptionsMenu(props: QueryAvatarOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const avatarTarget = useMemo(
    () => resolveUserAvatarTarget(props.networkId, props.user),
    [props.networkId, props.user],
  );
  const avatarOverride = useQueryAvatarOverride({
    allowNickFallback: true,
    target: avatarTarget,
  });
  const ircCloudAvatarUrl = useMemo(
    () => (props.externalAvatarsEnabled ? resolveIrcCloudAvatarUrl(props.user) : null),
    [props.externalAvatarsEnabled, props.user],
  );
  const preferredAvatarUrl = avatarOverride.url || ircCloudAvatarUrl;
  const preferredAvatarFailed = Boolean(
    preferredAvatarUrl
    && (props.failedAvatarUrl === preferredAvatarUrl || failedAvatarUrls.has(preferredAvatarUrl)),
  );
  const source: QueryAvatarSource = preferredAvatarFailed
    ? 'initial'
    : avatarOverride.url
      ? 'custom'
      : ircCloudAvatarUrl
        ? 'irccloud'
        : 'initial';
  const sourcePresentation = avatarSourcePresentations[source];
  const SourceIcon = sourcePresentation.icon;

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    try {
      setCropSource(await readSelectedImageDataUrl(file));
      setError(null);
      setOpen(false);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Image could not be read.');
      setOpen(true);
    }
  };

  const label = `Avatar options for ${props.user.nick}`;
  return (
    <>
      <div ref={menuRef} className="relative">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void handleFileChange(event);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={sourcePresentation.buttonClassName}
          aria-label={label}
          aria-description={`Avatar source: ${sourcePresentation.label}`}
          aria-expanded={open}
          aria-haspopup="menu"
          data-avatar-source={source}
          title={`${label}. Avatar source: ${sourcePresentation.label}`}
          onClick={() => {
            setError(null);
            setOpen((current) => !current);
          }}
        >
          <SourceIcon className="size-4" />
        </Button>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 min-w-52 overflow-hidden rounded-[0.9rem] border border-white/10 bg-popover p-1 shadow-[0_16px_40px_rgba(0,0,0,0.38)]"
          >
            <div
              className="flex items-center gap-2.5 px-2.5 py-2"
              data-avatar-source-summary={source}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg border bg-white/[0.035]',
                  sourcePresentation.iconClassName,
                )}
              >
                <SourceIcon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/64">
                  Avatar source
                </span>
                <span className="block truncate text-[12px] font-medium text-foreground/90">
                  {sourcePresentation.label}
                </span>
              </span>
            </div>
            <div role="separator" className="mx-1 mb-1 h-px bg-white/[0.07]" />
            <AvatarMenuItem
              icon={<ImagePlus />}
              label="Set custom avatar"
              onSelect={() => inputRef.current?.click()}
            />
            {avatarOverride.url ? (
              <AvatarMenuItem
                icon={<RotateCcw />}
                label="Use original avatar"
                onSelect={() => {
                  avatarOverride.setUrl(null);
                  setOpen(false);
                }}
              />
            ) : null}
            {error ? (
              <p role="alert" className="px-2.5 py-2 text-[11px] leading-4 text-rose-300">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {cropSource ? (
        <NetworkServerImageCropDialog
          source={cropSource}
          title="Crop Avatar"
          onCancel={() => setCropSource(null)}
          onConfirm={(value) => {
            setCropSource(null);
            avatarOverride.setUrl(value);
          }}
        />
      ) : null}
    </>
  );
}

const avatarSourcePresentations = {
  custom: {
    buttonClassName: headerIconButtonClass(true),
    icon: ImageIcon,
    iconClassName: 'border-primary/25 text-primary',
    label: 'Custom',
  },
  initial: {
    buttonClassName: headerIconButtonClass(),
    icon: CaseUpper,
    iconClassName: 'border-white/10 text-muted-foreground',
    label: 'Initial fallback',
  },
  irccloud: {
    buttonClassName: cn(
      headerIconButtonClass(),
      'border-sky-300/25 bg-sky-300/10 text-sky-300 hover:border-sky-300/40 hover:bg-sky-300/15 hover:text-sky-200',
    ),
    icon: Cloud,
    iconClassName: 'border-sky-300/25 text-sky-300',
    label: 'IRCCloud',
  },
} satisfies Record<QueryAvatarSource, QueryAvatarSourcePresentation>;

function AvatarMenuItem(props: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 rounded-[0.7rem] px-2.5 py-2 text-left text-[12px] text-foreground transition-colors',
        'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/70',
        '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
      )}
      onClick={props.onSelect}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}
