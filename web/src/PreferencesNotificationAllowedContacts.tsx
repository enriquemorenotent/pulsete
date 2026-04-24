import type { BackgroundDmAudioContact } from './background-dm-audio.js';
import { Button } from '@/components/ui/button.js';

type PreferencesNotificationAllowedContactsProps = {
  contacts: BackgroundDmAudioContact[];
  networkNameById: Map<string, string>;
  onRemoveContact: (contact: BackgroundDmAudioContact) => void;
};

export function PreferencesNotificationAllowedContacts(
  props: PreferencesNotificationAllowedContactsProps,
) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Notification Contacts
        </p>
        <p className="text-muted-foreground">
          Contacts with notifications enabled.
        </p>
      </div>

      {props.contacts.length > 0 ? (
        <ul className="space-y-2">
          {props.contacts.map((contact) => {
            const networkName = props.networkNameById.get(contact.networkId) ?? contact.networkId;
            return (
              <li
                key={`${contact.networkId}:${contact.nick}`}
                className="flex items-center justify-between gap-3 rounded-md border border-white/6 bg-black/14 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{contact.nick}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{networkName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => props.onRemoveContact(contact)}
                  aria-label={`Remove ${contact.nick} from background DM audio`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          No notification contacts yet.
        </p>
      )}
    </div>
  );
}
