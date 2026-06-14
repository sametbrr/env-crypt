'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { VENDOR_DIR } = require('./config');

function getAgePath() {
  const bin = process.platform === 'win32' ? 'age.exe' : 'age';
  const vendored = path.join(VENDOR_DIR, bin);
  if (fs.existsSync(vendored)) return vendored;
  // Fallback: system age
  try { execFileSync('age', ['--version'], { stdio: 'ignore' }); return 'age'; } catch {}
  throw new Error('age binary not found. Run: npm install -g crypt-sync (to re-run postinstall)');
}

function getAgekeygenPath() {
  const bin = process.platform === 'win32' ? 'age-keygen.exe' : 'age-keygen';
  const vendored = path.join(VENDOR_DIR, bin);
  if (fs.existsSync(vendored)) return vendored;
  try { execFileSync('age-keygen', ['--version'], { stdio: 'ignore' }); return 'age-keygen'; } catch {}
  throw new Error('age-keygen binary not found.');
}

function getRecipient(identityPath) {
  const agekeygen = getAgekeygenPath();
  const out = execFileSync(agekeygen, ['-y', identityPath], { encoding: 'utf8' });
  return out.trim();
}

module.exports = { getAgePath, getAgekeygenPath, getRecipient };
