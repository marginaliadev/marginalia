# MARGINALIA: Catatan Sirkuit untuk Auditor

Sumber: `circuits/withdraw.circom` (112 baris), `circuits/ragequit.circom` (49), `circuits/lib/merkle.circom` (37). Bahasa: circom 2.1.9, kurva BN254, bukti Groth16. Primitif dari `circomlib` 2.0.5 (`Poseidon`, `Num2Bits`). Seluruh angka di bawah diukur dengan kompilasi `--O2` (`scripts/ceremony/compile.js`) dan dapat direproduksi.

## 1. Notasi
| Simbol | Arti |
|---|---|
| `sk`, `rho` | rahasia note (acak, < p). `sk` kunci pemilik, `rho` keacakan per-note |
| `P = Poseidon(sk)` | kunci publik pemilik |
| `pre = Poseidon(P, rho)` | *precommitment* (diumumkan saat deposit) |
| `C = Poseidon(value, label, pre)` | *commitment*, daun pohon Folio |
| `N = Poseidon(sk, rho)` | nullifier ("Wax Seal"), dibakar saat note keluar |
| `label` | label deposit yang dibuat kontrak: `keccak256(chainId, pool, nonce) mod p` |

## 2. Sirkuit `Withdraw(20, 20)`

### 2.1 Sinyal
| Sinyal | Jenis | Makna | Dicek on-chain oleh |
|---|---|---|---|
| `withdrawnValue` | publik [0] | nilai yang keluar (wei) | `> 0`, `fee <= withdrawnValue`; dikirim `withdrawnValue - fee` |
| `stateRoot` | publik [1] | root pohon Folio (kedalaman 20) | `isKnownRoot` (64 root terakhir) |
| `aspRoot` | publik [2] | root pohon label yang disetujui (kedalaman 20) | `register.isValidRoot` (16 root terakhir) |
| `context` | publik [3] | ikatan ke transaksi | `== computeContext(recipient, relayer, fee)` |
| `nullifierHash` | publik [4] | `N` | belum pernah dipakai; lalu ditandai terpakai |
| `newCommitment` | publik [5] | commitment note kembalian | disisipkan ke Folio (selalu, bahkan bernilai 0) |
| `sk, value, label, rho` | privat | rahasia dan isi note | |
| `statePathElements/Indices[20]` | privat | jalur Merkle di Folio | |
| `aspPathElements/Indices[20]` | privat | jalur Merkle di pohon ASP | |
| `newRho` | privat | `rho` baru untuk note kembalian | |

### 2.2 Constraint (urut seperti di sumber) dan biayanya
| # | Pernyataan yang dibuktikan | Komponen | Constraint |
|---|---|---|---|
| 1 | `P = Poseidon(sk)` (kepemilikan) | `Poseidon(1)` | 213 |
| 2 | `pre = Poseidon(P, rho)` | `Poseidon(2)` | 240 |
| 2 | `C = Poseidon(value, label, pre)` | `Poseidon(3)` | 261 |
| 3 | `C` adalah daun di bawah `stateRoot` | `MerkleInclusion(20)` | 4.860 |
| 4 | `label` adalah daun di bawah `aspRoot` | `MerkleInclusion(20)` | 4.860 |
| 5 | `Poseidon(sk, rho) = nullifierHash` | `Poseidon(2)` | 240 |
| 6 | `remaining = value - withdrawnValue`; keduanya dalam `[0, 2^128)` | 2 × `Num2Bits(128)` | 256 |
| 7 | note kembalian: `newPre = Poseidon(P, newRho)`, `newCommitment = Poseidon(remaining, label, newPre)` | `Poseidon(2)` + `Poseidon(3)` | 501 |
| 8 | `contextSquare = context * context` (menahan `context` agar tidak dioptimalkan) | 1 perkalian | 1 |
| | **Total (`--O2`)** | | **11.432** (6 publik, 85 privat, 11.478 wire) |

Build `--O1` (tanpa penyederhanaan penuh) menghasilkan 24.236 constraint dan sirkuit yang **berbeda**; tingkat optimisasi harus dipin (lihat `docs/audit/README.md`, temuan I-2).

### 2.3 `MerkleInclusion(depth)` (`lib/merkle.circom`)
Untuk tiap level: `pathIndices[i]` dipaksa bit (`b * (b - 1) === 0`), `left = node + b*(sibling - node)`, `right = sibling + b*(node - sibling)`, `node' = Poseidon(left, right)`; keluaran `root = node[depth]`. Biaya 20 × (240 + 3) = 4.860. Urutan hash identik dengan `MarginaliaPool._insert` (nol di sibling kosong: `zeros[level]`), dan diuji sama dengan implementasi JS dan TypeScript (`test/merkle_bulk.test.js`, `test/browser_sdk_parity.test.js`).

### 2.4 Properti keamanan yang diklaim
| Properti | Alasan di sirkuit |
|---|---|
| **Soundness nilai** (tidak bisa menarik lebih dari isi note) | `value = withdrawn + remaining` dengan keduanya 128-bit; selisih negatif menjadi ≈ p dan gagal `Num2Bits(128)` |
| **Satu note, satu nullifier** | `N` fungsi deterministik dari `(sk, rho)`; kembalian memakai `newRho` baru sehingga nullifier berbeda |
| **Keanggotaan label** | label (privat) harus ada di pohon ASP; label dibuat kontrak, bukan pengguna |
| **Keterkaitan kembalian** | `sk` dan `label` yang sama, hanya `rho` dan `value` berubah: pemilik dan asal-usul label terjaga |
| **Pengikatan transaksi** | `context` publik dan dibatasi kontrak; mengubah penerima/relayer/fee mengubah sinyal publik sehingga verifikasi gagal |
| **Zero-knowledge** | hanya 6 nilai di atas publik; `sk`, `rho`, `value`, `label`, indeks daun, dan jalur tetap privat |

### 2.5 Hal yang sengaja demikian (bukan cacat)
1. **`context` hanya dikuadratkan di dalam sirkuit.** Satu-satunya input yang tetap menghasilkan witness setelah diubah. Itu disengaja: nilai ini diikat oleh `computeContext` di kontrak dan oleh pemeriksaan sinyal publik Groth16. Diuji: `test/circuit_audit.test.js` (mutasi context diterima di tingkat witness) dan `test/security_onchain.test.js` (mengubah penerima, relayer, fee → `InvalidContext`).
2. **`value` dan `label` tidak punya pemeriksaan rentang sendiri.** `value` dibatasi secara tidak langsung (`withdrawn + remaining < 2^129`) dan harus cocok dengan commitment yang dibuat kontrak dari `msg.value` (≤ `uint128`). `label` < p secara alami karena elemen lapangan.
3. **`withdrawnValue = 0` lolos di sirkuit.** Kontrak menolaknya (`InvalidValue`).
4. **Tidak ada pemeriksaan "daun bukan nol".** Daun kosong adalah `0`; membuktikan keanggotaan `0` membutuhkan `C = 0`, yaitu preimage Poseidon: tidak dapat dilakukan.
5. **Kedalaman 20 hardcoded** (`main = Withdraw(20, 20)`): kapasitas 1.048.576 daun; kontrak menolak setelah penuh (`TreeFull`).

## 3. Sirkuit `Ragequit()`
Publik: `precommitment` [0], `nullifierHash` [1]. Privat: `sk`, `rho`.
| Pernyataan | Komponen | Constraint |
|---|---|---|
| `Poseidon(Poseidon(sk), rho) = precommitment` | `Poseidon(1)` + `Poseidon(2)` | 453 |
| `Poseidon(sk, rho) = nullifierHash` | `Poseidon(2)` | 240 |
| **Total (`--O2`)** | | **693** (2 publik, 2 privat, 696 wire) |

Kontrak memeriksa `precommitment == labelPrecommitment[label]` (hanya deposit asli dapat ragequit; **note kembalian tidak bisa**, karena `rho`-nya baru) dan bahwa pemanggil adalah `labelDepositor[label]`. Nullifier yang dibakar sama dengan nullifier withdraw, sehingga ragequit dan withdraw saling meniadakan.

## 4. Kompatibilitas sirkuit ↔ kontrak ↔ klien
| Hal | Lokasi | Dijaga oleh |
|---|---|---|
| Urutan sinyal publik withdraw `[value, stateRoot, aspRoot, context, nullifier, newCommitment]` | `Groth16Verifier` (6) dan `MarginaliaPool.withdraw` | `test/circuit_audit.test.js` (B-TEST2), `security_onchain` |
| Poseidon identik: circomlib, kontrak hasher, `circomlibjs`, `poseidon-lite` (browser) | seluruh sistem | `test/browser_sdk_parity.test.js` dan fuzz diferensial |
| Format `pB` ditukar (urutan koordinat G2) | `lib/marginalia.js`, `frontend/src/lib/zk.ts` | tes proof di chain |

## 5. Cara mereproduksi
```bash
npm ci
node -e 'const {compileCircuit}=require("./scripts/ceremony/compile");for (const c of ["withdraw","ragequit"]) console.log(c, compileCircuit(c,{force:true}).r1cs)'
npx snarkjs r1cs info .audit-build/withdraw.r1cs      # 11,432 constraints, 6 public, 85 private
npx hardhat test test/circuit_audit.test.js           # serangan mutasi terhadap witness generator ter-deploy
```
Dekomposisi di 2.2 diukur dengan mengompilasi tiap komponen sendiri: `Poseidon(1)=213`, `Poseidon(2)=240`, `Poseidon(3)=261`, `Num2Bits(128)=128`, `MerkleInclusion(20)=4.860`.

## 6. Daftar periksa yang disarankan untuk auditor
- Apakah ada sinyal yang dapat diubah tanpa menggagalkan witness, selain `context`? (kami menguji semua input dan setiap elemen jalur, `test/circuit_audit.test.js`)
- Apakah `Num2Bits(128)` pada `withdrawnValue` dan `remaining` cukup untuk mencegah overdraft di bawah batas lapangan BN254?
- Apakah hubungan `label` (dibuat kontrak) dengan pohon ASP dapat dimanipulasi oleh penyetor?
- Perilaku saat `remaining = 0` (kembalian bernilai nol tetap disisipkan sebagai daun).
- Konsistensi parameter Poseidon antara circomlib (sirkuit), kontrak hasher yang di-deploy, dan pustaka klien.
- Soundness pada tingkat setup: bergantung pada ceremony (`docs/ceremony_guide.md`); setup yang ter-commit adalah setup dev.
