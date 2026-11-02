import type { ContactNotificationContact } from './contact-notifications/settings.js';
import { Button } from '@/components/ui/button.js';
import { identityFromNick, identityKey } from '../../shared/user-identity.js';

type PreferencesNotificationAllowedContactsProps = {
  contacts: ContactNotificationContact[];
  networkNameById: Map<string, string>;
  onRemoveContact: (contact: ContactNotificationContact) => void;
};

export function PreferencesNotificationAllowedContacts(
  props: PreferencesNotificationAllowedContactsProps,
) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Contacts with notifications enabled.
        </p>
      </div>

      {props.contacts.length > 0 ? (
        <ul className="divide-y divide-white/6">
          {props.contacts.map((contact) => {
            const networkName = props.networkNameById.get(contact.networkId) ?? contact.networkId;
            return (
              <li
                key={`${contact.networkId}:${identityKey(contact.identity ?? identityFromNick(contact.nick))}`}
                className="flex items-center justify-between gap-3 px-1 py-2"
              >
                <div className="flex min-w-0 flex-1 items-baseline gap-3">
                  <p className="w-32 shrink-0 truncate text-sm font-medium text-foreground">{contact.nick}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{networkName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => props.onRemoveContact(contact)}
                  aria-label={`Remove ${contact.nick} from notification contacts`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No notification contacts yet.
        </p>
      )}
    </div>
  );
}
