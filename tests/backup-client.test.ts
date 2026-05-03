import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadFullBackup,
  importFullBackup,
  readPulseteBrowserPreferences,
} from '../web/src/backup-client.js';

test('downloadFullBackup sends Pulsete browser preferences and downloads the attachment', async () => {
  const restore = installBrowserStubs();
  const fetchCalls: Array<{ body: unknown; url: string }> = [];
  const clicked: Array<{ download: string; href: string }> = [];
  const link = {
    download: '',
    href: '',
    style: { display: '' },
    click() {
      clicked.push({ download: this.download, href: this.href });
    },
    remove() {},
  };
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ body: init?.body, url: String(input) });
    return new Response('backup-body', {
      status: 200,
      headers: {
        'Content-Disposition': 'attachment; filename="pulsete-test.pulsete-backup"',
      },
    });
  }) as typeof fetch;
  globalThis.document = {
    createElement: () => link,
    body: { append() {} },
  } as unknown as Document;
  globalThis.URL.createObjectURL = () => 'blob:backup';
  globalThis.URL.revokeObjectURL = () => {};

  try {
    window.localStorage.setItem('pulsete.sidebar.width', '320');
    window.localStorage.setItem('other.setting', 'ignored');
    await downloadFullBackup();

    assert.equal(fetchCalls[0].url, '/api/backups/export');
    assert.deepEqual(JSON.parse(String(fetchCalls[0].body)), {
      browserPreferences: { 'pulsete.sidebar.width': '320' },
    });
    assert.deepEqual(clicked, [{
      download: 'pulsete-test.pulsete-backup',
      href: 'blob:backup',
    }]);
  } finally {
    restore();
  }
});

test('importFullBackup restores returned Pulsete preferences and reloads', async () => {
  const restore = installBrowserStubs();
  let reloaded = false;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      browserPreferences: {
        ignored: 'value',
        'pulsete.sidebar.width': '384',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  Object.assign(window.location, {
    reload() {
      reloaded = true;
    },
  });

  try {
    window.localStorage.setItem('pulsete.sidebar.width', '320');
    window.localStorage.setItem('other.setting', 'kept');
    await importFullBackup(new Blob(['backup']));

    assert.equal(window.localStorage.getItem('pulsete.sidebar.width'), '384');
    assert.equal(window.localStorage.getItem('other.setting'), 'kept');
    assert.equal(reloaded, true);
  } finally {
    restore();
  }
});

test('readPulseteBrowserPreferences ignores non-Pulsete local storage keys', () => {
  const restore = installBrowserStubs();
  try {
    window.localStorage.setItem('pulsete.hideOfflineFriends', 'true');
    window.localStorage.setItem('vite.theme', 'dark');

    assert.deepEqual(readPulseteBrowserPreferences(), {
      'pulsete.hideOfflineFriends': 'true',
    });
  } finally {
    restore();
  }
});

const installBrowserStubs = () => {
  const original = {
    createObjectURL: globalThis.URL.createObjectURL,
    document: globalThis.document,
    fetch: globalThis.fetch,
    revokeObjectURL: globalThis.URL.revokeObjectURL,
    window: globalThis.window,
  };
  const storage = createMemoryLocalStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      location: { reload() {} },
    },
  });
  return () => {
    globalThis.fetch = original.fetch;
    globalThis.document = original.document;
    globalThis.URL.createObjectURL = original.createObjectURL;
    globalThis.URL.revokeObjectURL = original.revokeObjectURL;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: original.window,
    });
  };
};

const createMemoryLocalStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
};
