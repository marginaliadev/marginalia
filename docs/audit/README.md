# MARGINALIA: Paket Audit (Fase 04)

Dokumen ini adalah titik masuk untuk auditor kontrak dan auditor ZK. Dokumen pendamping: `circuit_notes.md` (sirkuit), `../threat_model_and_audit_pack.md` (model ancaman v2.0), `slither_triage.md`, `../ceremony_guide.md`. Hash pasti dari seluruh berkas dalam lingkup ada di `manifest.json` (dihasilkan oleh `node scripts/audit/manifest.js write`, dijaga CI dengan `check` setelah freeze).

## 1. Lingkup

| Kategori | Berkas | Catatan |
|---|---|---|
| Sirkuit | `circuits/withdraw.circom` (112 baris), `circuits/ragequit.circom` (49), `circuits/lib/merkle.circom` (37) | dikompilasi dengan **`--O2`**: withdraw 11.432 constraint, ragequit 693 |
| Kontrak | `contracts/MarginaliaPool.sol` (339), `contracts/MagistrateRegister.sol` (127), `contracts/interfaces/IPoseidon.sol` | solc 0.8.24, optimizer 200 run, evm cancun |
| Dihasilkan | `Groth16Verifier.sol`, `RagequitVerifier.sol` (output snarkjs) | tidak diaudit baris per baris: dibuktikan **identik dengan ekspor zkey final** (transkrip ceremony) |
| Di luar lingkup | `MarginaliaTokenPool.sol` (ERC-20), `mocks/` | tidak akan di-deploy pada peluncuran awal |
| Off-chain (informasi) | `lib/marginalia.js`, `frontend/src/lib/zk.ts`, `services/magistrate/`, `scripts/governance/` | klien dan layanan; paritas SDK diuji |

Build reproducible: `npm ci && npx hardhat compile` dan `node -e 'require("./scripts/ceremony/compile").compileCircuit("withdraw")'`. Versi alat dipin di `manifest.json`.

## 2. Model ancaman dan asumsi tepercaya
- **Magistrate** hanya memengaruhi *siapa yang boleh withdraw secara privat*. Ia **tidak dapat memindahkan dana** dan tidak dapat menghalangi `ragequit`.
- **Guardian** hanya dapat menghentikan *deposit baru* dan menetapkan batas deposit; withdraw dan ragequit tidak dapat dihentikan.
- **Owner register** (Safe 2-of-3) dapat mengganti Magistrate dan mengotorisasi pool.
- Kerahasiaan bergantung pada `sk` dan `rho` di sisi pengguna; keamanan nilai bergantung pada soundness Groth16 dan pada setup (ceremony) yang jujur.
- Relayer tidak dipercaya: fee dan penerima terikat ke proof lewat `context`.

## 3. Invarian yang diklaim (dan tes yang menjaganya)
| Invarian | Tes |
|---|---|
| Nilai pool = deposit − withdraw − ragequit (tidak ada nilai tercipta/hilang) | `test/invariant_fuzz.test.js` (3 seed × 28 langkah acak dengan model bayangan) |
| Setiap nullifier hanya bisa dipakai sekali; replay proof selalu revert | fuzz + `test/security_onchain.test.js` |
| Satu note hanya keluar lewat satu pintu (withdraw XOR ragequit) | fuzz + `security_onchain` |
| Proof terikat pada penerima, relayer, fee, chain, dan alamat pool | `security_onchain` (`InvalidContext`) |
| Root Folio hasil rekonstruksi event = root on-chain; `nextIndex` = deposit + withdraw | fuzz |
| Pause tidak menghentikan withdraw/ragequit | `security_onchain`, `scripts/test-governance.js` (Safe asli di testnet) |
| Sirkuit menolak setiap mutasi input (kecuali `context`, yang terikat on-chain) | `test/circuit_audit.test.js` (31 tes) |
| Tidak ada pembukaan `sk`/`rho` pada ragequit | `circuit_audit` (hanya 2 sinyal publik) |

## 4. Temuan internal dan statusnya (jujur)
| # | Temuan | Dampak | Status |
|---|---|---|---|
| I-1 | **Setup yang ter-commit adalah setup dev** (ptau lokal, satu pihak). Asal-usul zkey lama tidak dapat dibuktikan terhadap sumber (ptau aslinya tidak ada) | Kritis untuk mainnet, tidak relevan untuk testnet | Ditutup oleh ceremony; `mainnet-guard` memblokir deploy mainnet |
| I-2 | **Build tidak konsisten:** `build/withdraw_js/withdraw.wasm` adalah build `--O1` (24.282 wire, 24.236 constraint), sedangkan `ragequit.wasm` adalah `--O2` (696 wire); kompiler tidak dipin | Menengah: dua sirkuit dibangun dengan setelan berbeda; tidak ada jaminan reproduktifitas | Diperbaiki di kode: `--O2` dipin di `build-circuit.sh` dan `compile.js`, ada tes provenance. **Perlu build ulang wasm dengan circom native** + ceremony |
| I-3 | Angka "24.236 constraint" (UI, README, devbrief) benar untuk build `--O1` yang ter-commit dan ter-deploy; build `--O2` yang di-pin menghasilkan 11.432 | Rendah (dokumentasi) | Perbarui angka di UI dan dokumen **bersamaan dengan** build O2 + ceremony (jangan sebelum itu) |
| I-4 | Slither (kode saat ini): 0 temuan Tinggi/Sedang. Low: panggilan eksternal Poseidon dalam loop (3 lokasi, by design, kontrak hasher immutable) | Informasional | Diterima, lihat `slither_triage.md` |
| I-5 | `context` hanya dikuadratkan di dalam sirkuit | Tidak ada: sengaja, diikat oleh kontrak | Didokumentasikan, diuji |
| I-6 | `deploy.js` tidak memiliki penjaga mainnet | Tinggi bila deploy keliru | Diperbaiki: `scripts/ceremony/mainnet-guard.js` (10 tes) |

## 5. Bukti pengujian internal (per commit pada paket ini)
`npx hardhat test` menjalankan seluruh suite (Fase 03 + Fase 04). Khusus Fase 04: `circuit_audit` (31), `invariant_fuzz` (3 seed), `ceremony_rehearsal` (17), `reproducible_build` (6), `mainnet_ceremony_guard` (10). Gladi bersih ceremony untuk withdraw: `node scripts/ceremony/rehearsal.js withdraw 3`.

## 6. Yang kami minta dari auditor
Sirkuit: under-constrained signals, soundness nilai (withdrawn + remaining = value pada rentang 128-bit), pengikatan nullifier ke `(sk, rho)`, pemisahan pohon state dan ASP, perilaku di batas lapangan BN254, keamanan saat `remaining = 0`, ragequit tidak membocorkan rahasia.
Kontrak: urutan cek-efek-interaksi pada `_send`, riwayat root dan `StaleAspRoot`, kontrol akses guardian/owner/magistrate, perhitungan `computeContext`, griefing oleh penerima, kapasitas pohon, interaksi pause dengan exit.
