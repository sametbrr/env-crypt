'use strict';

const fs = require('fs');
const path = require('path');
const { IDENTITY_FILE, CONFIG_DIR } = require('../lib/config');
const { getRecipient } = require('../lib/age');

async function run(args) {
  const src = args.find(a => !a.startsWith('-'));
  const force = args.includes('--force');

  if (!src) {
    console.error('Usage: crypt-sync import-key <key-file>');
    console.error('Example: crypt-sync import-key ~/backup/crypt-sync.key');
    process.exit(1);
  }

  const srcPath = path.resolve(src);
  if (!fs.existsSync(srcPath)) {
    console.error(`Error: key file not found: ${srcPath}`);
    process.exit(1);
  }

  if (fs.existsSync(IDENTITY_FILE) && !force) {
    const existing = getRecipient(IDENTITY_FILE);
    console.error('Error: identity already exists.');
    console.error(`  Existing recipient: ${existing}`);
    console.error('  Use --force to overwrite.');
    process.exit(1);
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.copyFileSync(srcPath, IDENTITY_FILE);
  fs.chmodSync(IDENTITY_FILE, 0o600);

  const recipient = getRecipient(IDENTITY_FILE);
  console.log(`Key imported to: ${IDENTITY_FILE}`);
  console.log(`Recipient: ${recipient}`);
  console.log('\nRun "crypt-sync unlock" to decrypt your files.');
}

module.exports = { run };
