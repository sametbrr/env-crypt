[![npm version](https://img.shields.io/npm/v/crypt-sync.svg)](https://www.npmjs.com/package/crypt-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Hızlı Başlangıç](#hızlı-başlangıç) • [Özellikler](#özellikler) • [Kurulum](#kurulum) • [Kullanım](#kullanım) • [Nasıl Çalışır](#nasıl-çalışır) • [Sorun Giderme](#sorun-giderme)

# crypt-sync

`.env` ve gizli dosyaları age ile şifrele, git üzerinden makineler arasında senkronize et.

> 🇬🇧 For English see [README.md](README.md)

**crypt-sync, secretlarını git'te şifreli tutar.** Dosyaları `.gitignore`'layıp senkronu kaybetmek yerine, crypt-sync her dosyayı [age](https://github.com/FiloSottile/age) ile şifreler ve `.age` blob'unu repo'na commit'ler. Herhangi bir makinede `git pull` yap, passphrase ile çöz. Kopyalanacak anahtar dosyası yok. Çalıştırılacak secret manager yok.

---

## Hızlı Başlangıç

```bash
npm install -g crypt-sync
crypt-sync init       # makine başına bir kez — passphrase gir
cd proje-dizini
crypt-sync setup      # interaktif: dosyaları gez → seç → şifrele → hook kur
git commit -m "add encrypted secrets"
git push
```

Başka bir makinede:

```bash
crypt-sync init       # aynı passphrase
git pull             # post-merge hook otomatik çözer
```

---

## Özellikler

| Özellik | Açıklama |
|---|---|
| **age şifreleme** | X25519 + ChaCha20-Poly1305 — modern, denetimli, hızlı |
| **Passphrase'den türetilen anahtar** | Aynı passphrase → her makinede aynı anahtar. Anahtar dosyası kopyalanmaz |
| **Git-native senkron** | Şifreli blob'lar repo'nda yaşar. `git push` = senkron |
| **Otomatik hook'lar** | Push'ta şifreler, pull'da çözer (git hook'ları) |
| **İnteraktif setup** | Proje ağacını gez, dosya seç, alt dizinlere gir |
| **Gitignore desenleri** | `.cryptsync`'teki `.env` → ağaçtaki her `.env`'i şifreler |
| **Monorepo desteği** | Dosya bazlı artifact: `apps/web/.env` → `apps/web/.env.age` |

---

## Gereksinimler

- Node.js ≥ 16
- Git
- [age](https://github.com/FiloSottile/age) — `npm install` sırasında otomatik indirilir

Desteklenen platformlar: macOS (arm64, x64), Linux (x64, arm64), Windows (x64).

---

## Kurulum

```bash
npm install -g crypt-sync
```

Postinstall scripti, platformuna uygun `age` binary'sini indirir ve SHA256 checksum'ını resmi release ile doğrular.

### Kaldırma

```bash
# Global paketi kaldır
npm uninstall -g crypt-sync

# Bir projeden git hook'larını kaldır
cd proje-dizini
crypt-sync hooks uninstall

# Identity dosyasını sil
rm -rf ~/.config/crypt-sync
```

---

## Kullanım

```
crypt-sync <komut> [seçenekler]

  init                        Passphrase'den şifreleme identity'si türet (makine başına bir kez)
  setup                       İnteraktif setup: dosyaları gez, şifrele, hook kur
  lock [--all] [--wipe]       Değişen entry'leri şifrele ve blob'ları git-add yap
  unlock [--force]            Tüm blob'ları plaintext'e çöz
  status                      Tüm entry'lerin şifreleme durumunu göster
  clean                       Manifest'te olmayan orphan .age blob'larını temizle
  hooks install|uninstall     Proje git hook'larını yönet
  export-key <yol>            Identity anahtarını dosyaya aktar
  import-key <yol>            Identity anahtarını dosyadan içe aktar
```

### `init`

Makine başına bir kez çalıştırılır. scrypt kullanarak passphrase'den deterministik bir age identity türetir. Aynı passphrase her zaman aynı anahtarı üretir — makineler arasında anahtar dosyası transferi gerekmez.

```bash
crypt-sync init
# Passphrase (min 8 karakter): ••••••••••
# Identity kaydedildi: ~/.config/crypt-sync/identity.txt
# Recipient: age1...
```

Mevcut identity'nin üzerine yazmak için `--force` kullanılır.

### `setup`

İnteraktif proje kurulumu. Proje ağacını tarar, gizli dosya adaylarını isme göre gruplar, alt dizinlere girmeye izin verir ve birden fazla yerde bulunan dosyalar için gitignore-style desenler önerir.

```bash
cd proje-dizini
crypt-sync setup
```

```
Dizin: /
──────────────────────────────────────────
  1.  .env        ← 4 yerde (.env pattern hepsini kapsar)
      d1.  apps/
      d2.  supabase/

> d1        ← apps/ dizinine gir
> 1         ← seç, 4 dosyayı kapsayan ".env" pattern eklenir
> [Enter]   ← bitir → şifreler + hook kurar
```

### `lock`

Son lock'tan bu yana içeriği değişen entry'leri şifreler. Değişmeyen entry'ler atlanır. Blob'ları ve metadata dosyalarını otomatik olarak `git add` yapar.

```bash
crypt-sync lock           # değişen entry'leri şifrele
crypt-sync lock --all     # ledger'a bakmaksızın tüm entry'leri yeniden şifrele
crypt-sync lock --wipe    # şifreledikten sonra plaintext'i de sil
crypt-sync lock --no-add  # git add'i atla (hook'lar tarafından dahili olarak kullanılır)
```

### `unlock`

Manifest'teki tüm `.age` blob'larını plaintext'e çözer. Yerel olarak değiştirilmiş dosyaların üzerine `--force` olmadan yazmaz.

```bash
crypt-sync unlock
crypt-sync unlock --force   # yerel plaintext'in üzerine şifresi çözülmüş versiyonu yaz
```

### `status`

Entry başına durumu gösterir ve orphan blob'lar hakkında uyarır.

```bash
crypt-sync status
# .env              locked   (unchanged)
# apps/web/.env     locked   (changed — run lock)
# apps/api/.env     missing blob — run lock
```

### `hooks install` / `hooks uninstall`

Mevcut projenin `.git/hooks/` dizinine git hook'larını kurar veya kaldırır. Sentinel'lar kullanarak mevcut hook'lara ekler — var olan içeriğin üzerine yazmaz.

```bash
crypt-sync hooks install
crypt-sync hooks uninstall
```

Kurulan hook'lar:
- `pre-commit` — yönetilen bir plaintext dosyası stage'lenirse commit'i durdurur
- `pre-push` — push öncesi değişen entry'leri şifreler
- `post-merge` — `git pull` sonrası çözer
- `post-checkout` — branch değişimi veya clone sonrası çözer

### `export-key` / `import-key`

Identity'yi passphrase'den yeniden türetmeden başka bir makineye taşır.

```bash
crypt-sync export-key ~/key-backup.txt   # bu dosyayı güvende tut
crypt-sync import-key ~/key-backup.txt
```

---

## Yapılandırma

Proje kökünde bir `.cryptsync` dosyası oluştur. `#` ile başlayan satırlar yorum satırıdır. Bu dosyayı commit'le — tüm makinelerin neyin yönetildiğinde hemfikir olması gerekir.

```
# crypt-sync manifest
.env                  # proje ağacındaki her .env'i eşleştirir (gitignore-style)
.env.local
secrets/              # dizinin tamamını tek archive olarak şifrele
config/keys.json      # belirli bir dosya yolu
apps/web/.env.prod    # açık path
*.pem                 # glob deseni
```

**Desen kuralları:**

| Desen | Davranış |
|---|---|
| `.env` (slash yok) | Basename eşleşmesi — ağaçtaki her `.env`'i şifreler |
| `apps/web/.env` (slash var) | Proje köküne göre tam path |
| `secrets/` (sonda slash) | Dizin — tek bir `.cryptsync.tar.age` archive'ı üretir |
| `*.pem` | Glob — yalnızca proje kökündeki dosyaları eşleştirir |
| `**/*.pem` | Özyinelemeli glob |

---

## Nasıl Çalışır

```
passphrase
    │  scrypt(N=65536, r=8, p=1)
    ▼
32-byte key → X25519 clamp → Bech32 → AGE-SECRET-KEY-1…
    │
    ├── age encrypt -r <recipient>  →  .env.age       (git'e commit'lenir)
    │
    └── age decrypt -i identity.txt ← .env.age        (pull sonrası)
```

1. **`init`** — scrypt kullanarak passphrase'den deterministik bir age identity türetir. `~/.config/crypt-sync/identity.txt` dosyasına kaydedilir (mod 0600, dizin modu 0700).
2. **`setup`** — proje ağacını tarar, gizli adayları bulur, interaktif browser ile seçim yapmana izin verir, `.cryptsync`'i yazar, hook'ları kurar, ilk `lock`'u çalıştırır.
3. **`lock`** — her değişen entry için: SHA256 hesaplar, ledger (`.cryptsync.state`) ile karşılaştırır, `age -r <recipient>` ile şifreler, blob'ları `git add` yapar.
4. **`unlock`** — her `.age` blob'unu geçici dosya + yeniden adlandırma yöntemiyle atomik olarak çözer. Bir sonraki `lock`'ın no-op olması için ledger'ı günceller.
5. **Hook'lar** — `pre-push` `lock --no-add` çalıştırır; `post-merge` / `post-checkout` `unlock` çalıştırır. `pre-commit` yönetilen bir plaintext dosyası stage'lenmişse commit'i durdurur.
6. **Ledger** — `.cryptsync.state` (gitignore'lı) her plaintext entry'nin SHA256 hash'ini takip eder. Değişmeyen dosyalar hiçbir zaman yeniden şifrelenmez; bu sayede gereksiz git diff'leri önlenir.

---

## Sorun Giderme

**`age binary not found`** — Postinstall scripti sessizce başarısız oldu. Yeniden çalıştır:

```bash
npm rebuild crypt-sync
```

Ya da age'i [github.com/FiloSottile/age/releases](https://github.com/FiloSottile/age/releases) adresinden manuel olarak kur ve `PATH`'inde olduğundan emin ol.

**`Error: identity not found`** — Önce bu makinede `crypt-sync init` komutunu çalıştır.

**`unlock` yanlış plaintext üretiyor / şifre çözme başarısız** — `crypt-sync status` recipient fingerprint'ini yazdırır. `lock` çalıştıran makinedeki fingerprint ile karşılaştır. Farklılarsa passphrase'ler farklıdır.

**`pre-commit` "Plaintext secret file staged" mesajıyla durdu** — Yönetilen bir plaintext dosyası yanlışlıkla stage'lendi:

```bash
git reset HEAD .env     # stage'den çıkar
crypt-sync lock          # önce şifrele
git add .env.age        # blob'u stage'e ekle
git commit
```

**`unlock` yerel dosyamın üzerine yazmayı reddediyor** — `unlock`, varsayılan olarak yerel olarak farklılaşmış dosyaları atlar. Yalnızca yerel değişikliklerini kasıtlı olarak değiştirmek istediğinde `--force` kullan:

```bash
crypt-sync unlock --force
```

---

## Lisans

MIT — bkz. [LICENSE](LICENSE).

---

<p align="center">
  <a href="https://github.com/sametbrr/crypt-sync/issues">Hata Bildir</a> ·
  <a href="https://github.com/sametbrr/crypt-sync/issues">Özellik İste</a>
</p>
