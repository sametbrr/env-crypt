'use strict';

const fs = require('fs');
const path = require('path');
const { findGitRoot } = require('../lib/git');

// Handles both old (env-crypt) and current (crypt-sync) sentinel styles
const SENTINEL_PAIRS = [
  { start: '# crypt-sync hook start', end: '# crypt-sync hook end' },
  { start: '# env-crypt hook start',  end: '# env-crypt hook end'  },
];

const HOOKS = ['pre-commit', 'pre-push', 'post-merge', 'post-checkout'];

function replaceBlock(existing, newContent) {
  for (const { start, end } of SENTINEL_PAIRS) {
    const s = existing.indexOf(start);
    const e = existing.indexOf(end);
    if (s !== -1 && e !== -1) {
      const before = existing.slice(0, s).trimEnd();
      const after = existing.slice(e + end.length).trimStart();
      const mid = newContent.trim();
      return (before ? before + '\n\n' : '') + mid + (after ? '\n\n' + after : '\n');
    }
  }
  return null; // no block found
}

async function run(args) {
  const gitRoot = findGitRoot(process.cwd());
  if (!gitRoot) {
    console.error('Error: not inside a git repository.');
    process.exit(1);
  }

  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const templateDir = path.join(__dirname, '..', 'templates', 'hooks');

  let updated = 0;
  let installed = 0;
  let appended = 0;

  for (const hook of HOOKS) {
    const dest = path.join(hooksDir, hook);
    const template = path.join(templateDir, hook);
    const newContent = fs.readFileSync(template, 'utf8');

    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, newContent, { mode: 0o755 });
      console.log(`  hook ${hook}: installed`);
      installed++;
      continue;
    }

    const existing = fs.readFileSync(dest, 'utf8');
    const replaced = replaceBlock(existing, newContent);

    if (replaced !== null) {
      fs.writeFileSync(dest, replaced);
      fs.chmodSync(dest, 0o755);
      console.log(`  hook ${hook}: updated`);
      updated++;
    } else {
      // No existing block — append
      fs.appendFileSync(dest, '\n' + newContent);
      console.log(`  hook ${hook}: appended`);
      appended++;
    }
  }

  console.log(`\nupdate-hooks: ${updated} updated, ${installed} installed, ${appended} appended`);
}

module.exports = { run };
