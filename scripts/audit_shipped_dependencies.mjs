import { spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const shippedRoots = packageJson.pulsete?.shippedDependencies ?? [];

if (shippedRoots.length === 0) {
  fail('package.json must declare pulsete.shippedDependencies');
}

verifyShippedRootClassification(shippedRoots);
const shippedPackagePaths = collectDependencyGraph(packageLock.packages, shippedRoots);
verifyNodeBundles(shippedRoots);
verifyPatchedWs(packageLock.packages['node_modules/ws']?.version);

const audit = spawnSync('npm', ['audit', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (!audit.stdout) {
  fail(`npm audit did not return JSON${audit.stderr ? `: ${audit.stderr.trim()}` : ''}`);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  fail('npm audit returned invalid JSON');
}

const blocking = Object.values(report.vulnerabilities ?? {})
  .filter((vulnerability) => isBlockingSeverity(vulnerability.severity))
  .filter((vulnerability) =>
    vulnerability.nodes?.some((node) => shippedPackagePaths.has(node)))
  .sort((left, right) => left.name.localeCompare(right.name));

if (blocking.length > 0) {
  const details = blocking.map((vulnerability) =>
    `${vulnerability.name} (${vulnerability.severity})`).join(', ');
  fail(`Shipped dependency audit found vulnerabilities: ${details}`);
}

console.log(`Audited ${shippedPackagePaths.size} shipped package installation(s); no high or critical vulnerabilities found.`);

function collectDependencyGraph(packages, roots) {
  const seen = new Set();
  const pending = roots.map((name) => requirePackagePath(packages, name));
  while (pending.length > 0) {
    const packagePath = pending.pop();
    if (seen.has(packagePath)) {
      continue;
    }
    seen.add(packagePath);
    const entry = packages[packagePath];
    const dependencyNames = [
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.optionalDependencies ?? {}),
    ];
    for (const dependencyName of dependencyNames) {
      const dependencyPath = resolveDependencyPath(packages, packagePath, dependencyName);
      if (dependencyPath) {
        pending.push(dependencyPath);
      }
    }
  }
  return seen;
}

function requirePackagePath(packages, name) {
  const packagePath = `node_modules/${name}`;
  if (!packages[packagePath]) {
    fail(`Shipped dependency is absent from package-lock.json: ${name}`);
  }
  return packagePath;
}

function resolveDependencyPath(packages, parentPath, dependencyName) {
  let searchPath = parentPath;
  while (searchPath) {
    const candidate = `${searchPath}/node_modules/${dependencyName}`;
    if (packages[candidate]) {
      return candidate;
    }
    const parentIndex = searchPath.lastIndexOf('/node_modules/');
    searchPath = parentIndex === -1 ? '' : searchPath.slice(0, parentIndex);
  }
  const rootCandidate = `node_modules/${dependencyName}`;
  return packages[rootCandidate] ? rootCandidate : null;
}

function verifyNodeBundles(roots) {
  const classified = new Set(roots);
  for (const sourceMapPath of ['build/server/index.cjs.map', 'build/desktop/main.cjs.map']) {
    const sourceMap = readJson(sourceMapPath);
    const bundled = new Set(sourceMap.sources.flatMap(packageNamesFromSource));
    const unclassified = [...bundled].filter((name) => !classified.has(name));
    if (unclassified.length > 0) {
      fail(`${sourceMapPath} contains unclassified packages: ${unclassified.join(', ')}`);
    }
    if (!bundled.has('ws')) {
      fail(`${sourceMapPath} does not contain the expected ws runtime dependency`);
    }
  }
}

function verifyShippedRootClassification(roots) {
  const classified = new Set(roots);
  const imported = new Set();
  for (const root of ['server', 'desktop', 'shared', 'web/src']) {
    for (const path of listSourceFiles(root)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      collectRuntimeImports(source, imported);
    }
  }
  const unclassified = [...imported]
    .filter((name) => !classified.has(name))
    .sort();
  if (unclassified.length > 0) {
    fail(`Runtime imports contain unclassified packages: ${unclassified.join(', ')}`);
  }
}

function listSourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (extname(entry.name) === '.ts' || extname(entry.name) === '.tsx') {
      files.push(path);
    }
  }
  return files;
}

function collectRuntimeImports(source, imported) {
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (hasRuntimeImport(node.importClause)) {
        addPackageName(imported, node.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.isTypeOnly
    ) {
      addPackageName(imported, node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0]
      && ts.isStringLiteral(node.arguments[0])
    ) {
      addPackageName(imported, node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function hasRuntimeImport(clause) {
  if (!clause) {
    return true;
  }
  if (clause.isTypeOnly) {
    return false;
  }
  const bindings = clause.namedBindings;
  return Boolean(clause.name)
    || !bindings
    || ts.isNamespaceImport(bindings)
    || bindings.elements.some((element) => !element.isTypeOnly);
}

function addPackageName(imported, specifier) {
  if (
    specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('@/')
    || specifier.startsWith('node:')
    || builtinModules.includes(specifier)
  ) {
    return;
  }
  imported.add(specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0]);
}

function packageNamesFromSource(source) {
  const match = source.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return match ? [match[1]] : [];
}

function verifyPatchedWs(version) {
  const parts = String(version ?? '').split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN) || compareVersions(parts, [8, 21, 0]) < 0) {
    fail(`ws must be at least 8.21.0; found ${version ?? 'no locked version'}`);
  }
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function isBlockingSeverity(severity) {
  return severity === 'high' || severity === 'critical';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
