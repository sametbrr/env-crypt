'use strict';

const fs = require('fs');
const path = require('path');
const { readManifest, entryKind, artifactForKind } = require('../lib/manifest');
const { readLedger, writeLedger } = require('../lib/ledger');
const { findProjectRoot, gitAdd } = require('../lib/git');

async function run(args) {
  const purgePlaintext = args.includes('--purge-plaintext');

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error('Error: no .cryptsync found.');
    process.exit(1);
  }

  const entries = readManifest(projectRoot);
  const manifestArtifacts = new Set(
    entries.map(e => artifactForKind(e, entryKind(projectRoot, e)))
  );

  // Find all .age files in project
  const allAgeFiles = findAgeFiles(projectRoot);
  const orphans = allAgeFiles.filter(f => !manifestArtifacts.has(f));

  if (orphans.length === 0) {
    console.log('Nothing to clean.');
    return;
  }

  for (const orphan of orphans) {
    const full = path.join(projectRoot, orphan);
    fs.unlinkSync(full);
    console.log(`  removed: ${orphan}`);
  }

  // Remove orphan entries from ledger
  const ledger = readLedger(projectRoot);
  for (const entry of Object.keys(ledger.entries)) {
    if (!entries.includes(entry)) {
      delete ledger.entries[entry];
    }
  }
  writeLedger(projectRoot, ledger);

  // git rm orphans
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['-C', projectRoot, 'rm', '--cached', '--ignore-unmatch', '--', ...orphans], { stdio: 'ignore' });
  } catch {}

  if (purgePlaintext) {
    for (const entry of Object.keys(ledger.entries)) {
      if (!entries.includes(entry)) {
        const fullPath = path.join(projectRoot, entry.replace(/\/$/, ''));
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true });
          console.log(`  purged plaintext: ${entry}`);
        }
      }
    }
  }

  console.log(`\nCleaned ${orphans.length} orphan blob(s).`);
}

function findAgeFiles(projectRoot) {
  const results = [];
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir).sort()) {
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
