'use strict';

const fs = require('fs');
const { IDENTITY_FILE } = require('../lib/config');
const { readManifest } = require('../lib/manifest');
const { findProjectRoot, stagedPlaintextGuard } = require('../lib/git');

async function run(args) {
  if (!fs.existsSync(IDENTITY_FILE)) process.exit(0); // not initialized → skip

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) process.exit(0);

  const entries = readManifest(projectRoot);
  if (entries.length === 0) process.exit(0);

  stagedPlaintextGuard(projectRoot, entries); // exits 1 if dangerous files staged
}

module.exports = { run };
