import { Badge } from '@/components/ui/badge.js';

export type ApplicationEnvironment = 'development' | 'production';

type ViteBuildEnvironment = {
  PROD?: boolean;
};

const applicationEnvironment = resolveApplicationEnvironment(
  (import.meta as ImportMeta & { env?: ViteBuildEnvironment }).env,
);

export function resolveApplicationEnvironment(
  environment?: ViteBuildEnvironment,
): ApplicationEnvironment {
  return environment?.PROD === true ? 'production' : 'development';
}

export function DesktopShellBrand(props: {
  environment?: ApplicationEnvironment;
}) {
  const environment = props.environment ?? applicationEnvironment;

  return (
    <div className="mr-auto flex shrink-0 items-center gap-2.5">
      <img
        src="/pulsete-logo.svg"
        alt="Pulsete"
        className="h-8 w-36 shrink-0 object-contain object-left"
        decoding="async"
      />
      {environment === 'development' ? (
        <Badge
          variant="outline"
          className="gap-1.5 rounded-full border-amber-400/45 bg-amber-400/10 px-2 font-mono text-[9px] font-semibold text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.12)]"
          aria-label="Development environment"
          title="Development environment"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-300" />
          DEV
        </Badge>
      ) : null}
    </div>
  );
}
