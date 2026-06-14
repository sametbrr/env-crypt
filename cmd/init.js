'use strict';

const fs = require('fs');
const { IDENTITY_FILE, CONFIG_DIR } = require('../lib/config');
const { deriveIdentity, saveIdentity } = require('../lib/key');
const { getAgekeygenPath, getRecipient } = require('../lib/age');
const { readPassword } = require('../lib/ui');

async function run(args) {
  const force = args.includes('--force');

  if (fs.existsSync(IDENTITY_FILE) && !force) {
    const { getRecipient: gr } = require('../lib/age');
    const recipient = gr(IDENTITY_FILE);
    console.log('Identity already exists.');
    console.log(`  Recipient: ${recipient}`);
    console.log('  Use --force to overwrite.');
    return;
  }

  console.log('crypt-sync init — derive encryption identity from passphrase\n');
  console.log('The passphrase is the ONLY secret. The same passphrase on any machine');
  console.log('derives the same age key, so no key file needs to be copied.\n');

  const pass1 = await readPassword('Passphrase (min 8 chars): ');
  if (pass1.length < 8) {
    console.error('Error: passphrase must be at least 8 characters.');
    process.exit(1);
  }
  const pass2 = await readPassword('Confirm passphrase: ');
  if (pass1 !== pass2) {
    console.error('Error: passphrases do not match.');
    process.exit(1);
  }

  process.stdout.write('\nDeriving identity (this takes ~1 second)...');
  const identity = await deriveIdentity(pass1);
  process.stdout.write(' done.\n');

  saveIdentity(identity, IDENTITY_FILE);

  const recipient = getRecipient(IDENTITY_FILE);
  console.log(`\nIdentity saved to: ${IDENTITY_FILE}`);
  console.log(`Recipient (public key): ${recipient}`);
  console.log('\nOn each new machine: run "crypt-sync init" with the same passphrase.');
}

module.exports = { run };
