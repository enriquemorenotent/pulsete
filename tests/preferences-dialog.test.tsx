import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import { PreferencesDialogBody } from '../web/src/PreferencesDialogBody.js';
import type { ContactNotificationSettings } from '../web/src/contact-notifications/settings.js';
import type { MediaVisibilitySettings } from '../web/src/media-visibility-settings.js';
import type { UserAvatarSettings } from '../web/src/user-avatars/settings.js';

const networks: NetworkProfile[] = [{
  id: 'network-1',
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'tester',
  altNicks: ['tester_'],
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
  channels: [{ networkId: 'network-1', channel: '#help' }],
};

const userAvatarSettings: UserAvatarSettings = {
  externalAvatarsEnabled: false,
};

const mediaVisibilitySettings: MediaVisibilitySettings = {
  mode: 'show-media',
};

test('preferences dialog renders notification controls and muted nick management', () => {
  const markup = renderToStaticMarkup(
    <PreferencesDialogBody
      contactNotifications={contactNotifications}
      mediaVisibilitySettings={mediaVisibilitySettings}
      userAvatarSettings={userAvatarSettings}
      mutedNicks={[{ id: 'mute-1', networkId: 'network-1', nick: 'MissD' }]}
      networks={networks}
      onSetContactNotificationSoundEnabled={() => {}}
      contactNotificationSystemPermission="default"
      onSetContactNotificationSystemEnabled={() => {}}
      onRequestContactNotificationSystemPermission={async () => 'default'}
      onSetContactNotificationSound={() => {}}
      onPreviewContactNotificationSound={() => {}}
      onRemoveContactNotificationChannel={() => {}}
      onRemoveContactNotificationContact={() => {}}
      onRemoveMutedNick={async () => true}
      onSetMediaVisibilityMode={() => {}}
      onSetExternalAvatarsEnabled={() => {}}
      onExportBackup={async () => {}}
      onImportBackup={async () => {}}
    />
  );

  assert.match(markup, /Media/);
  assert.match(markup, /Media display/);
  assert.match(markup, /aria-label="Media display"/);
  assert.match(markup, /Hide media keeps server artwork/i);
  assert.match(markup, /Avatars/);
  assert.match(markup, /Show external avatars/);
  assert.match(markup, /IRCCloud/);
  assert.match(markup, /Notifications/);
  assert.match(markup, /Conversation Notifications/);
  assert.match(markup, /Delivery Methods/);
  assert.match(markup, /Play sound cue/);
  assert.match(markup, /Play sound cues for allowed conversations/);
  assert.match(markup, /Show system notifications/);
  assert.match(markup, /Allow notifications in the browser first/);
  assert.match(markup, />Allow in Browser</);
  assert.match(markup, /Notification sound/);
  assert.match(markup, /aria-label="Notification sound"/);
  assert.match(markup, /Preview notification sound/);
  assert.match(markup, />Preview</);
  assert.match(markup, /Notification Contacts/);
  assert.match(markup, /Notification conversations can use one or both delivery methods below/);
  assert.match(markup, />Alice</);
  assert.match(markup, /Notification Channels/);
  assert.match(markup, />#help</);
  assert.match(markup, />TestNet</);
  assert.match(markup, /Muted Nicks/);
  assert.match(markup, />MissD</);
  assert.match(markup, /Backup &amp; Restore/);
  assert.match(markup, /Export Backup/);
  assert.match(markup, /Import Backup/);
});
