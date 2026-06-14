'use strict';

const fs = require('fs');
const path = require('path');
const { MANIFEST_FILE } = require('./config');

// Convert a glob pattern to a RegExp.
// Supports: * (single segment), ** (any depth), ? (single char)
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const rx = escaped
    .replace(/\*\*/g, '\x00STAR2\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\x00STAR2\x00/g, '.*');
  return new RegExp('^' + rx + '$');
}

function hasGlob(pattern) {
  return pattern.includes('*') || pattern.includes('?');
}

// Expand a single glob pattern against the project filesystem.
// Returns a list of relative paths (files keep their name, dirs get trailing /).
// Gitignore-style: if pattern has no '/' and no glob chars,
// treat it as a basename pattern — walk the tree and return all matching paths.
function expandBasename(projectRoot, name) {
  const results = [];
  function walk(dir, prefix) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules' || entry === 'vendor') continue;
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (entry === name) {
        results.push(stat.isDirectory() ? rel + '/' : rel);
      }
      if (stat.isDirectory()) walk(full, rel);
    }
  }
  walk(projectRoot, '');
  // Fall back to literal path if nothing found (file may not exist yet)
  return results.length > 0 ? results : [name];
}

function expandPattern(projectRoot, pattern) {
  // Gitignore-style: no slash, no glob → basename match anywhere in tree
  if (!hasGlob(pattern) && !pattern.includes('/') && !pattern.endsWith('/')) {
    return expandBasename(projectRoot, pattern);
  }

  if (!hasGlob(pattern)) return [pattern];

  // `dir/**` → treat `dir` as a directory unit, not individual files
  if (pattern.endsWith('/**')) {
    const dirEntry = pattern.slice(0, -3) + '/';
    const full = path.join(projectRoot, pattern.slice(0, -3));
    return fs.existsSync(full) && fs.statSync(full).isDirectory() ? [dirEntry] : [];
  }

  const trimmed = pattern.replace(/\/$/, '');
  const regex = globToRegex(trimmed);
  const results = [];

  function walk(dir, prefix) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules') continue;
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (regex.test(rel)) {
        results.push(stat.isDirectory() ? rel + '/' : rel);
      }
      if (stat.isDirectory()) walk(full, rel);
    }
  }

  walk(projectRoot, '');
  return results;
}

function readManifest(projectRoot) {
  const p = path.join(projectRoot, MANIFEST_FILE);
  if (!fs.existsSync(p)) return [];

  const raw = fs.readFileSync(p, 'utf8')
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .filter(l => {
      if (path.isAbsolute(l)) return false;
      // Basename patterns (no slash, no glob) are always safe — expandBasename
      // does its own tree walk and never leaves the project root.
      if (!l.includes('/') && !hasGlob(l)) return true;
      // For everything else: resolve and verify it stays within project root.
      const resolved = path.resolve(projectRoot, l.replace(/\/$/, ''));
      return resolved === projectRoot || resolved.startsWith(projectRoot + path.sep);
    });

  // Expand globs; deduplicate while preserving order
  const seen = new Set();
  const entries = [];
  for (const pattern of raw) {
    for (const resolved of expandPattern(projectRoot, pattern)) {
      if (!seen.has(resolved)) {
        seen.add(resolved);
        entries.push(resolved);
      }
    }
  }
  return entries;
}

// Entry kind: file entries end with no slash (resolved by checking disk),
// dir entries end with / or are a directory on disk.
function entryKind(projectRoot, entry) {
  if (entry.endsWith('/')) return 'dir';
  const full = path.join(projectRoot, entry);
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return 'dir';
  return 'file';
}

// .env → .env.age
// docs/ → docs.cryptsync.tar.age
function artifactFor(entry) {
  const trimmed = entry.replace(/\/$/, '');
  if (entry.endsWith('/') || !entry.includes('.') && false) {
    return trimmed + '.cryptsync.tar.age';
  }
  // Detect if it's meant to be a dir entry (ends with /)
  // or if on disk it's a dir — handled at call time with entryKind
  // artifact name is determined by whether it maps to a dir or file
  return trimmed + '.age';
}

function artifactForKind(entry, kind) {
  const trimmed = entry.replace(/\/$/, '');
  if (kind === 'dir') return trimmed + '.cryptsync.tar.age';
  return trimmed + '.age';
}

module.exports = { readManifest, entryKind, artifactFor, artifactForKind };
