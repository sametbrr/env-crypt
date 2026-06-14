'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { GITIGNORE_MARKER_START, GITIGNORE_MARKER_END, MANIFEST_FILE, LEDGER_FILE } = require('./config');

function findProjectRoot(startDir) {
  let dir = startDir || process.cwd();
  const { root } = path.parse(dir);
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, MANIFEST_FILE))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function findGitRoot(startDir) {
  let dir = startDir || process.cwd();
  const { root } = path.parse(dir);
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function updateGitignore(projectRoot, entries) {
  const giPath = path.join(projectRoot, '.gitignore');
  let existing = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';

  // Strip existing managed block
  const startIdx = existing.indexOf(GITIGNORE_MARKER_START);
  const endIdx = existing.indexOf(GITIGNORE_MARKER_END);
  if (startIdx !== -1 && endIdx !== -1) {
    existing = existing.slice(0, startIdx).trimEnd() + '\n' + existing.slice(endIdx + GITIGNORE_MARKER_END.length).trimStart();
  }

  const block = [
    GITIGNORE_MARKER_START,
    LEDGER_FILE,
    ...entries.map(e => e.replace(/\/$/, '')),
    GITIGNORE_MARKER_END,
  ].join('\n');

  const updated = existing.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(giPath, updated, 'utf8');
}

function updateGitattributes(projectRoot) {
  const gaPath = path.join(projectRoot, '.gitattributes');
  const line = '*.age binary -diff -merge';
  let existing = fs.existsSync(gaPath) ? fs.readFileSync(gaPath, 'utf8') : '';
  if (!existing.includes(line)) {
    existing = existing.trimEnd() + '\n' + line + '\n';
    fs.writeFileSync(gaPath, existing, 'utf8');
  }
}

function gitAdd(projectRoot, files) {
  if (!files.length) return;
  try {
    execFileSync('git', ['-C', projectRoot, 'add', '--', ...files], { stdio: 'ignore' });
  } catch {
    // not fatal — user can git add manually
  }
}

function stagedPlaintextGuard(projectRoot, plaintextEntries) {
  let staged;
  try {
    staged = execFileSync('git', ['-C', projectRoot, 'diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' });
  } catch {
    return; // not a git repo or no staged files
  }
  const stagedFiles = staged.split('\0').filter(Boolean);
  const dangerous = stagedFiles.filter(f => plaintextEntries.some(e => {
    const trimmed = e.replace(/\/$/, '');
    return f === trimmed || f.startsWith(trimmed + '/');
  }));
  if (dangerous.length > 0) {
    console.error('\n[crypt-sync] ABORT: Plaintext secret file(s) staged for commit:');
    dangerous.forEach(f => console.error(`  ${f}`));
    console.error('[crypt-sync] Run: crypt-sync lock && git add -p\n');
    process.exit(1);
  }
}

function installHooks(projectRoot) {
  const gitRoot = findGitRoot(projectRoot);
  if (!gitRoot) { console.error('Not a git repository.'); return; }

  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const templateDir = path.join(__dirname, '..', 'templates', 'hooks');
  const hooks = ['pre-commit', 'pre-push', 'post-merge', 'post-checkout'];

  for (const hook of hooks) {
    const dest = path.join(hooksDir, hook);
    const template = path.join(templateDir, hook);
    const content = fs.readFileSync(template, 'utf8');

    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, 'utf8');
      if (existing.includes('crypt-sync')) {
        console.log(`  hook ${hook}: already installed`);
        continue;
      }
      // Append to existing hook
      fs.appendFileSync(dest, '\n' + content);
      console.log(`  hook ${hook}: appended to existing hook`);
    } else {
      fs.writeFileSync(dest, content, { mode: 0o755 });
      console.log(`  hook ${hook}: installed`);
    }
  }
}

function uninstallHooks(projectRoot) {
  const gitRoot = findGitRoot(projectRoot);
  if (!gitRoot) { console.error('Not a git repository.'); return; }

  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  const SENTINEL_START = '# crypt-sync hook start';
  const SENTINEL_END = '# crypt-sync hook end';
  const hooks = ['pre-commit', 'pre-push', 'post-merge', 'post-checkout'];

  for (const hook of hooks) {
    const dest = path.join(hooksDir, hook);
    if (!fs.existsSync(dest)) continue;
    let content = fs.readFileSync(dest, 'utf8');
    const s = content.indexOf(SENTINEL_START);
    const e = content.indexOf(SENTINEL_END);
    if (s !== -1 && e !== -1) {
      content = content.slice(0, s).trimEnd() + '\n' + content.slice(e + SENTINEL_END.length).trimStart();
      fs.writeFileSync(dest, content);
      console.log(`  hook ${hook}: crypt-sync removed`);
    }
  }
}

module.exports = {
  findProjectRoot,
  findGitRoot,
  updateGitignore,
  updateGitattributes,
  gitAdd,
  stagedPlaintextGuard,
  installHooks,
  uninstallHooks,
};
