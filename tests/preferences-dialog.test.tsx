import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AssistantSnapshot, NetworkProfile } from '../shared/protocol.js';
import { PreferencesDialogBody } from '../web/src/PreferencesDialogBody.js';
import { emptyAssistantSnapshot } from '../web/src/assistant-state.js';
import type { BackgroundDmAudioSettings } from '../web/src/background-dm-audio.js';

const assistant: AssistantSnapshot = {
  ...emptyAssistantSnapshot,
  auth: {
    ...emptyAssistantSnapshot.auth,
    account: {
      type: 'chatgpt',
      email: 'tester@example.com',
      planType: 'pro',
    },
  },
  serviceStatus: 'ready',
  rateLimits: {
    limitId: 'codex',
    limitName: null,
    primary: { usedPercent: 2, windowDurationMins: 300, resetsAt: 1_763_980_140 },
    secondary: { usedPercent: 67, windowDurationMins: 10_080, resetsAt: 1_764_482_160 },
    credits: null,
    planType: 'pro',
  },
  rateLimitBuckets: [{
    limitId: 'codex',
    limitName: null,
    primary: { usedPercent: 2, windowDurationMins: 300, resetsAt: 1_763_980_140 },
    secondary: { usedPercent: 67, windowDurationMins: 10_080, resetsAt: 1_764_482_160 },
    credits: null,
    planType: 'pro',
  }, {
    limitId: 'gpt-5.3-codex-spark',
    limitName: 'GPT-5.3-Codex-Spark',
    primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1_763_983_200 },
    secondary: { usedPercent: 0, windowDurationMins: 10_080, resetsAt: 1_764_486_000 },
    credits: null,
    planType: 'pro',
  }],
};

const networks: NetworkProfile[] = [{
  id: 'network-1',
  templateId: null,
  managerHidden: true,
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
  personaNote: '',
}];

const backgroundDmAudio: BackgroundDmAudioSettings = {
  enabled: true,
  systemEnabled: false,
  sound: 'bell',
  contacts: [{ networkId: 'network-1', nick: 'Alice' }],
};

test('preferences dialog shows codex limits with progress bars and hides spark buckets', () => {
  const markup = renderToStaticMarkup(
    <PreferencesDialogBody
      assistant={assistant}
      backgroundDmAudio={backgroundDmAudio}
      mutedNicks={[{ id: 'mute-1', networkId: 'network-1', nick: 'MissD' }]}
      networks={networks}
      onStartLogin={async () => {}}
      onCancelLogin={async () => {}}
      onLogout={async () => {}}
      onChangeModel={async () => {}}
      onSetBackgroundDmAudioEnabled={() => {}}
      backgroundDmAudioSystemPermission="default"
      onSetBackgroundDmAudioSystemEnabled={() => {}}
      onRequestBackgroundDmAudioSystemPermission={async () => 'default'}
      onSetBackgroundDmAudioSound={() => {}}
      onPreviewBackgroundDmAudioSound={() => {}}
      onRemoveBackgroundDmAudioContact={() => {}}
      onRemoveMutedNick={async () => true}
    />
  );

  assert.match(markup, /Notifications/);
  assert.match(markup, /Assistant/);
  assert.match(markup, /Private Message Notifications/);
  assert.match(markup, /Delivery Methods/);
  assert.match(markup, /Play sound cue/);
  assert.match(markup, /Play sound cues for allowed private messages/);
  assert.match(markup, /Show system notifications/);
  assert.match(markup, /Allow notifications in the browser first/);
  assert.match(markup, />Allow in Browser</);
  assert.match(markup, /Show system notifications for allowed private messages/);
  assert.match(markup, /Notification sound/);
  assert.match(markup, /aria-label="Notification sound"/);
  assert.match(markup, /aria-label="Default model"/);
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /Preview notification sound/);
  assert.match(markup, />Preview</);
  assert.match(markup, /Add contacts from a private-message header/);
  assert.match(markup, />Alice</);
  assert.match(markup, />TestNet</);
  assert.match(markup, /Muted Nicks/);
  assert.match(markup, />MissD</);
  assert.match(markup, /Codex/);
  assert.match(markup, /5h limit/);
  assert.match(markup, /Weekly limit/);
  assert.match(markup, /98% left/);
  assert.match(markup, /33% left/);
  assert.match(markup, /67% used/);
  assert.match(markup, /style=\"width:98%\"/);
  assert.doesNotMatch(markup, /Spark/);
});

test('preferences dialog renders a manual sign-in link while auth is pending', () => {
  const markup = renderToStaticMarkup(
    <PreferencesDialogBody
      assistant={{
        ...assistant,
        auth: {
          ...assistant.auth,
          account: null,
          pendingLoginId: 'login-1',
          pendingAuthUrl: 'https://auth.example.test',
        },
      }}
      backgroundDmAudio={backgroundDmAudio}
      mutedNicks={[]}
      networks={networks}
      onStartLogin={async () => {}}
      onCancelLogin={async () => {}}
      onLogout={async () => {}}
      onChangeModel={async () => {}}
      onSetBackgroundDmAudioEnabled={() => {}}
      backgroundDmAudioSystemPermission="default"
      onSetBackgroundDmAudioSystemEnabled={() => {}}
      onRequestBackgroundDmAudioSystemPermission={async () => 'default'}
      onSetBackgroundDmAudioSound={() => {}}
      onPreviewBackgroundDmAudioSound={() => {}}
      onRemoveBackgroundDmAudioContact={() => {}}
      onRemoveMutedNick={async () => true}
    />
  );

  assert.match(markup, /continue in a browser tab/);
  assert.match(markup, /href=\"https:\/\/auth\.example\.test\"/);
});
