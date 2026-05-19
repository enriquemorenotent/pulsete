import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const projectRoot = process.cwd();
const stageRoot = resolve('build/electron-package');
const stageRelease = join(stageRoot, 'release');
const releaseDir = resolve('release');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));

await prepareStage();
await run(resolve('node_modules/.bin/electron-builder'), ['--linux', 'deb', '--x64', '--publish', 'never'], { cwd: stageRoot });
await publishArtifacts();
await rm(stageRoot, { recursive: true, force: true });

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd ?? projectRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
    });
  });
}

async function prepareStage() {
  await rm(stageRoot, { recursive: true, force: true });
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await cp('dist', join(stageRoot, 'dist'), { recursive: true });
  await cp('build/desktop', join(stageRoot, 'build/desktop'), { recursive: true });
  await cp('build-resources', join(stageRoot, 'build-resources'), { recursive: true });
  await cp('electron-builder.yml', join(stageRoot, 'electron-builder.yml'));
  await writeFile(join(stageRoot, 'package.json'), JSON.stringify(createStagePackageJson(), null, 2));
  await run('npm', ['install', '--omit=dev', '--package-lock=false'], { cwd: stageRoot });
}

function createStagePackageJson() {
  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    homepage: packageJson.homepage,
    private: true,
    repository: packageJson.repository,
    type: packageJson.type,
    main: packageJson.main,
    author: packageJson.author,
    license: packageJson.license,
    dependencies: {
      'better-sqlite3': exactPackageVersion('better-sqlite3'),
    },
    devDependencies: {
      electron: exactPackageVersion('electron'),
    },
  };
}

function exactPackageVersion(name) {
  const version = packageLock.packages?.[`node_modules/${name}`]?.version;
  if (!version) {
    throw new Error(`Unable to resolve installed package version for ${name}`);
  }
  return version;
}

async function publishArtifacts() {
  await mkdir(releaseDir, { recursive: true });
  for (const entry of await readdir(stageRelease)) {
    if (!entry.endsWith('.deb') && !entry.endsWith('.yml')) {
      continue;
    }
    await cp(join(stageRelease, entry), join(releaseDir, entry));
  }
}
