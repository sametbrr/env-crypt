'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAllFilesRelative } = require('./ledger');

function spawnPromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, opts);
    let stderr = '';
    if (proc.stderr) proc.stderr.on('data', d => { stderr += d; });
    let rejected = false;
    const fail = (msg) => { if (!rejected) { rejected = true; reject(new Error(msg)); } };
    proc.on('error', e => fail(`${cmd}: ${e.message}`));
    proc.on('close', code => {
      if (!rejected) {
        if (code === 0) resolve();
        else fail(`${cmd} exited ${code}${stderr ? ': ' + stderr.trim() : ''}`);
      }
    });
  });
}

async function encryptFile(src, dst, agePath, recipient) {
  const tmp = dst + '.cryptsync.tmp';
  try {
    await new Promise((resolve, reject) => {
      const gz = spawn('gzip', ['-c', '--', src]);
      const age = spawn(agePath, ['-r', recipient, '-o', tmp]);
      gz.stdout.pipe(age.stdin);
      let stderr = '';
      gz.stderr.on('data', d => { stderr += d; });
      age.stderr.on('data', d => { stderr += d; });
      let rejected = false;
      const fail = msg => { if (!rejected) { rejected = true; reject(new Error(msg)); } };
      gz.on('error', e => fail(`gzip: ${e.message}`));
      age.on('error', e => fail(`age: ${e.message}`));
      gz.on('close', code => { if (code !== 0) fail(`gzip exited ${code}`); });
      age.on('close', code => code === 0 ? resolve() : fail(`age exited ${code}: ${stderr.trim()}`));
    });
    fs.renameSync(tmp, dst);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

async function encryptDir(dirPath, dst, agePath, recipient) {
  const tmp = dst + '.cryptsync.tmp';
  const parentDir = path.dirname(dirPath);
  const dirName = path.basename(dirPath);
  const files = getAllFilesRelative(dirPath).sort();
  const tarPaths = files.map(f => path.join(dirName, f));

  if (tarPaths.length === 0) throw new Error(`Directory ${dirPath} is empty`);

  try {
    await new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-cf', '-', '-C', parentDir, ...tarPaths]);
      const gz = spawn('gzip', ['-n']); // -n: no gzip timestamps (more deterministic)
      const age = spawn(agePath, ['-r', recipient, '-o', tmp]);
      tar.stdout.pipe(gz.stdin);
      gz.stdout.pipe(age.stdin);
      let stderr = '';
      tar.stderr.on('data', d => { stderr += d; });
      gz.stderr.on('data', d => { stderr += d; });
      age.stderr.on('data', d => { stderr += d; });
      let rejected = false;
      const fail = msg => { if (!rejected) { rejected = true; reject(new Error(msg)); } };
      tar.on('error', e => fail(`tar: ${e.message}`));
      gz.on('error', e => fail(`gzip: ${e.message}`));
      age.on('error', e => fail(`age: ${e.message}`));
      tar.on('close', code => { if (code !== 0) fail(`tar exited ${code}: ${stderr.trim()}`); });
      gz.on('close', code => { if (code !== 0) fail(`gzip exited ${code}`); });
      age.on('close', code => code === 0 ? resolve() : fail(`age exited ${code}: ${stderr.trim()}`));
    });
    fs.renameSync(tmp, dst);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

async function decryptFile(src, dst, agePath, identityPath) {
  const tmp = dst + '.cryptsync.tmp';
  const dstDir = path.dirname(dst);
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true, mode: 0o700 });

  try {
    await new Promise((resolve, reject) => {
      const age = spawn(agePath, ['-d', '-i', identityPath, '--', src]);
      const gz = spawn('gunzip', ['-c']);
      const out = fs.createWriteStream(tmp, { mode: 0o600 });
      age.stdout.pipe(gz.stdin);
      gz.stdout.pipe(out);
      let stderr = '';
      age.stderr.on('data', d => { stderr += d; });
      gz.stderr.on('data', d => { stderr += d; });
      let rejected = false;
      const fail = msg => {
        if (!rejected) {
          rejected = true;
          out.destroy();
          try { fs.unlinkSync(tmp); } catch {}
          reject(new Error(msg));
        }
      };
      age.on('error', e => fail(`age: ${e.message}`));
      gz.on('error', e => fail(`gunzip: ${e.message}`));
      age.on('close', code => { if (code !== 0) fail(`age decrypt failed (wrong passphrase?): ${stderr.trim()}`); });
      gz.on('close', code => { if (code !== 0) fail(`gunzip exited ${code}`); });
      out.on('error', e => fail(e.message));
      out.on('finish', () => {
        if (!rejected) {
          try { fs.renameSync(tmp, dst); resolve(); }
          catch (e) { fail(e.message); }
        }
      });
    });
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

async function decryptDir(src, dirPath, agePath, identityPath) {
  const parentDir = path.dirname(dirPath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });

  await new Promise((resolve, reject) => {
    const age = spawn(agePath, ['-d', '-i', identityPath, '--', src]);
    const gz = spawn('gunzip', ['-c']);
    const tar = spawn('tar', ['-xf', '-', '-C', parentDir]);
    age.stdout.pipe(gz.stdin);
    gz.stdout.pipe(tar.stdin);
    let stderr = '';
    age.stderr.on('data', d => { stderr += d; });
    gz.stderr.on('data', d => { stderr += d; });
    tar.stderr.on('data', d => { stderr += d; });
    let rejected = false;
    const fail = msg => { if (!rejected) { rejected = true; reject(new Error(msg)); } };
    age.on('error', e => fail(`age: ${e.message}`));
    gz.on('error', e => fail(`gunzip: ${e.message}`));
    tar.on('error', e => fail(`tar: ${e.message}`));
    age.on('close', code => { if (code !== 0) fail(`age decrypt failed (wrong passphrase?): ${stderr.trim()}`); });
    gz.on('close', code => { if (code !== 0) fail(`gunzip exited ${code}`); });
    tar.on('close', code => code === 0 ? resolve() : fail(`tar extract failed: ${stderr.trim()}`));
  });
}

module.exports = { encryptFile, encryptDir, decryptFile, decryptDir };
