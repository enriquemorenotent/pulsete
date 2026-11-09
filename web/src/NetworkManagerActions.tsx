import { Copy, Ellipsis, Heart, PencilLine, Trash2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu.js';
import { Button } from '@/components/ui/button.js';

export function NetworkManagerActions(props: {
  name: string;
  favorite: boolean;
  onEdit: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const itemClass = 'flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-white/7';
  return <div className="flex items-center gap-2">
    <Button variant="secondary" size="sm" onClick={props.onEdit} className="flex-1"><PencilLine />Edit</Button>
    <Button variant="outline" size="sm" onClick={props.onFavorite} aria-label={props.favorite ? 'Unfavorite' : 'Favorite'} title={props.favorite ? 'Unfavorite' : 'Favorite'} aria-pressed={props.favorite}>
      <Heart className={props.favorite ? 'fill-current text-rose-300' : ''} />
    </Button>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm" aria-label={`More actions for ${props.name}`} title="More actions"><Ellipsis /></Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <DropdownMenu.Group>
          <DropdownMenu.Item className={itemClass} onSelect={props.onDuplicate}><Copy className="size-4" />Duplicate</DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={`${itemClass} text-destructive`} onSelect={props.onRemove}><Trash2 className="size-4" />Remove</DropdownMenu.Item>
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>;
}
