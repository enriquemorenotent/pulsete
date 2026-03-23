import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AssistantSnapshot } from '../shared/protocol.js';
import { PreferencesDialog } from '../web/src/PreferencesDialog.js';
import { emptyAssistantSnapshot } from '../web/src/assistant-state.js';

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

test('preferences dialog shows codex limits with progress bars and hides spark buckets', () => {
  const markup = renderToStaticMarkup(
    <PreferencesDialog
      open
      assistant={assistant}
      onClose={() => {}}
      onStartLogin={async () => {}}
      onCancelLogin={async () => {}}
      onLogout={async () => {}}
      onChangeModel={async () => {}}
    />
  );

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
    <PreferencesDialog
      open
      assistant={{
        ...assistant,
        auth: {
          ...assistant.auth,
          account: null,
          pendingLoginId: 'login-1',
          pendingAuthUrl: 'https://auth.example.test',
        },
      }}
      onClose={() => {}}
      onStartLogin={async () => {}}
      onCancelLogin={async () => {}}
      onLogout={async () => {}}
      onChangeModel={async () => {}}
    />
  );

  assert.match(markup, /continue in a browser tab/);
  assert.match(markup, /href=\"https:\/\/auth\.example\.test\"/);
});
