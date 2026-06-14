'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { IDENTITY_FILE } = require('../lib/config');
const { getAgePath } = require('../lib/age');
const { readManifest, entryKind, artifactForKind } = require('../lib/manifest');
const { readLedger, writeLedger, computeHash } = require('../lib/ledger');
const { decryptFile, decryptDir } = require('../lib/crypto');
const { findProjectRoot } = require('../lib/git');

async function run(args) {
  const force = args.includes('--force');
  const quiet = args.includes('--quiet');
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
    log('Nothing to unlock (.cryptsync is empty).');
    return;
  }

  const agePath = getAgePath();
  const ledger = readLedger(projectRoot);

  let unlocked = 0;
  let skipped = 0;

  for (const entry of entries) {
    const trimmed = entry.replace(/\/$/, '');
    const fullPath = path.join(projectRoot, trimmed);
    const kind = entryKind(projectRoot, entry);
    const artifact = artifactForKind(entry, kind);
    const artifactPath = path.join(projectRoot, artifact);

    if (!fs.existsSync(artifactPath)) {
      if (fs.existsSync(fullPath)) {
        log(`  not locked: ${entry}  (plaintext exists — run: crypt-sync lock)`);
      } else {
        log(`  missing: ${artifact}  (not in git — lock and push from source machine)`);
      }
      skipped++;
      continue;
    }

    // Detect locally-modified plaintext
    if (!force && fs.existsSync(fullPath)) {
      const currentHash = computeHash(fullPath);
      const ledgerEntry = ledger.entries[entry];
      if (ledgerEntry && currentHash !== ledgerEntry.hash) {
        console.warn(`  warn: ${entry} has local changes (use --force to overwrite with blob)`);
        skipped++;
        continue;
      }
    }

    process.stdout.write(`  unlocking ${entry}...`);
    try {
      if (kind === 'dir') {
        await decryptDir(artifactPath, fullPath, agePath, IDENTITY_FILE);
      } else {
        await decryptFile(artifactPath, fullPath, agePath, IDENTITY_FILE);
      }

      const newHash = computeHash(fullPath);
      ledger.entries[entry] = { ...ledger.entries[entry], hash: newHash, artifact };
      process.stdout.write(' done\n');
      unlocked++;
    } catch (err) {
      process.stdout.write(' FAILED\n');
      console.error(`  error: ${err.message}`);
    }
  }

  writeLedger(projectRoot, ledger);
  if (!quiet) {
    console.log(`\nunlock: ${unlocked} decrypted, ${skipped} skipped`);
  }
}

module.exports = { run };
