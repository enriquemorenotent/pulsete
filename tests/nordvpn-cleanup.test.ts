import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { createNordVpnCleanup, retryNordVpnCleanups } from '../server/nordvpn-cleanup.js';
import { closeNordVpnTunnels, startNordVpnTunnel } from '../server/nordvpn-tunnel.js';

test('failed cleanup retries automatically and concurrent callers share the retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const release = createNordVpnCleanup(async () => {
    if (++attempts === 1) throw new Error('Docker unavailable');
  });
  await assert.rejects(release(), /Docker unavailable/);
  t.mock.timers.tick(5_000);
  const first = release();
  assert.equal(release(), first);
  await first;
  await release();
  t.mock.timers.tick(10_000);
  await retryNordVpnCleanups();
  assert.equal(attempts, 2);
});

for (const failedStartup of [false, true]) {
  test(`${failedStartup ? 'failed startup' : 'disconnected tunnel'} retains failed cleanup until Docker recovers`, async () => {
    let available = false;
    let directory = '';
    let removals = 0;
    const start = () => startNordVpnTunnel(
      'Germany', { username: 'user', password: 'secret' }, new AbortController().signal,
      async args => {
        if (args[0] === 'run') {
          directory = args.find(arg => arg.startsWith('type=bind,'))!.split('source=')[1]!.split(',target=')[0]!;
          if (failedStartup) throw new Error('Docker run interrupted');
        }
        if (args[0] === 'inspect') return 'healthy';
        if (args[0] === 'port') return '127.0.0.1:43210';
        if (args[0] === 'rm') {
          removals++;
          if (!available) throw new Error('Docker unavailable');
        }
        return '';
      }, undefined, async () => ({ address: '192.0.2.1', hostname: 'de123.nordvpn.com' }),
    );
    try {
      if (failedStartup) {
        await assert.rejects(start(), /Unable to start/);
      } else {
        const lease = await start();
        await assert.rejects(lease.release(), /Docker unavailable/);
      }
      assert.ok(existsSync(directory));
      await closeNordVpnTunnels();
      assert.ok(existsSync(directory));
      available = true;
      await closeNordVpnTunnels();
      assert.equal(existsSync(directory), false);
      const completedRemovals = removals;
      await closeNordVpnTunnels();
      assert.equal(removals, completedRemovals);
    } finally {
      available = true;
      await closeNordVpnTunnels();
    }
  });
}

test('an already removed container still allows credential cleanup', async () => {
  let directory = '';
  const lease = await startNordVpnTunnel(
    'Germany', { username: 'user', password: 'secret' }, new AbortController().signal,
    async args => {
      if (args[0] === 'run') directory = args.find(arg => arg.startsWith('type=bind,'))!.split('source=')[1]!.split(',target=')[0]!;
      if (args[0] === 'inspect') return 'healthy';
      if (args[0] === 'port') return '127.0.0.1:43210';
      if (args[0] === 'rm') throw Object.assign(new Error('Docker command failed'), {
        stderr: `Error response from daemon: No such container: ${args[2]}`,
      });
      return '';
    }, undefined, async () => ({ address: '192.0.2.1', hostname: 'de123.nordvpn.com' }),
  );
  await lease.release();
  assert.equal(existsSync(directory), false);
});
