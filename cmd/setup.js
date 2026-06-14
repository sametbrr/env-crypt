'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MANIFEST_FILE, IDENTITY_FILE } = require('../lib/config');
const { findGitRoot, installHooks } = require('../lib/git');
const { run: lock } = require('./lock');

const SECRET_PATTERNS = [
  /^\.env(\.|$)/i,
  /\.(pem|key|p12|pfx|cer|crt|jks|keystore)$/i,
  /^(secrets?|private|credentials?|auth|token)([\s\-_./]|$)/i,
];

const SKIP_NAMES = new Set([
  '.git', 'node_modules', 'vendor',
  MANIFEST_FILE, '.cryptsync.state',
  '.gitignore', '.gitattributes',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store',
]);

const SKIP_EXTENSIONS = new Set(['.age', '.md', '.lock', '.log']);

function isLikelySecret(name) {
  return SECRET_PATTERNS.some(p => p.test(name));
}

function shouldSkip(name) {
  if (SKIP_NAMES.has(name)) return true;
  if (SKIP_EXTENSIONS.has(path.extname(name))) return true;
  return false;
}

function walkTree(projectRoot, relDir) {
  const absDir = relDir ? path.join(projectRoot, relDir) : projectRoot;
  let entries;
  try { entries = fs.readdirSync(absDir); } catch { return []; }

  const results = [];
  for (const name of entries) {
    if (shouldSkip(name)) continue;
    const relPath = relDir ? `${relDir}/${name}` : name;
    const absPath = path.join(absDir, name);
    let stat;
    try { stat = fs.statSync(absPath); } catch { continue; }
    if (stat.isDirectory()) {
      results.push(...walkTree(projectRoot, relPath));
    } else if (isLikelySecret(name)) {
      results.push(relPath);
    }
  }
  return results;
}

function groupByBasename(files) {
  const map = new Map();
  for (const f of files) {
    const base = path.basename(f);
    if (!map.has(base)) map.set(base, []);
    map.get(base).push(f);
  }
  return map;
}

function listDirectory(projectRoot, relDir) {
  const absDir = relDir ? path.join(projectRoot, relDir) : projectRoot;
  let entries;
  try { entries = fs.readdirSync(absDir); } catch { return { files: [], dirs: [] }; }

  const files = [];
  const dirs = [];
  for (const name of entries) {
    if (shouldSkip(name)) continue;
    const relPath = relDir ? `${relDir}/${name}` : name;
    const absPath = path.join(absDir, name);
    let stat;
    try { stat = fs.statSync(absPath); } catch { continue; }
    if (stat.isDirectory()) {
      dirs.push({ name, relPath });
    } else {
      files.push({ name, relPath, secret: isLikelySecret(name) });
    }
  }
  files.sort((a, b) => (a.secret === b.secret ? a.name.localeCompare(b.name) : a.secret ? -1 : 1));
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  return { files, dirs };
}

function isSelected(relPath, selected) {
  for (const s of selected) {
    if (s === relPath) return true;
    if (!s.includes('/') && path.basename(relPath) === s) return true;
  }
  return false;
}

function patternCovers(pattern, entry) {
  if (pattern === entry) return false; // same entry, not "covered by other"
  if (!pattern.includes('/')) {
    return path.basename(entry) === pattern;
  }
  const pt = pattern.replace(/\/$/, '');
  return entry === pt || entry.startsWith(pt + '/');
}

function removeRedundant(entries) {
  return entries.filter(e =>
    !entries.some(other => other !== e && patternCovers(other, e))
  );
}

function makeReader(rl) {
  const queue = [];
  const waiters = [];
  let closed = false;

  rl.on('line', line => {
    if (waiters.length > 0) {
      waiters.shift()(line);
    } else {
      queue.push(line);
    }
  });

  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()('');
  });

  function ask(prompt) {
    process.stdout.write(prompt);
    if (queue.length > 0) return Promise.resolve(queue.shift());
    if (closed) return Promise.resolve('');
    return new Promise(resolve => waiters.push(resolve));
  }

  return { ask };
}

function displayDir(projectRoot, currentDir, groups, selected) {
  const displayPath = currentDir ? currentDir + '/' : '/';
  console.log(`\nDizin: \x1b[1m${displayPath}\x1b[0m`);
  console.log('─'.repeat(52));

  const { files, dirs } = listDirectory(projectRoot, currentDir);

  const fileItems = [];
  let idx = 1;

  for (const f of files) {
    const check = isSelected(f.relPath, selected) ? '\x1b[32m✓\x1b[0m' : ' ';
    const secretTag = f.secret ? ' \x1b[33m← secret?\x1b[0m' : '';
    const group = groups.get(f.name);
    const groupHint = (group && group.length > 1)
      ? `\x1b[90m  (${group.length} yerde — "${f.name}" pattern hepsini kapsar)\x1b[0m`
      : '';
    console.log(`  ${check} ${String(idx).padStart(2)}.  ${f.relPath}${secretTag}`);
    if (groupHint) console.log(`             ${groupHint}`);
    fileItems.push({ ...f, groupSize: group ? group.length : 1 });
    idx++;
  }

  const dirItems = [];
  if (dirs.length > 0) {
    if (files.length > 0) console.log('');
    let didx = 1;
    for (const d of dirs) {
      console.log(`      d${didx}.  \x1b[34m${d.relPath}/\x1b[0m`);
      dirItems.push(d);
      didx++;
    }
  }

  if (files.length === 0 && dirs.length === 0) {
    console.log('  (boş dizin)');
  }

  return { fileItems, dirItems };
}

async function run(args) {
  if (!fs.existsSync(IDENTITY_FILE)) {
    console.error('Error: identity not found. Run "crypt-sync init" first.');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  if (!findGitRoot(projectRoot)) {
    console.error('Error: not inside a git repository.');
    process.exit(1);
  }

  const manifestPath = path.join(projectRoot, MANIFEST_FILE);
  if (fs.existsSync(manifestPath) && !args.includes('--force')) {
    console.log(`${MANIFEST_FILE} already exists — installing hooks and unlocking...\n`);
    installHooks(projectRoot);
    console.log('');
    const { run: unlock } = require('./unlock');
    await unlock([]);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  const { ask } = makeReader(rl);

  console.log(`\ncrypt-sync setup — ${projectRoot}`);

  process.stdout.write('\nŞifreli dosya adayları taranıyor...');
  const allSecrets = walkTree(projectRoot);
  const groups = groupByBasename(allSecrets);
  process.stdout.write(' tamam.\n');

  console.log('\nKomutlar:');
  console.log('  <numara>          dosya seç/kaldır (basename çoklu ise pattern olarak eklenir)');
  console.log('  d<numara>         dizine gir');
  console.log('  ..                üst dizine çık');
  console.log('  <path|pattern>    direkt ekle: apps/web/.env, *.db, secrets/');
  console.log('  Enter             seçimi bitir');

  const selected = new Set();
  let currentDir = '';
  let { fileItems, dirItems } = displayDir(projectRoot, currentDir, groups, selected);

  while (true) {
    const prompt = selected.size === 0
      ? '\n> '
      : `\n\x1b[90m(${selected.size} seçili)\x1b[0m > `;

    const input = (await ask(prompt)).trim();
    if (!input) break;

    if (input === '..') {
      if (!currentDir) {
        console.log('  Zaten proje kökündesin.');
      } else {
        const parent = path.dirname(currentDir);
        currentDir = parent === '.' ? '' : parent;
        ({ fileItems, dirItems } = displayDir(projectRoot, currentDir, groups, selected));
      }
      continue;
    }

    const tokens = input.split(/[\s,]+/).filter(Boolean);
    let navigated = false;

    for (const token of tokens) {
      // Directory navigation
      const dirMatch = token.match(/^d(\d+)$/i);
      if (dirMatch) {
        const didx = parseInt(dirMatch[1], 10) - 1;
        if (didx >= 0 && didx < dirItems.length) {
          currentDir = dirItems[didx].relPath;
          navigated = true;
        } else {
          console.log(`  ! geçersiz dizin numarası: ${token}`);
        }
        break; // navigate once per input
      }

      // File number
      const num = parseInt(token, 10);
      if (!isNaN(num) && /^\d+$/.test(token)) {
        if (num >= 1 && num <= fileItems.length) {
          const item = fileItems[num - 1];
          const entry = item.groupSize > 1 ? item.name : item.relPath;
          const label = item.groupSize > 1
            ? `${entry} \x1b[90m(pattern — ${item.groupSize} dosyayı kapsar)\x1b[0m`
            : entry;
          if (selected.has(entry)) {
            selected.delete(entry);
            console.log(`  \x1b[31m- kaldırıldı:\x1b[0m ${entry}`);
          } else {
            selected.add(entry);
            console.log(`  \x1b[32m+ eklendi:\x1b[0m ${label}`);
          }
        } else {
          console.log(`  ! geçersiz numara: ${num} (max: ${fileItems.length})`);
        }
        continue;
      }

      // Direct path or pattern
      if (token.startsWith('..') || path.isAbsolute(token)) {
        console.log(`  ! relatif path gerekli, proje dışına çıkamaz.`);
        continue;
      }
      if (selected.has(token)) {
        selected.delete(token);
        console.log(`  \x1b[31m- kaldırıldı:\x1b[0m ${token}`);
      } else {
        selected.add(token);
        console.log(`  \x1b[32m+ eklendi:\x1b[0m ${token}`);
      }
    }

    ({ fileItems, dirItems } = displayDir(projectRoot, currentDir, groups, selected));
    void navigated;
  }

  rl.close();

  if (selected.size === 0) {
    console.log('\nHiçbir şey seçilmedi. Setup iptal edildi.');
    return;
  }

  // Redundancy check
  let entries = [...selected];
  const redundant = entries.filter(e =>
    entries.some(other => other !== e && patternCovers(other, e))
  );
  if (redundant.length > 0) {
    console.log('\n\x1b[33mÇakışma tespit edildi — gereksiz entriler kaldırıldı:\x1b[0m');
    for (const r of redundant) {
      const coveredBy = entries.find(other => other !== r && patternCovers(other, r));
      console.log(`  "${r}" zaten "${coveredBy}" tarafından kapsanıyor.`);
    }
    entries = removeRedundant(entries);
  }

  console.log('\nŞifrelenecekler:');
  entries.forEach(e => console.log(`  ${e}`));

  const content = [
    '# crypt-sync — files/directories to encrypt',
    '# Basename pattern (örn: .env) proje genelinde eşleşir.',
    '',
    ...entries,
    '',
  ].join('\n');

  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log(`\nOluşturuldu: ${MANIFEST_FILE}`);

  console.log('\nGit hook\'lar kuruluyor...');
  installHooks(projectRoot);

  console.log('\nDosyalar şifreleniyor...\n');
  await lock([]);

  console.log('\n\x1b[32mSetup tamamlandı!\x1b[0m\n');
  console.log('Şifreli dosyalar staged. Commit ve push:\n');
  console.log('  git commit -m "add crypt-sync encrypted files"');
  console.log('  git push\n');
  console.log('Bundan sonra:');
  console.log('  git push  →  değişen dosyaları otomatik şifreler');
  console.log('  git pull  →  dosyaları otomatik çözer\n');
  console.log('Başka makinede (aynı passphrase):');
  console.log('  crypt-sync init');
  console.log('  git pull\n');
}

module.exports = { run };
