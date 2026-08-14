export type ApplicationEnvironment = 'development' | 'production';

type ViteBuildEnvironment = {
  PROD?: boolean;
};

export function resolveApplicationEnvironment(
  environment?: ViteBuildEnvironment,
): ApplicationEnvironment {
  return environment?.PROD === true ? 'production' : 'development';
}

export function DesktopShellBrand(props: {
  className?: string;
  environment?: ApplicationEnvironment;
  markOnly?: boolean;
}) {
  return (
    <div className={props.className ?? 'mr-auto flex shrink-0 items-center gap-2.5'}>
      <img
        src={props.markOnly ? '/pulsete-mark.svg' : '/pulsete-logo.svg'}
        alt="Pulsete"
        className={props.markOnly
          ? 'h-8 w-8 shrink-0 object-contain'
          : 'h-8 w-36 shrink-0 object-contain object-left'}
        decoding="async"
      />
    </div>
  );
}
