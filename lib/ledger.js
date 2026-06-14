'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LEDGER_FILE } = require('./config');

function readLedger(projectRoot) {
  const p = path.join(projectRoot, LEDGER_FILE);
  if (!fs.existsSync(p)) return { version: 1, entries: {} };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeLedger(projectRoot, ledger) {
  const p = path.join(projectRoot, LEDGER_FILE);
  fs.writeFileSync(p, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
}

function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getAllFilesRelative(dirpath) {
  const results = [];
  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir).sort();
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const stat = fs.statSync(full);
      if (stat.isSymbolicLink()) continue; // skip symlinks
      if (stat.isDirectory()) {
        walk(full, rel);
      } else if (stat.isFile()) {
        results.push(rel);
      }
    }
  }
  walk(dirpath, '');
  return results;
}

function hashDir(dirpath) {
  const h = crypto.createHash('sha256');
  const files = getAllFilesRelative(dirpath);
  for (const rel of files) {
    h.update(rel + '\0');
    h.update(fs.readFileSync(path.join(dirpath, rel)));
  }
  return h.digest('hex');
}

function computeHash(fullPath) {
  const stat = fs.statSync(fullPath);
  return stat.isDirectory() ? hashDir(fullPath) : hashFile(fullPath);
}

function isChanged(entry, hash, ledger) {
  const stored = ledger.entries[entry];
  return !stored || stored.hash !== hash;
}

module.exports = {
  readLedger,
  writeLedger,
  computeHash,
  hashFile,
  hashDir,
  getAllFilesRelative,
  isChanged,
};
