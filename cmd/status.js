'use strict';

const fs = require('fs');
const path = require('path');
const { IDENTITY_FILE } = require('../lib/config');
const { getRecipient } = require('../lib/age');
const { readManifest, entryKind, artifactForKind } = require('../lib/manifest');
const { readLedger, computeHash } = require('../lib/ledger');
const { findProjectRoot } = require('../lib/git');

const STATE_SYMBOLS = {
  clean:          '✓',
  modified:       '~',
  not_locked:     '?',
  blob_missing:   '!',
  both_missing:   'x',
};

async function run(args) {
  if (!fs.existsSync(IDENTITY_FILE)) {
    console.log('Identity: NOT INITIALIZED — run "crypt-sync init"');
  } else {
    const recipient = getRecipient(IDENTITY_FILE);
    console.log(`Identity: ${IDENTITY_FILE}`);
    console.log(`Recipient: ${recipient}`);
  }

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.log('\nNo .cryptsync found in this directory or any parent.');
    return;
  }

  console.log(`\nProject: ${projectRoot}`);

  const entries = readManifest(projectRoot);
  if (entries.length === 0) {
    console.log('.cryptsync is empty.');
    return;
  }

  const ledger = readLedger(projectRoot);
  let hasDrift = false;

  console.log('\nEntries:');
  for (const entry of entries) {
    const trimmed = entry.replace(/\/$/, '');
    const fullPath = path.join(projectRoot, trimmed);
    const kind = entryKind(projectRoot, entry);
    const artifact = artifactForKind(entry, kind);
    const artifactPath = path.join(projectRoot, artifact);
    const plainExists = fs.existsSync(fullPath);
    const blobExists = fs.existsSync(artifactPath);
    const ledgerEntry = ledger.entries[entry];

    let state, note;
    if (!plainExists && !blobExists) {
      state = 'both_missing'; note = 'plaintext and blob both missing';
    } else if (!blobExists) {
      state = 'blob_missing'; note = 'not locked yet';
    } else if (!plainExists) {
      state = 'blob_missing'; note = 'plaintext missing (run unlock)'; // blob exists, plain doesn't
    } else if (!ledgerEntry) {
      state = 'not_locked'; note = 'never locked in this ledger';
    } else {
      const currentHash = computeHash(fullPath);
      if (currentHash !== ledgerEntry.hash) {
        state = 'modified'; note = 'modified since last lock'; hasDrift = true;
      } else {
        state = 'clean';
      }
    }

    const sym = STATE_SYMBOLS[state] || '?';
    const noteStr = note ? `  (${note})` : '';
    console.log(`  ${sym} ${entry}  →  ${artifact}${noteStr}`);
  }

  // Check for orphan blobs
  const manifestArtifacts = new Set(
    entries.map(e => artifactForKind(e, entryKind(projectRoot, e)))
  );
  const allAgeFiles = findAgeFiles(projectRoot);
  const orphans = allAgeFiles.filter(f => !manifestArtifacts.has(f));
  if (orphans.length > 0) {
    console.log('\nOrphan blobs (not in manifest):');
    orphans.forEach(f => console.log(`  ! ${f}  (run: crypt-sync clean)`));
  }

  if (hasDrift) {
    console.log('\nRun "crypt-sync lock" to encrypt modified entries.');
    process.exit(1); // non-zero for CI/hook use
  }
}

function findAgeFiles(projectRoot) {
  const results = [];
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (entry === 'node_modules' || entry === '.git') continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full, rel);
      else if (entry.endsWith('.age')) results.push(rel);
    }
  }
  walk(projectRoot, '');
  return results;
}

module.exports = { run };
