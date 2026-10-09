# MARGINALIA: Laporan Eksekusi Fase 04 "Audit & Ceremony"

**Tanggal:** 2026-10-09 · **Rujukan:** `docs/phase4_audit_ceremony_plan.md`
**Ringkasan:** semua pekerjaan yang **dapat dilakukan tanpa pihak luar** selesai dan teruji (persiapan audit, analisis statis, audit internal sirkuit, fuzz invarian, toolkit dan gladi bersih ceremony, penjaga mainnet). **Yang tidak dapat dikerjakan sendiri dan belum ada:** audit eksternal (kontrak dan ZK), ceremony nyata dengan ≥ 15 kontributor, pin hash Phase 1 publik, build sirkuit O2 dengan `circom` native, dan peluncuran mainnet.

## 1. Hasil tes (seluruh suite: 218 lulus, tanpa kegagalan)

| Suite | Isi | Hasil |
|---|---|---|
| `test/circuit_audit.test.js` (B-TEST1–3) | Mutasi setiap input withdraw (+1, 0, FIELD−1) dan setiap elemen path (4×20), indeks non-bit, overflow 128-bit, withdraw 1 wei dan penuh, diferensial 40 note acak, ragequit | 31/31 |
| `test/invariant_fuzz.test.js` (A-TEST3) | 3 seed × 28 langkah acak dengan model bayangan: konservasi nilai, replay nullifier, satu-pintu-keluar, root Folio | 3/3 |
| `test/ceremony_rehearsal.test.js` (D-TEST1–4, 6) | Gladi bersih 5 kontributor + beacon pada sirkuit ragequit; 9 jenis pemalsuan transkrip; verifier hasil ceremony di chain menerima proof baru dan **menolak proof dari setup dev** (dan sebaliknya) | 17/17 |
| `scripts/ceremony/rehearsal.js withdraw` | Gladi bersih penuh pada withdraw (11.432 constraint): rantai 5 zkey, transkrip 16 pemeriksaan, verifier Solidity dapat dikompilasi | 3/3, 1 SKIP (lihat 3) |
| `test/reproducible_build.test.js` (A-TEST1) | Kompilasi dua kali = R1CS identik; solc murni = bytecode artefak Hardhat; provenance artefak ter-commit | 6/6 |
| `test/mainnet_ceremony_guard.test.js` | Deploy mainnet ditolak tanpa transkrip sah; 9 skenario penolakan | 10/10 |
| Slither pada kode saat ini | 12 kontrak, 102 detektor | **0 Tinggi, 0 Sedang**; 3 Low + 6 Info diterima (`docs/audit/slither_triage.md`) |

## 2. Yang dibangun
- `scripts/ceremony/` (`lib.js`, `cli.js`, `compile.js`, `rehearsal.js`, `mainnet-guard.js`): init → kontribusi → beacon → finalize → transkrip → **verifikator publik**; penjaga deploy mainnet (minimal 15 kontributor, beacon ≥ 2^10, Phase 1 terpin, verifier = ekspor zkey final).
- `scripts/audit/manifest.js` + `docs/audit/manifest.json` (sementara, belum freeze): hash seluruh berkas dalam lingkup, versi alat, setelan build, mode `check` untuk CI setelah freeze.
- Dokumen: `docs/ceremony_guide.md`, `docs/audit/README.md` (lingkup, asumsi, invarian ↔ tes, temuan internal), `docs/audit/slither_triage.md`.
- CI: job `static-analysis` (Slither `--fail-medium`, kompilasi sirkuit); `lib/marginalia.js` mendapat `buildWithdrawInput` (sirkuit dapat diserang tanpa membuat proof).

## 3. Temuan nyata dari pekerjaan ini
1. **Build tidak konsisten (I-2, Menengah).** `build/withdraw_js/withdraw.wasm` adalah build `--O1` (24.282 wire, 24.236 constraint), sedangkan `ragequit.wasm` adalah `--O2` (696 wire). Tidak ada flag yang dipin. Sekarang `--O2` dipin di `build-circuit.sh` dan kompiler; hasilnya withdraw **11.432** constraint (≈ 2× lebih kecil, pembuktian lebih cepat). Angka "24.236" di UI/dokumen masih benar untuk build ter-deploy; ganti bersamaan dengan build O2 + ceremony.
2. **Asal-usul setup lama tak dapat dibuktikan (I-1).** `snarkjs` menolak zkey ter-commit terhadap ptau lain ("Invalid alpha1"): ptau dev aslinya tidak ada. Satu alasan lagi untuk mengulang semuanya dari sumber lewat ceremony.
3. **`deploy.js` tidak punya penjaga mainnet (I-6, Tinggi bila keliru).** Verifier dari setup dev dapat di-deploy ke chain 4663. Sekarang ditolak oleh `mainnet-guard`; `docs/ceremony/phase1.json` sengaja `null` sehingga mainnet tetap terblokir sampai pemilik mengisinya.
4. Pembuktian "tidak ada konstrain `context`" didokumentasikan dan diuji (disengaja; diikat on-chain).
5. Slither lama yang menyebut `arbitrary-send-eth` berasal dari artefak build basi; pada kode saat ini tidak ada.

## 4. Belum selesai atau tidak dapat dilakukan di sini
| Item | Alasan / langkah |
|---|---|
| **Audit eksternal kontrak dan ZK** (B, C) | Butuh auditor dan anggaran. Paket audit siap (`docs/audit/`) |
| **Ceremony nyata** (D-T4/T5) | Butuh ≥ 15 kontributor independen dan beacon drand. Alat, panduan, dan gladi bersih siap |
| **Pin hash Phase 1 publik** | Harus diisi pemilik dari sumber resmi Hermez/PSE (`docs/ceremony/phase1.json`) |
| **Bukti proof nyata untuk withdraw O2** | `circom2` (WASM) tidak dapat menulis witness generator; perlu `circom` native yang dipin di CI (mengunduh biner: butuh izin Anda). Tercatat sebagai SKIP, bukan lulus |
| Fuzz skala besar (Echidna/Foundry, jutaan langkah) | Fuzz in-repo hanya 84 langkah ber-proof; pasang Echidna/Foundry di CI |
| Build reproducible di Docker/mesin bersih | Reproduktifitas dalam satu mesin terbukti; belum di Docker |
| Redeploy verifier/pool pasca-ceremony, E2E dengan zkey final (D-T7) | Setelah ceremony nyata |
| Freeze (tag, manifest final, `audit:check` di CI) | Setelah perbaikan hasil audit |

## 5. Langkah berikutnya
1. Izinkan pemasangan `circom` native yang dipin (atau pasang di CI), bangun ulang artefak O2 konsisten untuk kedua sirkuit, jalankan kembali gladi bersih withdraw dengan proof nyata.
2. Isi `docs/ceremony/phase1.json` dari sumber resmi dan pilih auditor; kirim `docs/audit/` + `manifest.json`.
3. Rekrut kontributor ceremony; jadwalkan setelah freeze sirkuit.
4. Pasang Echidna/Foundry di CI untuk fuzz skala besar.
