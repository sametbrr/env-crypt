#!/usr/bin/env node
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const os = require('os');

const AGE_VERSION = 'v1.3.1';
const PACKAGE_ROOT = path.join(__dirname, '..');
const VENDOR_DIR = path.join(PACKAGE_ROOT, 'vendor');


const PLATFORM_MAP = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64':   'darwin-amd64',
  'linux-x64':    'linux-amd64',
  'linux-arm64':  'linux-arm64',
  'win32-x64':    'windows-amd64',
};

function getPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function getArchiveName(platformKey) {
  const agePlatform = PLATFORM_MAP[platformKey];
  if (!agePlatform) return null;
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  return `age-${AGE_VERSION}-${agePlatform}${ext}`;
}

function getDownloadUrl(archiveName) {
  return `https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/${archiveName}`;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = (u) => {
      https.get(u, { headers: { 'User-Agent': 'crypt-sync-installer' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return req(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    req(url);
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    const req = (u) => {
      https.get(u, { headers: { 'User-Agent': 'crypt-sync-installer' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return req(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = '';
        res.setEncoding('utf8');
        res.on('data', d => { data += d; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    };
    req(url);
  });
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function verifyChecksum(archivePath, archiveName, version) {
  const checksumsUrl = `https://github.com/FiloSottile/age/releases/download/${version}/checksums`;
  let checksumsText;
  try {
    checksumsText = await downloadText(checksumsUrl);
  } catch {
    // checksum file unavailable — warn but don't hard-fail (network may be restricted)
    process.stderr.write('[crypt-sync] Warning: could not fetch checksums file, skipping verification.\n');
    return;
  }

  // Line format: "<sha256>  <filename>"
  const line = checksumsText.split('\n').find(l => l.includes(archiveName));
  if (!line) {
    throw new Error(`Checksum for ${archiveName} not found in checksums file.`);
  }
  const expected = line.trim().split(/\s+/)[0];
  const actual = sha256File(archivePath);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${archiveName}!\n  Expected: ${expected}\n  Got:      ${actual}\n  ABORTING — the downloaded file may be corrupted or tampered with.`);
  }
}

async function install() {
  const platformKey = getPlatformKey();
  const archiveName = getArchiveName(platformKey);

  if (!archiveName) {
    console.warn(`[crypt-sync] Unsupported platform: ${platformKey}. Install age manually and add to PATH.`);
    return;
  }

  const ageBin = process.platform === 'win32' ? 'age.exe' : 'age';
  const agekeygen = process.platform === 'win32' ? 'age-keygen.exe' : 'age-keygen';
  const ageDest = path.join(VENDOR_DIR, ageBin);
  const agekeygenDest = path.join(VENDOR_DIR, agekeygen);

  if (fs.existsSync(ageDest) && fs.existsSync(agekeygenDest)) {
    return; // already installed
  }

  if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });

  const url = getDownloadUrl(archiveName);
  const archivePath = path.join(os.tmpdir(), archiveName);

  process.stdout.write(`[crypt-sync] Downloading age ${AGE_VERSION} for ${platformKey}...\n`);

  try {
    await download(url, archivePath);
    await verifyChecksum(archivePath, archiveName, AGE_VERSION);

    if (archiveName.endsWith('.tar.gz')) {
      execFileSync('tar', ['-xzf', archivePath, '-C', VENDOR_DIR, '--strip-components=1'], { stdio: 'ignore' });
    } else {
      // Windows zip
      const extractDir = path.join(os.tmpdir(), 'age-extracted');
      execFileSync('powershell', [
        '-Command',
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${extractDir}" -Force`,
      ], { stdio: 'ignore' });
      fs.copyFileSync(path.join(extractDir, 'age', ageBin), ageDest);
      fs.copyFileSync(path.join(extractDir, 'age', agekeygen), agekeygenDest);
    }

    if (process.platform !== 'win32') {
      fs.chmodSync(ageDest, 0o755);
      fs.chmodSync(agekeygenDest, 0o755);
    }

    try { fs.unlinkSync(archivePath); } catch {}

    process.stdout.write(`[crypt-sync] age ${AGE_VERSION} ready.\n`);
  } catch (err) {
    console.warn(`[crypt-sync] Could not download age: ${err.message}`);
    console.warn(`[crypt-sync] Install age manually: https://github.com/FiloSottile/age/releases`);
  }
}

install();
