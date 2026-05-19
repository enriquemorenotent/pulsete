import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { chmod, cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const releaseDir = resolve(process.env.APT_RELEASE_DIR ?? 'release');
const siteRoot = resolve(process.env.APT_SITE_ROOT ?? 'pages');
const aptRoot = join(siteRoot, 'apt');
const suite = process.env.APT_SUITE ?? 'noble';
const component = process.env.APT_COMPONENT ?? 'main';
const arch = process.env.APT_ARCH ?? 'amd64';
const packageName = process.env.APT_PACKAGE_NAME ?? 'pulsete';
const signingKey = process.env.APT_GPG_KEY_ID ?? '';
const signingPassphraseFile = process.env.APT_GPG_PASSPHRASE_FILE ?? '';

await buildRepository();

async function buildRepository() {
  const deb = await findDebianPackage();
  await rm(siteRoot, { recursive: true, force: true });
  await mkdir(aptRoot, { recursive: true });
  await writeSiteIndex();
  await copyBootstrapFiles();
  await copyPackage(deb);
  await writePackagesIndex();
  await writeReleaseMetadata();
  if (signingKey && signingPassphraseFile) {
    await signReleaseMetadata();
  } else {
    console.warn('APT_GPG_KEY_ID or APT_GPG_PASSPHRASE_FILE not set; skipping repository signing.');
  }
  console.log(`APT repository written to ${aptRoot}`);
}

async function findDebianPackage() {
  const entries = await readdir(releaseDir);
  const debs = entries.filter((entry) => entry.endsWith('.deb')).sort();
  if (debs.length !== 1) {
    throw new Error(`Expected exactly one .deb in ${releaseDir}, found ${debs.length}`);
  }
  return join(releaseDir, debs[0]);
}

async function writeSiteIndex() {
  await writeFile(join(siteRoot, 'index.html'), `<!doctype html>
<meta charset="utf-8">
<title>Pulsete APT Repository</title>
<h1>Pulsete APT Repository</h1>
<p>Ubuntu packages are available under <a href="./apt/">./apt/</a>.</p>
<pre>deb [arch=${arch} signed-by=/usr/share/keyrings/pulsete-archive-keyring.gpg] https://enriquemorenotent.github.io/pulsete/apt ${suite} ${component}</pre>
`);
}

async function copyBootstrapFiles() {
  const files = [
    'pulsete-archive-keyring.asc',
    'pulsete-archive-keyring.gpg',
    'pulsete.sources',
  ];
  for (const file of files) {
    const target = join(aptRoot, file);
    await cp(join('build-resources/apt', file), target);
    await chmod(target, 0o644);
  }
}

async function copyPackage(deb) {
  const targetDir = join(aptRoot, 'pool', 'main', packageName[0], packageName);
  await mkdir(targetDir, { recursive: true });
  await cp(deb, join(targetDir, basename(deb)));
}

async function writePackagesIndex() {
  const binaryDir = join(aptRoot, 'dists', suite, component, `binary-${arch}`);
  await mkdir(binaryDir, { recursive: true });
  const packages = await runCapture('apt-ftparchive', ['packages', 'pool'], { cwd: aptRoot });
  await writeFile(join(binaryDir, 'Packages'), packages);
  await writeFile(join(binaryDir, 'Packages.gz'), gzipSync(Buffer.from(packages), { level: 9 }));
}

async function writeReleaseMetadata() {
  const suiteDir = join(aptRoot, 'dists', suite);
  const configDir = await mkdtemp(join(tmpdir(), 'pulsete-apt-'));
  const configPath = join(configDir, 'release.conf');
  await writeFile(configPath, `APT::FTPArchive::Release {
  Origin "Pulsete";
  Label "Pulsete";
  Suite "${suite}";
  Codename "${suite}";
  Architectures "${arch}";
  Components "${component}";
  Description "Pulsete Ubuntu packages";
};
`);
  const release = await runCapture('apt-ftparchive', ['-c', configPath, 'release', `dists/${suite}`], { cwd: aptRoot });
  await writeFile(join(suiteDir, 'Release'), release);
  await rm(configDir, { recursive: true, force: true });
}

async function signReleaseMetadata() {
  const suiteDir = join(aptRoot, 'dists', suite);
  await run('gpg', [
    '--batch',
    '--yes',
    '--pinentry-mode',
    'loopback',
    '--passphrase-file',
    signingPassphraseFile,
    '--local-user',
    signingKey,
    '--digest-algo',
    'SHA256',
    '--output',
    'InRelease',
    '--clearsign',
    'Release',
  ], { cwd: suiteDir });
  await run('gpg', [
    '--batch',
    '--yes',
    '--pinentry-mode',
    'loopback',
    '--passphrase-file',
    signingPassphraseFile,
    '--local-user',
    signingKey,
    '--digest-algo',
    'SHA256',
    '--output',
    'Release.gpg',
    '--detach-sign',
    'Release',
  ], { cwd: suiteDir });
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: options.stdio ?? 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
    });
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(chunks).toString('utf8'));
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
    });
  });
}
