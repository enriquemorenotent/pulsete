"""Exercise promotion guards with tiny packages and a fake GitHub CLI. No network."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('promote.sh').resolve()
COMMIT = 'a' * 40

FAKE_GH = r'''#!/usr/bin/env python3
import base64, json, os, pathlib, shutil, sys
args = sys.argv[1:]
fixture = pathlib.Path(os.environ['FIXTURE'])
if args[:2] == ['api', 'repos/test/repo/actions/runs/123']:
    print((fixture / 'run.json').read_text())
elif args[0] == 'api' and 'contents/package.json' in args[1]:
    print(base64.b64encode(b'{"version":"1.0.1"}').decode())
elif args[:2] == ['run', 'download']:
    name = args[args.index('--name') + 1]
    source = 'candidate' if name == 'pulsete-linux-amd64-deb' else 'verification'
    shutil.copytree(fixture / source, args[args.index('--dir') + 1])
elif args[:2] == ['release', 'view']:
    print((fixture / 'latest').read_text())
elif args[:2] == ['api', '--paginate']:
    print((fixture / 'releases').read_text())
elif args[0] == 'api' and 'matching-refs' in args[1]:
    print((fixture / 'refs.json').read_text())
elif args[:2] == ['release', 'create']:
    pathlib.Path('published.json').write_text(json.dumps(args))
else:
    sys.exit('Unexpected gh request: ' + repr(args))
'''


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fixture = self.root / 'fixture'
        self.fixture.mkdir()
        self.work = self.root / 'work'
        self.work.mkdir()
        (self.root / 'gh').write_text(FAKE_GH)
        (self.root / 'gh').chmod(0o755)
        candidate = self.fixture / 'candidate'
        (candidate / 'release').mkdir(parents=True)
        (candidate / 'baseline').mkdir()
        self.package = candidate / 'release/pulsete_1.0.1_amd64.deb'
        self.make_deb(self.package, '1.0.1')
        baseline = candidate / 'baseline/baseline.deb'
        self.make_deb(baseline, '1.0.0')
        self.digest = hashlib.sha256(self.package.read_bytes()).hexdigest()
        self.report = dict(commit=COMMIT, sha256=self.digest, baseline='v1.0.0',
                           baseline_sha256=hashlib.sha256(baseline.read_bytes()).hexdigest(),
                           fresh='passed', upgrade='passed')
        self.run = dict(conclusion='success', status='completed', event='workflow_dispatch',
                        head_branch='main', path='.github/workflows/desktop-release.yml', head_sha=COMMIT)
        (self.fixture / 'verification').mkdir()
        for check in ('fresh', 'upgrade'):
            (self.fixture / f'verification/{check}.exit').write_text('0\n')
        (self.fixture / 'latest').write_text('v1.0.0')
        (self.fixture / 'releases').write_text('v1.0.0')
        (self.fixture / 'refs.json').write_text('[]')

    def make_deb(self, target, version):
        stage = self.root / version / 'DEBIAN'
        stage.mkdir(parents=True)
        (stage / 'control').write_text(f'Package: pulsete\nVersion: {version}\nArchitecture: amd64\nMaintainer: Test <test@example.com>\nDescription: test fixture\n')
        subprocess.run(['dpkg-deb', '--build', str(stage.parent), str(target)], check=True, capture_output=True)

    def promote(self, success=False):
        (self.fixture / 'verification/verification.json').write_text(json.dumps(self.report))
        (self.fixture / 'run.json').write_text(json.dumps(self.run))
        env = dict(os.environ, PATH=f'{self.root}:{os.environ["PATH"]}', FIXTURE=str(self.fixture),
                   GH_REPO='test/repo', CANDIDATE_RUN_ID='123', EXPECTED_SHA256=self.digest,
                   GITHUB_OUTPUT=str(self.work / 'outputs'))
        result = subprocess.run(['bash', str(SCRIPT)], cwd=self.work, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        self.assertEqual((self.work / 'published.json').exists(), success)
        if success:
            args = json.loads((self.work / 'published.json').read_text())
            self.assertEqual(args[3], 'candidate/release/pulsete_1.0.1_amd64.deb')
            self.assertEqual(hashlib.sha256((self.work / args[3]).read_bytes()).hexdigest(), self.digest)

    def test_exact_tested_package(self):
        self.promote(success=True)

    def test_changed_package(self):
        with self.package.open('ab') as package:
            package.write(b'changed')
        self.promote()

    def test_failed_run(self):
        self.run['conclusion'] = 'failure'
        self.promote()

    def test_wrong_commit(self):
        self.report['commit'] = 'b' * 40
        self.promote()

    def test_missing_upgrade_pass(self):
        self.report['upgrade'] = 'failed'
        self.promote()

    def test_nonzero_test_exit(self):
        (self.fixture / 'verification/upgrade.exit').write_text('1\n')
        self.promote()

    def test_stale_baseline(self):
        (self.fixture / 'latest').write_text('v1.0.2')
        self.promote()

    def test_wrong_branch(self):
        self.run['head_branch'] = 'untrusted'
        self.promote()

    def test_changed_baseline(self):
        (self.fixture / 'candidate/baseline/baseline.deb').write_bytes(b'changed')
        self.promote()

    def test_existing_release(self):
        (self.fixture / 'releases').write_text('v1.0.1')
        self.promote()

    def test_existing_tag(self):
        (self.fixture / 'refs.json').write_text('[{"ref":"refs/tags/v1.0.1"}]')
        self.promote()


if __name__ == '__main__':
    unittest.main()
