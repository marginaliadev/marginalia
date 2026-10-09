# MARGINALIA: Rencana Fase 04 "Audit & Ceremony"

**Status:** Dikerjakan sebagian: semua yang tidak butuh pihak luar selesai dan teruji, lihat `docs/phase4_audit_ceremony_report.md` (audit eksternal, ceremony nyata, dan build O2 native belum) · **Durasi:** 6–10 minggu (sebagian besar menunggu pihak luar) · **Prasyarat:** Fase 03 selesai dan kode dibekukan (`v0.3.0-rc1`)
**Penerus:** Fase 05 "Mainnet" (batas deposit, guardian multisig, peluncuran terjaga)

## 1. Fakta awal yang menentukan rencana (diperiksa di repo)

| Fakta | Dampak |
|---|---|
| Setup sekarang adalah **setup dev**: `scripts/build-circuit.sh` membuat Powers of Tau **lokal** dan satu kontribusi Phase 2 dari satu orang. Siapa pun yang memegang "toxic waste" dapat memalsukan proof dan menguras pool (risiko L1 di `devbrief.md`) | Aman untuk testnet, **tidak boleh untuk mainnet**. Ceremony adalah syarat mutlak mainnet |
| Sirkuit kecil: `withdraw.circom` 112 baris, `ragequit.circom` 49, `lib/merkle.circom` 37 | Audit sirkuit sempit, murah, dan bisa dibekukan |
| Kontrak yang akan diaudit: `MarginaliaPool` 339 baris, `MagistrateRegister` 127. `Groth16Verifier` dan `RagequitVerifier` dibangkitkan `snarkjs` (cukup dibuktikan identik dengan `zkey` final, bukan diaudit baris per baris). `MarginaliaTokenPool` (312 baris, ERC-20) **di luar lingkup** kecuali akan di-deploy | Menurunkan biaya audit |
| `scripts/ceremony-tool.js` hanya membungkus `snarkjs` (contribute / verify / beacon / export); `test/ceremony.test.js` baru memeriksa ekspor *verification key* | Perlu orkestrasi, transkrip, verifikasi publik, dan gladi bersih |
| Alat belum terpasang di mesin ini: `circom`, `circomspect`, `slither`, `echidna`, `forge`, `halmos`, `solhint` | Pasang di CI/Docker pada tugas A1 |
| Jalur kritis: **audit sirkuit → perbaikan → freeze sirkuit → ceremony → redeploy verifier**. Ceremony untuk sirkuit yang masih berubah sia-sia | Urutan tidak boleh dibalik |

## 2. Keputusan arsitektur

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Phase 1 memakai **Powers of Tau publik (Hermez/PSE, `powersOfTau28_hez_final_15.ptau`)**, hash dicocokkan dengan nilai terpublikasi | Dipercaya selama 1 dari puluhan kontributor jujur; tidak perlu menjalankan Phase 1 sendiri |
| D2 | Phase 2: **ceremony berurutan** yang dikoordinasi (alat sendiri berbasis `snarkjs`, atau p0tion bila ada infrastruktur), minimal **15 kontributor independen**, lalu **random beacon publik (drand)** | Keamanan butuh hanya 1 kontributor jujur; beacon menutup celah kontributor terakhir |
| D3 | **Dua zkey terpisah** (withdraw, ragequit), masing-masing satu ceremony | Dua sirkuit, dua verifier |
| D4 | **Audit sebelum ceremony**; setelah audit, sirkuit dan kontrak dibekukan; perubahan setelahnya memicu ceremony ulang | Hindari biaya ganda |
| D5 | Verifier mainnet = **hasil ekspor zkey final**; tes memastikan bytecode verifier yang di-deploy sama dengan hasil ekspor dari zkey final yang terpublikasi | Menutup celah "verifier tidak sama dengan ceremony" |
| D6 | Tidak ada fitur baru selama Fase 04 (hanya perbaikan temuan audit) | Menjaga freeze |

## 3. Workstream, tugas, dan tes

Estimasi hari-orang (hO); `E` = menunggu pihak eksternal.

### A. Persiapan audit (A0–A1, ±8 hO)

| ID | Tugas | hO |
|---|---|---|
| A0-T1 | Freeze: tag `v0.3.0-rc1`, hash commit, daftar file dalam lingkup, build reproducible (versi solc, circom, snarkjs dipin) | 1 |
| A0-T2 | Perbarui `docs/threat_model_and_audit_pack.md`: invarian (nullifier unik, konservasi nilai, ragequit/withdraw saling eksklusif, root history), asumsi tepercaya (Magistrate hanya memengaruhi *siapa boleh withdraw*, tidak dapat memindahkan dana), model aktor, daftar risiko L1–L13 dengan status | 2 |
| A0-T3 | Dokumentasi sirkuit: sinyal publik/privat, tiap constraint dan alasannya, hubungan `context` dengan kontrak | 2 |
| A1-T1 | Pasang alat di CI (job `audit-precheck`): `circom`, `circomspect`, `slither`, Echidna atau Foundry (fuzz/invariant), `solhint`, `halmos` opsional | 1 |
| A1-T2 | Jalankan `circomspect` pada ketiga `.circom` dan `slither` pada dua kontrak; triase semua temuan (perbaiki atau dokumentasikan sebagai *false positive*) | 1 |
| A1-T3 | Fuzz/invariant on-chain: nilai pool = Σ deposit tak terpakai; nullifier tidak pernah terpakai dua kali; tidak ada jalur withdraw+ragequit untuk satu note | 1 |

**Tes A:**

| ID | Skenario | Hasil |
|---|---|---|
| A-TEST1 | Build ulang dari tag di mesin bersih (Docker) | Artefak identik (hash verifier dan bytecode sama) |
| A-TEST2 | `circomspect` + `slither` di CI | 0 temuan severity tinggi/menengah yang belum ditriase |
| A-TEST3 | Invariant fuzz ≥ 1 juta langkah | 0 pelanggaran |
| A-TEST4 | Tes keamanan on-chain yang ada (21) + 151 tes keseluruhan tetap hijau pada tag | 100% |

### B. Audit sirkuit ZK (±3–5 minggu `E` + 3 hO internal)

| ID | Tugas |
|---|---|
| B-T1 | Pilih auditor ZK spesialis (Veridise, zkSecurity, Least Authority, atau setara); kirim paket A0 + kuotasi |
| B-T2 | Fokus yang diminta: sinyal under-constrained, soundness (tidak bisa withdraw lebih dari nilai note), ikatan `context` (recipient/relayer/fee), konsistensi pohon state/ASP, nullifier, ragequit tidak membocorkan `sk/rho`, batas lapangan (field overflow) |
| B-T3 | Sesi tanya jawab mingguan; semua temuan dilacak di tabel (ID, severity, status, commit perbaikan) |
| B-T4 | Perbaikan + verifikasi ulang (re-test) oleh auditor; laporan akhir dipublikasikan |

**Tes B (internal, mendahului dan melengkapi auditor):**

| ID | Skenario | Hasil |
|---|---|---|
| B-TEST1 | Fuzz sirkuit: witness acak/mutasi (tiap sinyal diubah satu per satu) harus **gagal** dibuktikan | 100% mutasi ditolak |
| B-TEST2 | Properti diferensial: output sirkuit = implementasi referensi JS pada 10.000 input acak | Identik |
| B-TEST3 | Uji serangan: proof dari witness sah dengan nilai dinaikkan, nullifier dipalsukan, jalur Merkle dari pohon lain | Semua ditolak |
| B-TEST4 | Tes regresi untuk setiap temuan auditor (satu tes per temuan) | Hijau |

### C. Audit kontrak (±3–4 minggu `E` + 3 hO internal)

| ID | Tugas |
|---|---|
| C-T1 | Pilih firma kontrak (OpenZeppelin, Trail of Bits, Spearbit/Cantina, Zellic, atau setara); lingkup: `MarginaliaPool`, `MagistrateRegister`, skrip tata kelola, bukti verifier = ekspor zkey |
| C-T2 | Fokus: reentrancy, `_send`, urutan cek-efek-interaksi, riwayat root dan root ASP basi, penguncian guardian/owner, pause tak boleh menahan withdraw/ragequit, `computeContext` (chainId, alamat pool), pencegahan frontrun, gas griefing pada penerima |
| C-T3 | Perbaikan temuan, re-test, laporan publik |

**Tes C:** tiap temuan mendapat tes regresi (`C-TEST-n`); seluruh suite keamanan (`test/security_onchain.test.js`) dan invarian tetap hijau; baseline gas diperbarui hanya bila perbaikan mengubahnya.

### D. Phase-2 ceremony publik (±3–4 minggu, termasuk rekrutmen)

| ID | Tugas | hO |
|---|---|---|
| D-T1 | **Alat ceremony**: `scripts/ceremony/` dengan `init` (r1cs + ptau → `0000.zkey`), `contribute` (offline, kontributor menjalankan di mesinnya), `verify-chain` (tiap kontribusi terhadap pendahulunya), `beacon`, `finalize` (ekspor vkey dan verifier), `transcript` (hash BLAKE2b tiap zkey, nama/atestasi, hash kontribusi) | 4 |
| D-T2 | **Verifikator publik** `scripts/ceremony/verify-transcript.js`: siapa pun dapat mengunduh ptau, r1cs, dan zkey final, lalu memverifikasi seluruh rantai dan bahwa verifier on-chain cocok | 2 |
| D-T3 | **Gladi bersih** (mock 5 kontributor + beacon) di testnet: zkey hasil gladi menghasilkan verifier yang dipakai `deploy-staging` dan lulus E2E browser | 2 |
| D-T4 | Rekrut ≥ 15 kontributor independen (komunitas ZK, mitra, auditor, anggota Safe); jadwal slot, panduan kontribusi (mesin air-gapped, entropi bebas, hapus berkas), saluran bantuan | 3 + E |
| D-T5 | Ceremony nyata untuk `withdraw` lalu `ragequit`; beacon drand dengan nomor ronde diumumkan lebih dulu | 2 + E |
| D-T6 | Publikasi: transkrip, hash, zkey final (IPFS + GitHub rilis), atestasi kontributor, panduan verifikasi | 1 |
| D-T7 | **Redeploy**: verifier baru, pool baru (verifier immutable), register dihubungkan lewat Safe; perbarui `public/zk/*` (wasm + zkey final), env, dan dokumen | 3 |

**Tes D:**

| ID | Skenario | Hasil |
|---|---|---|
| D-TEST1 | Rantai kontribusi: tiap `zkey verify` lulus; kontribusi yang diubah satu byte atau berasal dari ptau/r1cs lain ditolak | Lulus / ditolak |
| D-TEST2 | Beacon: hasil deterministik dari nilai beacon yang sama, berbeda untuk nilai lain; verifier menolak zkey tanpa beacon bila diwajibkan | Sesuai |
| D-TEST3 | `verify-transcript` dijalankan pada mesin bersih oleh orang lain (bukan pembuat) | Lulus |
| D-TEST4 | Ekspor verifier dari zkey final = bytecode yang di-deploy | Identik |
| D-TEST5 | Seluruh 151 tes + E2E browser (deposit → approve otomatis → withdraw/Courier/ragequit) pada pool dengan verifier baru | 100% |
| D-TEST6 | Proof dari **zkey dev lama ditolak** oleh verifier baru (membuktikan setup dev tidak lagi berlaku) | Ditolak |
| D-TEST7 | Waktu pembuktian di browser dengan zkey final (target ≤ 15 detik) dan ukuran unduhan | Dalam anggaran |

### E. Kesiapan mainnet (jembatan ke Fase 05, ±5 hO)

| ID | Tugas |
|---|---|
| E-T1 | Konfigurasi peluncuran: batas deposit awal (misalnya 10 ETH per note), guardian Safe 2-of-3 pada kontrak mainnet |
| E-T2 | Runbook insiden dilatih ulang; kontak keamanan dan program bug bounty (misalnya Immunefi) disiapkan |
| E-T3 | Tinjauan hukum (L13), halaman Compliance dan syarat penggunaan disetujui |
| E-T4 | Pemantauan: alarm saldo relayer/publisher, anomali nilai pool, selisih nullifier vs event |

## 4. Jadwal

| Minggu | Pekerjaan | Gerbang |
|---|---|---|
| 1 | A0 + A1; kirim paket ke calon auditor; rekrut kontributor ceremony | A-TEST1..4 hijau |
| 2–6 | B dan C berjalan paralel (`E`); D-T1/T2/T3 dikerjakan internal | Temuan awal diterima |
| 6–8 | Perbaikan, re-test, laporan akhir; **freeze sirkuit** | Auditor mengonfirmasi tidak ada temuan Kritis/Tinggi terbuka |
| 8–10 | D-T5/T6/T7: ceremony nyata, publikasi, redeploy, E2E | D-TEST1..7 hijau |
| 10 | E, serah ke Fase 05 | Seluruh gerbang hijau |

Paralelisme: B dan C berjalan bersamaan; D (alat dan gladi) bisa dimulai sebelum freeze, tetapi **ceremony nyata hanya setelah freeze sirkuit**.

## 5. Risiko

| Risiko | Mitigasi |
|---|---|
| Biaya dan antrean auditor | Pesan slot sejak minggu 1; lingkup dibuat sempit (tanpa `MarginaliaTokenPool`, verifier hasil generator) |
| Temuan Kritis di sirkuit setelah ceremony dijadwalkan | Ceremony hanya setelah freeze; D-T1..T3 di muka agar tinggal eksekusi |
| Kontributor kurang atau ada yang mundur | Rekrut ≥ 20 untuk target 15; slot cadangan; ceremony tetap sah selama ≥ 1 jujur, tetapi target 15 untuk kepercayaan publik |
| Kebocoran entropi atau kontributor tidak jujur | Cukup 1 kontributor jujur + beacon drand; panduan air-gapped; transkrip publik |
| Verifier on-chain tidak cocok dengan zkey final | D-TEST4 dan D-TEST3 wajib hijau sebelum mainnet |
| Setup dev masih dipakai tanpa sengaja | Tes D-TEST6; dokumen menyebut jelas "dev setup = testnet saja" dan CI memblokir deploy mainnet dengan verifier dev (`test/mainnet_guard.test.js` diperluas) |

## 6. Definisi selesai
1. Dua laporan audit (ZK dan kontrak) terpublikasi, tanpa temuan Kritis/Tinggi terbuka, tiap temuan punya tes regresi.
2. Ceremony Phase 2 selesai (≥ 15 kontributor + beacon), transkrip dan verifikator publik tersedia, diverifikasi pihak independen.
3. Verifier produksi = ekspor zkey final (D-TEST4) dan proof dev ditolak (D-TEST6).
4. Seluruh gerbang kualitas Fase 03 tetap hijau pada kode final.
5. Runbook, bug bounty, dan tinjauan hukum siap untuk Fase 05.

## 7. Keputusan yang diperlukan
1. **Anggaran audit** (kontrak dan ZK terpisah) dan firma pilihan.
2. **Daftar kontributor ceremony** (≥ 15) dan siapa koordinatornya.
3. **Alat ceremony**: alat sendiri (disarankan; sudah ada fondasinya) atau p0tion (butuh infrastruktur cloud).
4. **Apakah `MarginaliaTokenPool` (ERC-20) ikut diluncurkan**; bila tidak, tetap di luar audit.
5. **Batas deposit awal mainnet** dan program bug bounty.
