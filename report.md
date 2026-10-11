# Laporan Ringkasan: Marginalia

> *"Proven. Not revealed."*

## 1. Gambaran Umum

**Marginalia** adalah *shielded asset pool* berbasis zero-knowledge yang dibangun untuk **Robinhood Chain** (Orbit L2). Tujuannya: menjaga kerahasiaan transaksi tanpa mengorbankan kepatuhan (compliance), lewat **Association Set Provider (ASP)** dan **Provable Exclusion Proofs**. Nama dan narasinya terinspirasi catatan pinggir Pierre de Fermat.

> **Status: hanya testnet, belum diaudit.** Jangan deposit dana yang tidak siap hilang.

## 2. Tiga Aksioma

| Aksioma | Nama | Fungsi |
|---|---|---|
| I | Wax Seal | Nullifier `Poseidon2(sk, ρ)` mencegah double-spend; setiap note hanya bisa dibelanjakan sekali. |
| II | Folio Tree | Commitment `Poseidon3(value, label, precommitment)` masuk ke Merkle tree kedalaman 20 (±1,05 juta note), bukti sublinear O(log N). |
| III | The Magistrate | Penarikan harus membuktikan keanggotaan dalam root ASP yang disetujui, sehingga dana "kotor" terpisah dari dana "bersih". |

## 3. Arsitektur & Alur

1. **Deposit** – pengguna mengirim 1 ETH ke `MarginaliaPool.sol` dengan commitment + label.
2. **Screening** – Magistrate menyaring label dan menambahkannya ke buffer root ASP (`MagistrateRegister.sol`).
3. **Proving** – pengguna membuat bukti Groth16 (BN254) di browser (snarkjs): Merkle proof + inklusi ASP + Wax Seal.
4. **Withdraw** – bukti dikirim langsung atau lewat **Mersenne Courier** (relayer gasless); kontrak memverifikasi pairing, menandai nullifier terpakai, lalu membayar penerima (jumlah − fee) dan relayer.

## 4. Primitif Kriptografi

- Kurva **alt_bn128 (BN254)**
- Hash **Poseidon** (circomlib)
- Sistem bukti **Groth16** (verifikasi 3 elemen)
- Merkle tree 20 level dengan zero-hash precomputed (gas insert ±950k)

## 5. Kepatuhan (ASP)

- **Buffer root bergulir**: 16 root ASP terakhir tetap valid, sehingga bukti tidak batal saat registry diperbarui.
- **Letter of Disclosure**: kunci pengungkapan selektif dari viewing key untuk auditor, tanpa hak membelanjakan.
- **Magistrate otomatis** (`services/magistrate/`): menyaring deposit (daftar OFAC, API sanksi Chainalysis, daftar alamat exploit), mem-pin daftar disetujui ke IPFS, dan mempublikasikan root.
- **Tata kelola Safe 2-of-3**: guardian hanya bisa menjeda *deposit baru*; penarikan dan ragequit tetap berjalan.
- **Ragequit**: penyetor asli dapat menarik kembali depositnya dengan bukti Groth16 kecil.

## 6. Mersenne Courier (Relayer)

- Penerima baru tidak perlu punya ETH untuk gas.
- `recipient` dan `fee` adalah input publik sirkuit, jadi relayer tidak bisa membajak transaksi.
- Fee dikutip dari persentil ke-90 gas relay terbaru (+ headroom); Courier hanya ditawarkan saat saldo wallet cukup (jika tidak, API menjawab 503).

## 7. Aplikasi Web (frontend Next.js, desain "Noirpay")

| Halaman | Route | Isi |
|---|---|---|
| Landing | `/` | Tiga aksioma, narasi Fermat, diagram pipeline, telemetri jaringan. |
| Shielded Cockpit | `/app` | Deposit, proving di browser, withdraw (wallet/Courier), ragequit, vault note terenkripsi, pemulihan crash. |
| Codex | `/codex` | Dokumentasi kriptografi: aljabar BN254, matriks R1CS, invarian kontrak. |
| Folio Explorer | `/explorer` | Inspektor leaf Merkle, registry nullifier, analitik gas. |
| Compliance Desk | `/compliance` | Kebijakan screening, proses banding, generator Letter of Disclosure. |

Hardening terbaru: CSP, hash aset zk yang dipin dan diverifikasi di browser.

## 8. Tech Stack

Solidity 0.8.24 · Circom 2.1.8 · Groth16/BN254 · Hardhat · Next.js (frontend) · Supabase (state Magistrate) · IPFS (Pinata + gateway publik) · Node.js ≥ 22.

## 9. Pengujian

- **232 test** lulus (`npx hardhat test`, tanpa jaringan eksternal, ±5–6 menit).
- Mencakup: protokol, keamanan adversarial, audit sirkuit (mutasi tiap input), *stateful fuzz*, layanan Magistrate, paritas SDK browser vs Node, rehearsal ceremony, dan regression guard gas (deposit ≈945k, withdraw ≈1,07M, ragequit ≈321k).
- Suite on-chain/browser (perlu key testnet): governance Safe v1.4.1, relayer health, e2e headless Chrome.

## 10. Struktur Repositori

| Direktori | Isi |
|---|---|
| `contracts/` | Kontrak Solidity (pool, register, verifier) |
| `circuits/` | Sirkuit Circom (withdraw, ragequit) |
| `frontend/` | Aplikasi web Next.js |
| `services/magistrate/` | Worker Magistrate otomatis |
| `asp/`, `lib/` | Logika ASP dan SDK |
| `scripts/` | Deploy, governance, ceremony, audit |
| `supabase/` | Skema dan migrasi |
| `docs/` | Threat model, runbook, laporan fase, mainnet readiness |

## 11. Roadmap

| Fase | Status |
|---|---|
| 01 Prototype | Selesai |
| 02 Testnet Alpha | Selesai (deposit, proving, withdraw, ragequit, vault; terverifikasi di testnet) |
| 03 Hardening | **Aktif** – Magistrate otomatis, IPFS, Safe, relayer health sudah dibangun; tinggal rollout dan soak |
| 04 Audit & Ceremony | Akan datang – toolkit dan rehearsal siap; audit eksternal dan ceremony publik belum |
| 05 Mainnet | Belum mulai – **terblokir secara teknis** |

## 12. Risiko & Catatan Penting

- **Proving key masih setup satu pihak (dev)**; `scripts/deploy.js` menolak chain mainnet (4663) tanpa transkrip ceremony.
- Belum ada audit eksternal.
- Magistrate adalah hot key terpisah yang dapat diganti oleh Safe; ketergantungan pada sumber screening eksternal (fail-closed).

## Catatan

Laporan ini disusun dari `README.md` dan struktur repositori proyek. Anda tidak menyertakan URL, jadi saya menganggap "web ini" adalah aplikasi Marginalia di repo ini. Jika yang Anda maksud situs lain, kirim URL-nya dan saya perbarui.
