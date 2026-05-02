import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NetworkProfile } from '../shared/protocol.js';
import { PreferencesDialogBody } from '../web/src/PreferencesDialogBody.js';
import type { ContactNotificationSettings } from '../web/src/contact-notifications/settings.js';

const networks: NetworkProfile[] = [{
  id: 'network-1',
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'tester',
  altNicks: ['tester_'],
  username: 'tester',
  realName: 'Tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
}];

const contactNotifications: ContactNotificationSettings = {
  enabled: true,
  systemEnabled: false,
  sound: 'bell',
  contacts: [{ networkId: 'network-1', nick: 'Alice' }],
};

test('preferences dialog renders notification controls and muted nick management', () => {
  const markup = renderToStaticMarkup(
    <PreferencesDialogBody
      contactNotifications={contactNotifications}
      mutedNicks={[{ id: 'mute-1', networkId: 'network-1', nick: 'MissD' }]}
      networks={networks}
      onSetContactNotificationSoundEnabled={() => {}}
      contactNotificationSystemPermission="default"
      onSetContactNotificationSystemEnabled={() => {}}
      onRequestContactNotificationSystemPermission={async () => 'default'}
      onSetContactNotificationSound={() => {}}
      onPreviewContactNotificationSound={() => {}}
      onRemoveContactNotificationContact={() => {}}
      onRemoveMutedNick={async () => true}
    />
  );

  assert.match(markup, /Notifications/);
  assert.match(markup, /Private Message Notifications/);
  assert.match(markup, /Delivery Methods/);
  assert.match(markup, /Play sound cue/);
  assert.match(markup, /Play sound cues for allowed private messages/);
  assert.match(markup, /Show system notifications/);
  assert.match(markup, /Allow notifications in the browser first/);
  assert.match(markup, />Allow in Browser</);
  assert.match(markup, /Notification sound/);
  assert.match(markup, /aria-label="Notification sound"/);
  assert.match(markup, /Preview notification sound/);
  assert.match(markup, />Preview</);
  assert.match(markup, /Notification Contacts/);
  assert.match(markup, /Notification contacts can use one or both delivery methods below/);
  assert.match(markup, />Alice</);
  assert.match(markup, />TestNet</);
  assert.match(markup, /Muted Nicks/);
  assert.match(markup, />MissD</);
});
