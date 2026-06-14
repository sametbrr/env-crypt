'use strict';

const fs = require('fs');
const path = require('path');
const { IDENTITY_FILE } = require('../lib/config');
const { getAgePath, getRecipient } = require('../lib/age');
const { readManifest, entryKind, artifactForKind } = require('../lib/manifest');
const { readLedger, writeLedger, computeHash, isChanged } = require('../lib/ledger');
const { encryptFile, encryptDir } = require('../lib/crypto');
const { findProjectRoot, updateGitignore, updateGitattributes, gitAdd, stagedPlaintextGuard } = require('../lib/git');

async function run(args) {
  const noAdd = args.includes('--no-add');
  const forceAll = args.includes('--all');
  const quiet = args.includes('--quiet');
  const wipe = args.includes('--wipe');
  const log = quiet ? () => {} : console.log.bind(console);

  if (!fs.existsSync(IDENTITY_FILE)) {
    console.error('Error: identity not found. Run "crypt-sync init" first.');
    process.exit(1);
  }

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error('Error: no .cryptsync file found in this directory or any parent.');
    process.exit(1);
  }

  const entries = readManifest(projectRoot);
  if (entries.length === 0) {
    console.error('Error: .cryptsync is empty. Add file paths to encrypt.');
    process.exit(1);
  }

  // Guard: abort if any managed plaintext is staged
  stagedPlaintextGuard(projectRoot, entries);

  const agePath = getAgePath();
  const recipient = getRecipient(IDENTITY_FILE);
  const ledger = readLedger(projectRoot);

  let locked = 0;
  let skipped = 0;
  const artifacts = [];

  for (const entry of entries) {
    const fullPath = path.join(projectRoot, entry.replace(/\/$/, ''));

    if (!fs.existsSync(fullPath)) {
      console.warn(`  warn: ${entry} does not exist, skipping`);
      continue;
    }

    const kind = entryKind(projectRoot, entry);
    const artifact = artifactForKind(entry, kind);
    const artifactPath = path.join(projectRoot, artifact);
    artifacts.push(artifact);

    const hash = computeHash(fullPath);
    const artifactMissing = !fs.existsSync(artifactPath);

    if (!forceAll && !isChanged(entry, hash, ledger) && !artifactMissing) {
      log(`  unchanged: ${entry}`);
      skipped++;
      continue;
    }

    process.stdout.write(`  locking ${entry}...`);
    try {
      if (kind === 'dir') {
        await encryptDir(fullPath, artifactPath, agePath, recipient);
      } else {
        await encryptFile(fullPath, artifactPath, agePath, recipient);
      }
      ledger.entries[entry] = { hash, artifact, locked_at: new Date().toISOString() };
      if (wipe) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        process.stdout.write(' done (plaintext wiped)\n');
      } else {
        process.stdout.write(' done\n');
      }
      locked++;
    } catch (err) {
      process.stdout.write(' FAILED\n');
      console.error(`  error: ${err.message}`);
    }
  }

  updateGitignore(projectRoot, entries);
  updateGitattributes(projectRoot);
  writeLedger(projectRoot, ledger);

  if (!noAdd) {
    const toAdd = [
      '.cryptsync',
      '.gitignore',
      '.gitattributes',
      ...artifacts.filter(a => fs.existsSync(path.join(projectRoot, a))),
    ];
    gitAdd(projectRoot, toAdd);
  }

  if (!quiet) {
    console.log(`\nlock: ${locked} encrypted, ${skipped} unchanged`);
  }
}

module.exports = { run };
