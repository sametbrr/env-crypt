'use strict';

const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'crypt-sync'
);
const IDENTITY_FILE = path.join(CONFIG_DIR, 'identity.txt');
const PACKAGE_ROOT = path.join(__dirname, '..');
const VENDOR_DIR = path.join(PACKAGE_ROOT, 'vendor');
const MANIFEST_FILE = '.cryptsync';
const LEDGER_FILE = '.cryptsync.state';
const GITIGNORE_MARKER_START = '# crypt-sync managed — do not edit this block';
const GITIGNORE_MARKER_END = '# end crypt-sync managed';

module.exports = {
  CONFIG_DIR,
  IDENTITY_FILE,
  PACKAGE_ROOT,
  VENDOR_DIR,
  MANIFEST_FILE,
  LEDGER_FILE,
  GITIGNORE_MARKER_START,
  GITIGNORE_MARKER_END,
};
