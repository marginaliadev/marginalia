# MARGINALIA: Rencana Fase 03 "Hardening"

**Status:** Rencana (belum dikerjakan) · **Durasi:** 3–4 minggu (2 developer) atau 5–6 minggu (1 developer) · **Total:** ±28 hari-orang
**Pendahulu:** Testnet Alpha (aplikasi browser nyata, relayer, vault, E2E, keamanan dasar) · **Penerus:** Fase 04 "Audit & Ceremony"

> Penomoran: roadmap di web menyebut "03 Hardening"; dokumen lama (`engineering_master_plan.md`, `tasks_and_test_matrix.md`) menyebutnya "Phase 2". Isinya sama. Dokumen ini adalah rincian eksekusinya.

---

## 1. Tujuan, ruang lingkup, dan di luar lingkup

**Tujuan:** menghapus semua langkah manual dan titik kegagalan tunggal yang tersisa sebelum kode dibekukan untuk audit.

| Masalah di Alpha (terbukti saat uji live) | Diselesaikan oleh |
|---|---|
| Approval Magistrate = skrip manual + `git push` + tunggu cache GitHub (daftar basi membuat withdraw gagal) | H1 + H2 |
| Daftar label bergantung pada GitHub | H2 (IPFS) |
| Satu kunci (deployer) memegang Magistrate + guardian + owner | H3 (multisig) |
| Saldo relayer 0 → Courier gagal diam-diam; quote fee tidak akurat | H4 |
| Deposit ≈ 930k gas, withdraw ≈ 1,10 juta gas | H5 |
| Tes keamanan kontrak hanya ada di scratchpad, tidak ada CI | H6 |

**Di luar lingkup:** audit eksternal dan ceremony (Fase 04), ERC-20/multi-aset (`MarginaliaTokenPool`), mainnet, perubahan circuit (jangan ubah circuit: `zkey` dan verifier harus tetap sama, sehingga **tidak perlu ceremony ulang**).

## 2. Keputusan arsitektur

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Tidak ada perubahan kontrak untuk IPFS.** `publishRoot(root, data)` sudah menerima string; isi dengan `ipfs://<cid>`. Tabel Supabase `asp_roots.ipfs_cid` sudah ada | Mengurangi permukaan audit |
| D2 | **Magistrate = kunci "publisher" panas yang bisa dirotasi; Owner register = Safe multisig.** `setMagistrate()` oleh owner sudah ada | Multisig murni tidak cocok untuk penerbitan root otomatis tiap beberapa menit |
| D3 | **Urutan: H5 (redeploy pool) sebelum H3 (transfer peran).** Peran dipindah ke kontrak final, sekali saja | Menghindari dua kali transfer dan celah di antaranya |
| D4 | **Penerbitan root hanya saat ada perubahan, jarak minimal 15 menit.** Register hanya menyimpan 16 root terakhir (`ROOT_HISTORY_SIZE=16`); jarak 15 menit → jendela ≥ 4 jam. Penerbitan per 5 menit hanya memberi jendela 80 menit dan membuat proof pengguna kadaluarsa (`StaleAspRoot`) | Sliding window sudah ada di kontrak |
| D5 | **Top-up relayer tetap manual**, dengan alarm. Tidak ada kunci bernilai tinggi di server web | Prinsip hak minimum |
| D6 | **Target gas ditetapkan setelah spike.** Rencana lama menyebut deposit ≈ 220k, tetapi itu belum terukur | Lihat H5 (gerbang keputusan) |
| D7 | **Circuit dan verifier tidak disentuh** | Tidak perlu ceremony ulang; fokus audit tetap sempit |

## 3. Baseline terukur (testnet, per 2026-10-09)

| Operasi | Gas |
|---|---|
| deposit | 929.767 |
| withdraw (wallet) | 1.100.473 |
| ragequit | 348.556 |
| Biaya satu run E2E penuh | ≈ 0,000045 ETH |
| Tes | 78 unit lulus, E2E browser 14/14 |

## 4. Workstream, tugas, dan tes

Estimasi dalam hari-orang (hO). Setiap tugas punya acceptance criteria; tes diberi ID agar bisa dilacak di matriks (bagian 6).

### H1: Magistrate otomatis (6 hO)
Layanan terpisah `services/magistrate/` (worker Railway), **bukan** bagian server web.

| ID | Tugas | Detail | hO |
|---|---|---|---|
| H1-T1 | Modul kebijakan | `policy.js`: denylist (file/URL), antarmuka plugin untuk API screening eksternal. Default: denylist saja. Semua keputusan ditulis append-only ke tabel `asp_decisions` | 1 |
| H1-T2 | Indexer deposit | Baca event `Deposited` secara inkremental dengan kursor blok di tabel `magistrate_state` (migrasi SQL baru). Pakai `RH_LOGS_RPC_URL` (RPC gratis hanya 10 blok) | 1 |
| H1-T3 | Penyusun daftar | Label disetujui = deposit lolos kebijakan, **kecuali** yang sudah ragequit. Bangun pohon ASP dan bandingkan dengan `register.latestRoot()` | 0,5 |
| H1-T4 | Publisher | Pin ke IPFS (H2) → `publishRoot(root, "ipfs://cid")`. Idempoten, menangani nonce, kenaikan gas, dan retry. Hanya menerbitkan saat root berubah dan ≥ 15 menit sejak terbitan terakhir | 1,5 |
| H1-T5 | Penjadwal | Loop `--loop` tiap 60 detik (kerja nyata dibatasi D4). Mode `--once` untuk CI | 0,5 |
| H1-T6 | Manajemen kunci | `MAGISTRATE_PUBLISHER_KEY` baru (bukan deployer), saldo kecil. Didaftarkan lewat `setMagistrate` (sebelum H3: oleh deployer; sesudah H3: oleh Safe) | 0,5 |
| H1-T7 | Observabilitas | `/health`, metrik lag, webhook alarm: lag > 30 menit, saldo publisher < ambang, 3 kegagalan berturut-turut | 1 |

**Acceptance:** deposit baru muncul di daftar dan root terbit ≤ 20 menit tanpa tindakan manusia; tidak ada `git push`; menghentikan proses di tengah penerbitan lalu menyalakannya lagi tidak membuat duplikat maupun kehilangan label.

**Tes:**

| ID | Jenis | Skenario | Hasil yang diharapkan |
|---|---|---|---|
| H1-TEST1 | Unit | Kebijakan: alamat denylist → DENY; lainnya → APPROVE; keputusan tercatat | Log keputusan lengkap |
| H1-TEST2 | Unit | Pohon ASP dari layanan = root yang diterima kontrak (bandingkan dengan `lib/marginalia.js`) | Root identik |
| H1-TEST3 | Integrasi (hardhat) | Deposit → `--once` → root terbit → klien membuat proof withdraw dan berhasil | Lulus tanpa langkah manual |
| H1-TEST4 | Idempotensi | Jalankan `--once` dua kali berturut-turut | Hanya satu tx |
| H1-TEST5 | Kebijakan | Deposit dari alamat denylist | Labelnya tidak ada di pohon; withdraw ditolak; ragequit tetap bisa |
| H1-TEST6 | Ragequit | Deposit yang di-ragequit dikeluarkan dari terbitan berikutnya | Label tidak ada lagi |
| H1-TEST7 | Jendela root | Terbitkan 17 root berturut-turut (bypass cadence di tes) | Proof dari root ke-1 ditolak (`StaleAspRoot`); dengan cadence normal tidak terjadi |
| H1-TEST8 | Crash | `kill -9` di tengah penerbitan (setelah pin, sebelum tx), lalu restart | Tepat satu root terbit, tidak ada yang hilang |
| H1-TEST9 | Testnet soak | 48 jam, deposit sintetik tiap 30 menit | 100% deposit disetujui dalam ≤ 20 menit, 0 alarm palsu |

### H2: Daftar label di IPFS (4 hO)

| ID | Tugas | Detail | hO |
|---|---|---|---|
| H2-T1 | Format dokumen | JSON `{version, chainId, register, root, depth, labels[], generatedAt, prevCid}` | 0,5 |
| H2-T2 | Pustaka `lib/aspStore.js` | `pin()`, `fetch(cid)` dengan fallback multi-gateway, dan **verifikasi**: hitung ulang root dari `labels` = `root` pada dokumen = root on-chain | 1,5 |
| H2-T3 | Pin redundan | Dua penyedia (misalnya Pinata + web3.storage/Filebase); sukses jika ≥ 1, alarm jika hanya 1 | 0,5 |
| H2-T4 | Integrasi server | `frontend/src/lib/folio.ts`: urutan sumber = IPFS (CID dari `rootData(latestRoot)`) → cache Supabase → GitHub (cadangan). Logika "mengutamakan root terbaru" tetap | 1 |
| H2-T5 | Indeks | Isi `asp_roots` (root, ipfs_cid, jumlah label, tx) | 0,5 |

**Acceptance:** root baru terlihat di `/api/folio` ≤ 60 detik setelah terbit, tanpa git; isi yang dimanipulasi ditolak.

| ID | Jenis | Skenario | Hasil |
|---|---|---|---|
| H2-TEST1 | Integrasi | pin → fetch → verifikasi root | Cocok |
| H2-TEST2 | Keamanan | Dokumen dengan label ditambah/dikurangi, atau root salah | Ditolak, tidak pernah disajikan |
| H2-TEST3 | Ketahanan | Matikan satu gateway/penyedia | Tetap tersaji; alarm menyala |
| H2-TEST4 | Skala | 10.000 label: ukuran dokumen, waktu bangun pohon di browser (target < 3 detik), waktu fetch | Dalam anggaran |
| H2-TEST5 | E2E | Deposit di UI → otomatis disetujui → withdraw dari UI berhasil tanpa langkah manual | Lulus |

### H3: Multisig dan pemisahan peran (4 hO + spike 0,5)

| ID | Tugas | Detail | hO |
|---|---|---|---|
| H3-T0 | **Spike: ketersediaan Safe di Robinhood Chain** | Jika Safe belum ter-deploy, fallback: deploy Safe singleton sendiri, atau multisig 2-of-3 sederhana yang dipakai di Fase 04 | 0,5 |
| H3-T1 | Desain peran | Owner register → Safe; Magistrate → kunci publisher (H1); guardian pool → Safe (`transferGuardian` + `acceptGuardian`); deployer tidak memegang apa pun | 0,5 |
| H3-T2 | Skrip tata kelola | `scripts/governance/`: `transfer-roles.js`, `rotate-magistrate.js`, `pause-deposits.js`. Menghasilkan transaksi Safe, bukan mengirim dari EOA | 1,5 |
| H3-T3 | Eksekusi di testnet | Hanya **setelah H5 redeploy** (D3). Dokumentasikan alamat Safe dan penandatangan | 0,5 |
| H3-T4 | Runbook | Perbarui `docs/incident_response_runbook.md`: prosedur pause, kunci publisher bocor (Safe memanggil `setMagistrate`), kehilangan satu penandatangan | 1 |

**Acceptance:** tidak ada fungsi admin yang bisa dipanggil oleh satu EOA; rotasi publisher dari Safe berjalan saat layanan H1 aktif tanpa mengganggu deposit/withdraw.

| ID | Jenis | Skenario | Hasil |
|---|---|---|---|
| H3-TEST1 | Kontrak | Setelah transfer: deployer memanggil `setMagistrate`, `setPool`, `transferOwnership`, `setDepositsPaused`, `setMaxDepositAmount` | Semua revert |
| H3-TEST2 | Kontrak | Safe memanggil fungsi yang sama | Berhasil |
| H3-TEST3 | Kontrak | Publisher lama setelah rotasi mencoba `publishRoot` | Revert `NotMagistrate` |
| H3-TEST4 | Kontrak | Guardian (Safe) memanggil pause: deposit gagal, **withdraw dan ragequit tetap jalan** | Sesuai invarian |
| H3-TEST5 | Integrasi | Rotasi publisher di tengah layanan H1 yang berjalan | Layanan pulih dengan kunci baru ≤ 1 siklus |
| H3-TEST6 | Dry-run | Latihan insiden di testnet mengikuti runbook, dicatat waktunya | Tuntas ≤ 30 menit |

### H4: Relayer yang sehat dan quote akurat (3 hO)

| ID | Tugas | Detail | hO |
|---|---|---|---|
| H4-T1 | Quote akurat | Ganti 1.150.000 gas tetap dengan `estimateGas` dari withdraw contoh (di-cache), ditambah margin. Quote berlaku 120 detik; relay menerima fee ≥ 90% dari minimum saat ini (toleransi pergerakan harga gas) | 1 |
| H4-T2 | Kesehatan saldo | `/api/status` menampilkan `relayer.balanceEth` dan `healthy`. Env `RELAYER_MIN_BALANCE_ETH`. `/api/relay/quote` mengembalikan `relayerAvailable=false` saat rendah; UI menonaktifkan Courier dengan penjelasan | 0,75 |
| H4-T3 | Alarm | Webhook saat saldo rendah dan saat rasio gagal tinggi | 0,25 |
| H4-T4 | Kendali penyalahgunaan | Penguncian nonce/antrian untuk relay bersamaan, batas fee wajar, batas laju per IP | 0,5 |
| H4-T5 | Pelacakan profitabilitas | Catat biaya gas aktual vs fee per relay di `relayer_jobs` | 0,5 |

| ID | Jenis | Skenario | Hasil |
|---|---|---|---|
| H4-TEST1 | Akurasi | 20 relay di testnet: biaya aktual vs fee | Fee ≥ biaya pada ≥ 95% relay, rata-rata margin ≤ 25% |
| H4-TEST2 | Fungsional | Saldo di bawah ambang | Courier dinonaktifkan di UI; mode dompet tetap jalan |
| H4-TEST3 | Konkurensi | 5 relay serentak | Tidak ada konflik nonce, semua sukses atau ditolak jelas |
| H4-TEST4 | Negatif | Fee di bawah minimum / harga gas ×3 setelah quote | Penolakan dengan pesan jelas; saldo relayer tak berkurang |
| H4-TEST5 | UI | Tes browser: Courier tersedia vs nonaktif | Sesuai |

### H5: Optimasi gas (6 hO, dengan gerbang keputusan)

| ID | Tugas | Detail | hO |
|---|---|---|---|
| H5-T1 | Harness benchmark | `test/gas_benchmark.test.js` mencetak tabel deposit/withdraw/ragequit; simpan baseline di repo | 0,5 |
| H5-T2 | **Spike (2 hari, gerbang)** | `PoseidonYul.sol` (T3 dan T4) inline. Ukur penghematan di `_insert` dan deposit. **Jika penghematan < 25%, berhenti** dan catat hasilnya (D6) | 2 |
| H5-T3 | Fuzz diferensial | 10.000 vektor acak: Yul = `circomlibjs` = hasher on-chain lama | 0,5 |
| H5-T4 | Pool v2 | Ganti panggilan eksternal hasher di `_insert` dan komputasi commitment. Tetap kompatibel dengan circuit/verifier (tidak berubah). Tinjau juga penulisan storage per level | 2 |
| H5-T5 | Redeploy testnet | Pool baru, register tetap (`setPool`). Perbarui `deployments/*.json`, default frontend, env Railway, dan migrasi Supabase. Dokumentasikan jalur migrasi pengguna pool lama (ragequit/withdraw) | 1 |

**Target (ditetapkan ulang setelah spike):** deposit ≤ 450k (−50%), withdraw ≤ 650k (−40%). Asumsi, belum terbukti.

| ID | Jenis | Skenario | Hasil |
|---|---|---|---|
| H5-TEST1 | Fuzz | Poseidon Yul vs referensi, 10.000 vektor | 100% identik |
| H5-TEST2 | Paritas | Setelah N=1..200 insert, root pohon `lib/marginalia.js` = root on-chain | Identik |
| H5-TEST3 | Regresi | Seluruh 78 tes + invarian + `mainnet_guard` pada pool v2 | Hijau |
| H5-TEST4 | Benchmark | Tabel gas v1 vs v2 | Memenuhi target atau keputusan "berhenti" terdokumentasi |
| H5-TEST5 | Penjaga CI | Gagalkan build bila gas > baseline + 2% | Aktif |
| H5-TEST6 | E2E | Seluruh E2E browser pada pool v2 di testnet | 14/14 |

### H6: Integrasi, keamanan, dan rilis kandidat (5 hO)

| ID | Tugas | Detail | hO |
|---|---|---|---|
| H6-T1 | Promosikan tes keamanan | Pindahkan tes kontrol akses dan manipulasi proof (saat ini di scratchpad) ke `scripts/test-security-onchain.js` | 1 |
| H6-T2 | Perbarui E2E | Hapus langkah approval manual (kini otomatis dari H1); sweeper dan ledger tetap | 1 |
| H6-T3 | CI | GitHub Actions: hardhat test, `tsc`, lint, `npm audit --omit=dev`, penjaga gas, pemindaian rahasia | 1 |
| H6-T4 | Soak 72 jam | Lalu lintas sintetik 15 menit sekali terhadap seluruh sistem | 0,5 (+ waktu tunggu) |
| H6-T5 | Dokumen + freeze | Perbarui README, roadmap web, runbook, `threat_model_and_audit_pack.md`. Tag `v0.3.0-rc1` | 1,5 |

| ID | Jenis | Skenario | Hasil |
|---|---|---|---|
| H6-TEST1 | Keamanan | 37 pemeriksaan kontrol akses/proof pada kontrak final | 100% lulus |
| H6-TEST2 | Soak | 72 jam, tidak ada ETH tertinggal (ledger), biaya hanya gas | Z1/Z2 lulus, 0 alarm kritis |
| H6-TEST3 | Pemulihan | Drill crash (setelah deposit, setelah withdraw parsial, reload halaman) di sistem final | Seluruh dana pulih otomatis |
| H6-TEST4 | Produksi | `scripts/test-browser-e2e.js` terhadap https://marginaliazk.tech | Seluruh langkah lulus, termasuk Courier |

## 5. Jadwal (2 developer; 1 developer ≈ 1,5×)

| Minggu | Pekerjaan | Gerbang akhir minggu |
|---|---|---|
| **1** | H5-T1/T2/T3 (benchmark + spike) · H2-T1/T2/T3 · H3-T0 (spike Safe) · H4-T1/T2 | Keputusan go/no-go gas (D6); Safe tersedia atau fallback dipilih |
| **2** | H1-T1…T5 · H5-T4 (pool v2) · H2-T4/T5 · H4-T3/T4/T5 | Magistrate otomatis lulus H1-TEST1…8 di hardhat |
| **3** | H5-T5 (redeploy) → **lalu** H3-T1…T4 · H1-T6/T7 di pool baru · H1-TEST9 (soak 48 jam dimulai) | Peran berada di Safe; layanan berjalan di pool v2 |
| **4** | H6 seluruhnya · soak 72 jam · dokumen dan freeze | **Rilis kandidat `v0.3.0-rc1`** siap diserahkan ke audit |

**Jalur kritis:** H5 spike → H5 redeploy → H3 transfer peran → soak → freeze. H1/H2/H4 bisa paralel dengan H5.

## 6. Matriks gerbang kualitas (harus hijau sebelum freeze)

| Gerbang | Kriteria |
|---|---|
| Unit/kontrak | Seluruh tes hardhat (≥ 78 + tes baru) hijau |
| Keamanan on-chain | H6-TEST1 100% |
| E2E | Browser E2E 14/14 di testnet **dan** produksi |
| Otomasi | Tidak ada langkah manual: deposit → disetujui → withdraw, diverifikasi H1-TEST9 + H2-TEST5 |
| Tata kelola | H3-TEST1…4 hijau; tidak ada admin EOA tunggal |
| Gas | Tidak melewati baseline v2 (+2%) |
| Dependensi | `npm audit --omit=dev` = 0 di root dan frontend |
| Dana | Z1/Z2 lulus di setiap run E2E dan soak |

## 7. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Safe belum ada di Robinhood Chain | H3 terblokir | Spike H3-T0 di minggu 1; fallback multisig sendiri |
| Penghematan gas jauh di bawah 40% | Target meleset | Gerbang di H5-T2; hentikan bila < 25%, dokumentasikan |
| Daftar label basi atau jendela root habis | Withdraw ditolak | D4 (cadence), "root terbaru diutamakan" (sudah ada), alarm lag |
| Penyedia IPFS mati | Daftar tak terbaca | Pin redundan + fallback multi-gateway + cadangan Supabase |
| Kunci publisher bocor | Daftar disalahgunakan | Hak minimum, saldo kecil, Safe bisa merotasi (`setMagistrate`) kapan saja |
| RPC gratis membatasi `getLogs` 10 blok | Indexer lambat | Kursor inkremental + `RH_LOGS_RPC_URL`; pertimbangkan RPC berbayar |
| Redeploy pool memecah alamat di berbagai tempat | Server/klien tak sinkron | Daftar periksa deploy; klien sudah menolak server dengan pool berbeda ("Server Misconfigured") |
| Kebijakan screening tidak memadai untuk mainnet | Risiko kepatuhan | Antarmuka plugin sekarang; pilih penyedia sebelum mainnet (di luar Fase 03) |

## 8. Rilis dan rollback

- Urutan rilis: H4 (aman, tanpa kontrak) → H2+H1 (layanan, flag `MAGISTRATE_AUTO=on`) → H5 (pool v2) → H3 (peran).
- **Rollback layanan:** matikan worker H1; skrip manual lama tetap berfungsi; server tetap punya cadangan GitHub.
- **Rollback pool v2:** alamat pool lama tetap tercatat; frontend mendukung ganti alamat lewat env; pengguna pool lama keluar lewat ragequit/withdraw.
- Tidak ada langkah yang tidak bisa dibalik kecuali transfer peran ke Safe, jadi lakukan terakhir dan hanya setelah soak hijau.

## 9. Definisi selesai (DoD)

1. Semua gerbang di bagian 6 hijau.
2. Tag `v0.3.0-rc1` dan paket audit (`threat_model_and_audit_pack.md`) diperbarui.
3. Runbook insiden sudah dilatih (H3-TEST6).
4. README dan roadmap web menyatakan Fase 03 selesai, dengan angka gas hasil ukur.
5. Tidak ada kunci admin tunggal, tidak ada langkah manual dalam alur pengguna.

## 10. Keputusan yang diperlukan dari pemilik proyek

1. **Penyedia IPFS** (Pinata / web3.storage / Filebase) dan anggaran.
2. **Tiga penandatangan Safe** dan siapa yang menyimpan kunci masing-masing.
3. **Sumber denylist** (daftar sanksi publik atau penyedia berbayar).
4. **Siapa yang menjalankan worker Magistrate** dan di mana (Railway terpisah dari server web).
5. **Persetujuan target gas** setelah spike minggu 1.
6. **RPC berbayar** untuk indexer, atau menerima ketergantungan pada RPC publik.
