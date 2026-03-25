import { Input } from '@/components/ui/input.js';

type SelfNickAliasesFieldProps = {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  hint: string;
  onChange: (value: string) => void;
};

export function SelfNickAliasesField(props: SelfNickAliasesFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-[12px] font-medium text-foreground" htmlFor={props.id}>
        {props.label}
      </label>
      <Input
        id={props.id}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <p className="text-[12px] text-muted-foreground">{props.hint}</p>
    </div>
  );
}

export const parseCommaSeparatedNicks = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const formatCommaSeparatedNicks = (value: string[]) => value.join(', ');
