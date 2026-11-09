import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { DropdownMenu } from '@/components/ui/dropdown-menu.js';
import { headerIconButtonClass } from './header-icon-button-style.js';
import type { ChatPaneHeaderAction } from './chat-pane-header-actions.js';

type ChatPaneHeaderActionMenuProps = {
  actions: ChatPaneHeaderAction[];
};

export function ChatPaneHeaderActionMenu(props: ChatPaneHeaderActionMenuProps) {
  if (props.actions.length === 0) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" size="icon"
          className={headerIconButtonClass()} aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content>
          <DropdownMenu.Group>
            {props.actions.map(action => (
              <DropdownMenu.Item key={action.id} tone={action.tone === 'danger' ? 'danger' : undefined} onSelect={action.onSelect}>
                {action.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
