#!/usr/bin/env node
'use strict';

const COMMANDS = {
  init:         () => require('../cmd/init'),
  setup:        () => require('../cmd/setup'),
  lock:         () => require('../cmd/lock'),
  unlock:       () => require('../cmd/unlock'),
  status:       () => require('../cmd/status'),
  clean:        () => require('../cmd/clean'),
  'export-key': () => require('../cmd/export-key'),
  'import-key':    () => require('../cmd/import-key'),
  'update-hooks':  () => require('../cmd/update-hooks'),
  guard:           () => require('../cmd/guard'),
  configured:   () => ({ run: async () => {
    const fs = require('fs');
    const { IDENTITY_FILE } = require('../lib/config');
    if (!fs.existsSync(IDENTITY_FILE)) process.exit(1);
  }}),
};

const USAGE = `
crypt-sync — encrypt secrets for git sync across machines

Usage: crypt-sync <command> [options]

Commands:
  init              Derive encryption identity from passphrase (run once per machine)
  setup             Configure a project: create .cryptsync, install git hooks
  lock [--no-add]   Encrypt changed entries, update .gitignore, git-add blobs
    --wipe          Also delete plaintext after encrypting
  unlock [--force]  Decrypt all blobs → plaintext
  status            Show encryption state for all entries
  clean             Remove orphan .age blobs not in manifest
  export-key <path> Export identity key to a file (keep it safe!)
  import-key <path> Import identity key from a file
  update-hooks      Update git hooks to the current version (run after npm update)

Options:
  --force     Override safety checks (overwrite existing, force re-encrypt)
  --no-add    lock: skip git add (useful in hooks)
  --all       lock: re-encrypt all entries regardless of ledger
  --wipe      lock: delete plaintext after encrypting
  --quiet     Suppress non-error output

.cryptsync supports glob patterns:
  .env*             matches .env, .env.local, .env.production
  *.pem             matches all .pem files in project root
  secrets/**        treats secrets/ as a single encrypted archive
  config/*.json     matches json files in config/ (not subdirs)

Automatic:
  git commit →  pre-commit hook aborts if plaintext is staged
  git push   →  pre-push hook encrypts changed files before pushing
  git pull   →  post-merge hook decrypts files after pulling
`.trim();

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const cmdArgs = args.slice(1);

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  if (cmd === '--version' || cmd === 'version') {
    const pkg = require('../package.json');
    console.log(`crypt-sync ${pkg.version}`);
    process.exit(0);
  }

  const loader = COMMANDS[cmd];
  if (!loader) {
    console.error(`Unknown command: ${cmd}`);
    console.error(`Run "crypt-sync --help" for usage.`);
    process.exit(1);
  }

  try {
    await loader().run(cmdArgs);
  } catch (err) {
    console.error(`[crypt-sync] Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
