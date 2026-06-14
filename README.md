[![npm version](https://img.shields.io/npm/v/crypt-sync.svg)](https://www.npmjs.com/package/crypt-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Quick Start](#quick-start) • [Features](#features) • [Installation](#installation) • [Usage](#usage) • [How It Works](#how-it-works) • [Troubleshooting](#troubleshooting)

# crypt-sync

Encrypt `.env` and secret files with age, sync them across machines via git.

> 🇹🇷 Türkçe için [README.tr.md](README.tr.md)

**crypt-sync keeps your secrets in git — encrypted.** Instead of `.gitignore`-ing secrets and losing sync, crypt-sync encrypts each file with [age](https://github.com/FiloSottile/age) and commits the `.age` blob to your repo. Pull on any machine, decrypt with your passphrase. No key files to copy. No secret manager to run.

---

## Quick Start

```bash
npm install -g crypt-sync
crypt-sync init       # once per machine — enter passphrase
cd your-project
crypt-sync setup      # interactive: browse files → select → encrypt → install hooks
git commit -m "add encrypted secrets"
git push
```

On another machine:

```bash
crypt-sync init       # same passphrase
git pull             # auto-decrypts via post-merge hook
```

---

## Features

| Feature | Description |
|---|---|
| **age encryption** | X25519 + ChaCha20-Poly1305 — modern, audited, fast |
| **Passphrase-derived keys** | Same passphrase → same key on every machine. No key file to copy |
| **Git-native sync** | Encrypted blobs live in your repo. `git push` = sync |
| **Auto hooks** | Encrypts on push, decrypts on pull via git hooks |
| **Interactive setup** | Browse project tree, select files, navigate into subdirectories |
| **Gitignore patterns** | `.env` in `.cryptsync` encrypts every `.env` in the tree |
| **Monorepo support** | Per-file artifacts: `apps/web/.env` → `apps/web/.env.age` |

---

## Requirements

- Node.js ≥ 16
- Git
- [age](https://github.com/FiloSottile/age) — downloaded automatically on `npm install`

Supported platforms: macOS (arm64, x64), Linux (x64, arm64), Windows (x64).

---

## Installation

```bash
npm install -g crypt-sync
```

The postinstall script downloads the correct `age` binary for your platform and verifies its SHA256 checksum against the official release.

### Uninstall

```bash
# Remove global package
npm uninstall -g crypt-sync

# Remove git hooks from a project
cd your-project
crypt-sync hooks uninstall

# Remove identity file
rm -rf ~/.config/crypt-sync
```

---

## Usage

```
crypt-sync <command> [options]

  init                        Derive encryption identity from passphrase (once per machine)
  setup                       Interactive setup: browse files, encrypt, install hooks
  lock [--all] [--wipe]       Encrypt changed entries and git-add blobs
  unlock [--force]            Decrypt all blobs to plaintext
  status                      Show encryption state for all entries
  clean                       Remove orphan .age blobs not in manifest
  hooks install|uninstall     Manage project git hooks
  export-key <path>           Export identity key to a file
  import-key <path>           Import identity key from a file
```

### `init`

Run once per machine. Derives an age identity from your passphrase using scrypt. The same passphrase always produces the same key — no key file to transfer between machines.

```bash
crypt-sync init
# Passphrase (min 8 chars): ••••••••••
# Identity saved to: ~/.config/crypt-sync/identity.txt
# Recipient: age1...
```

Use `--force` to overwrite an existing identity.

### `setup`

Interactive project setup. Scans the project tree, groups secret candidates by name, lets you browse subdirectories, and suggests gitignore-style patterns for files found in multiple places.

```bash
cd your-project
crypt-sync setup
```

```
Dizin: /
──────────────────────────────────────────
  1.  .env        ← 4 yerde (.env pattern hepsini kapsar)
      d1.  apps/
      d2.  supabase/

> d1        ← navigate into apps/
> 1         ← select, adds ".env" pattern covering 4 files
> [Enter]   ← finish → encrypts + installs hooks
```

### `lock`

Encrypts entries whose content changed since the last lock. Unchanged entries are skipped. Runs `git add` on blobs and metadata automatically.

```bash
crypt-sync lock           # encrypt changed entries
crypt-sync lock --all     # re-encrypt all entries regardless of state
crypt-sync lock --wipe    # also delete plaintext after encrypting
crypt-sync lock --no-add  # skip git add (used internally by hooks)
```

### `unlock`

Decrypts all `.age` blobs in the manifest to plaintext. Does not overwrite locally modified files without `--force`.

```bash
crypt-sync unlock
crypt-sync unlock --force   # overwrite local plaintext with decrypted version
```

### `status`

Shows per-entry state and warns about orphan blobs.

```bash
crypt-sync status
# .env              locked   (unchanged)
# apps/web/.env     locked   (changed — run lock)
# apps/api/.env     missing blob — run lock
```

### `hooks install` / `hooks uninstall`

Installs or removes git hooks in the current project's `.git/hooks/`. Appends to existing hooks using sentinels — never overwrites your existing hook content.

```bash
crypt-sync hooks install
crypt-sync hooks uninstall
```

Installed hooks:
- `pre-commit` — aborts if any managed plaintext is staged
- `pre-push` — encrypts changed entries before push
- `post-merge` — decrypts after `git pull`
- `post-checkout` — decrypts after branch switch or clone

### `export-key` / `import-key`

Transfer your identity to another machine without re-deriving from passphrase.

```bash
crypt-sync export-key ~/key-backup.txt   # keep this file safe
crypt-sync import-key ~/key-backup.txt
```

---

## Configuration

Create a `.cryptsync` file in your project root. Lines starting with `#` are comments. Commit this file — all machines need to agree on what is managed.

```
# crypt-sync manifest
.env                  # matches every .env in the project tree (gitignore-style)
.env.local
secrets/              # encrypt entire directory as one archive
config/keys.json      # specific file path
apps/web/.env.prod    # explicit path
*.pem                 # glob pattern
```

**Pattern rules:**

| Pattern | Behaviour |
|---|---|
| `.env` (no slash) | Basename match — encrypts every `.env` in the entire tree |
| `apps/web/.env` (with slash) | Exact path relative to project root |
| `secrets/` (trailing slash) | Directory — produces a single `.cryptsync.tar.age` archive |
| `*.pem` | Glob — matches files in project root only |
| `**/*.pem` | Recursive glob |

---

## How It Works

```
passphrase
    │  scrypt(N=65536, r=8, p=1)
    ▼
32-byte key → X25519 clamp → Bech32 → AGE-SECRET-KEY-1…
    │
    ├── age encrypt -r <recipient>  →  .env.age       (committed to git)
    │
    └── age decrypt -i identity.txt ← .env.age        (on pull)
```

1. **`init`** — derives a deterministic age identity from your passphrase using scrypt. Stored in `~/.config/crypt-sync/identity.txt` (mode 0600, directory mode 0700).
2. **`setup`** — walks the project tree, finds secret candidates, lets you select with an interactive browser, writes `.cryptsync`, installs hooks, runs initial `lock`.
3. **`lock`** — for each changed entry: computes SHA256, compares with ledger (`.cryptsync.state`), encrypts with `age -r <recipient>`, runs `git add` on blobs.
4. **`unlock`** — decrypts each `.age` blob atomically via temp file + rename. Updates the ledger so the next `lock` is a no-op.
5. **Hooks** — `pre-push` runs `lock --no-add`, `post-merge` / `post-checkout` run `unlock`. `pre-commit` aborts if any managed plaintext file is staged.
6. **Ledger** — `.cryptsync.state` (gitignored) tracks the SHA256 hash of each plaintext entry. Unchanged files are never re-encrypted, preventing noisy git diffs.

---

## Troubleshooting

**`age binary not found`** — The postinstall script failed silently. Re-run it:

```bash
npm rebuild crypt-sync
```

Or install age manually from [github.com/FiloSottile/age/releases](https://github.com/FiloSottile/age/releases) and ensure it is on your `PATH`.

**`Error: identity not found`** — Run `crypt-sync init` on this machine first.

**`unlock` produces wrong plaintext / decryption fails** — `crypt-sync status` prints the recipient fingerprint. Compare it with the fingerprint on the machine that ran `lock`. If they differ, the passphrases are different.

**`pre-commit` aborts with "Plaintext secret file staged"** — A managed plaintext file was accidentally staged:

```bash
git reset HEAD .env     # unstage
crypt-sync lock          # encrypt first
git add .env.age        # stage the blob instead
git commit
```

**`unlock` refuses to overwrite my local file** — By default unlock skips files that differ locally. Use `--force` only when you intentionally want to replace your local edits:

```bash
crypt-sync unlock --force
```

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <a href="https://github.com/sametbrr/crypt-sync/issues">Report Bug</a> ·
  <a href="https://github.com/sametbrr/crypt-sync/issues">Request Feature</a>
</p>
