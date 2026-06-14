'use strict';

const fs = require('fs');
const path = require('path');
const { IDENTITY_FILE } = require('../lib/config');
const { getRecipient } = require('../lib/age');

async function run(args) {
  const dest = args.find(a => !a.startsWith('-'));

  if (!fs.existsSync(IDENTITY_FILE)) {
    console.error('Error: identity not found. Run "crypt-sync init" first.');
    process.exit(1);
  }

  if (!dest) {
    console.error('Usage: crypt-sync export-key <output-path>');
    console.error('Example: crypt-sync export-key ~/backup/crypt-sync.key');
    process.exit(1);
  }

  const destPath = path.resolve(dest);
  fs.copyFileSync(IDENTITY_FILE, destPath);
  fs.chmodSync(destPath, 0o600);

  const recipient = getRecipient(IDENTITY_FILE);
  console.log(`Key exported to: ${destPath}`);
  console.log(`Recipient: ${recipient}`);
  console.warn('\nWARNING: This file contains your private key.');
  console.warn('Store it securely (encrypted USB, password manager, etc.).');
  console.warn('Anyone with this file can decrypt your secrets.');
}

module.exports = { run };
