'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Fixed salt — changing this breaks all existing keys across machines.
// Domain separation from claude-sync so the two tools never share a key.
const SALT = crypto.createHash('sha256').update('crypt-sync-v1').digest();

// scrypt params → 64 MB memory, good resistance to brute force
const SCRYPT_OPTS = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = (chk & 0x1ffffff) << 5 ^ v;
    for (let i = 0; i < 5; i++) chk ^= ((top >> i) & 1) ? gen[i] : 0;
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  const r = [];
  for (const c of hrp) r.push(c.charCodeAt(0) >> 5);
  r.push(0);
  for (const c of hrp) r.push(c.charCodeAt(0) & 31);
  return r;
}

function bech32Checksum(hrp, data) {
  const vals = [...bech32HrpExpand(hrp), ...data];
  const poly = bech32Polymod([...vals, 0, 0, 0, 0, 0, 0]) ^ 1;
  return Array.from({ length: 6 }, (_, i) => (poly >> (5 * (5 - i))) & 31);
}

function convertBits(data, from, to, pad = true) {
  let acc = 0, bits = 0;
  const result = [];
  const maxv = (1 << to) - 1;
  const maxacc = (1 << (from + to - 1)) - 1;
  for (const v of data) {
    acc = ((acc << from) | v) & maxacc;
    bits += from;
    while (bits >= to) { bits -= to; result.push((acc >> bits) & maxv); }
  }
  if (pad && bits) result.push((acc << (to - bits)) & maxv);
  return result;
}

function bech32Encode(hrp, data) {
  const combined = [...data, ...bech32Checksum(hrp, data)];
  return hrp + '1' + combined.map(d => BECH32_CHARSET[d]).join('');
}

async function deriveIdentity(passphrase) {
  const raw = await new Promise((resolve, reject) => {
    crypto.scrypt(Buffer.from(passphrase, 'utf8'), SALT, 32, SCRYPT_OPTS, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });

  const key = Buffer.from(raw);
  // Clamp for X25519 (RFC 7748)
  key[0] &= 248;
  key[31] &= 127;
  key[31] |= 64;

  const hrp = 'age-secret-key-';
  const bits5 = convertBits(Array.from(key), 8, 5, true);
  return bech32Encode(hrp, bits5).toUpperCase();
}

function saveIdentity(identityStr, identityPath) {
  fs.mkdirSync(path.dirname(identityPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(identityPath, identityStr + '\n', { mode: 0o600 });
}

module.exports = { deriveIdentity, saveIdentity };
