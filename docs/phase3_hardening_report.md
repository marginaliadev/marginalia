# MARGINALIA: Laporan Eksekusi Fase 03 "Hardening"

**Tanggal:** 2026-10-09 · **Rujukan:** `docs/phase3_hardening_plan.md`
**Ringkasan:** semua pekerjaan *kode dan tes* untuk H1–H4 dan H6 selesai dan lulus; H5 dihentikan secara sah oleh gerbang keputusan. **Belum selesai:** soak 48/72 jam, penyedia IPFS nyata, transfer peran Safe pada deployment live, dan deploy ke situs produksi (tidak ada yang di-push/di-deploy dalam sesi ini).

## 1. Hasil tes

| Suite | Cara menjalankan | Hasil |
|---|---|---|
| Seluruh tes hardhat (tanpa `.env`, seperti CI) | `npx hardhat test` | **141 lulus** (sebelumnya 78) |
| Keamanan kontrak (21 tes, error spesifik) | `test/security_onchain.test.js` | 21/21 |
| Penjaga regresi gas | `test/gas_benchmark.test.js` | lulus (baseline 944.941 / 1.067.838 / 321.308) |
| Layanan Magistrate (14 tes) | `test/magistrate_service.test.js` | 14/14 |
| Penyimpanan IPFS (10 tes) | `test/asp_store.test.js` | 10/10 |
| Pohon Merkle massal = insert satu per satu | `test/merkle_bulk.test.js` | 13/13 |
| Paritas SDK browser (TypeScript) vs SDK Node | `test/browser_sdk_parity.test.js` | 4/4 |
| Kesehatan relayer, kebijakan fee, webhook | `scripts/test-relayer-health.js` | 13/13 |
| Tata kelola dengan **Safe v1.4.1 asli** di testnet | `scripts/test-governance.js` | 15/15 |
| E2E browser penuh, **Magistrate otomatis**, deployment staging di testnet | `AUTO_MAGISTRATE=1 DEPLOYMENT_FILE=notes/staging-deployment.json node scripts/test-browser-e2e.js` | 15/15 (dua run; biaya ≈ 0,00006 ETH gas) |

## 2. Per workstream

### H1: Magistrate otomatis ✔ (kode + tes), ✖ soak
- `services/magistrate/` (kebijakan denylist, store atomik + log audit append-only, layanan, CLI dengan health endpoint, kunci instance tunggal, alarm webhook).
- Terbukti: idempoten, dibatasi laju (3 jam simulasi → 12 publikasi, root tertua tetap valid), kontrol negatif (tanpa batas, 18 publikasi menghabiskan jendela 16 root), crash antara pin dan publish menghasilkan CID yang sama, kehilangan state tidak mengubah apa pun, deposit ragequit dan alamat denylist yang ditambahkan belakangan keluar dari daftar berikutnya, hanya kunci Magistrate yang bisa menerbitkan.
- Di testnet: deposit dari UI → daftar terbit otomatis dalam **22–67 detik** tanpa langkah manual.
- **Belum:** soak 48 jam (H1-TEST9) dan worker belum di-deploy di Railway.
- **Dilengkapi kemudian:** `SupabaseStore` (state, verdict, log *append-only*, indeks `asp_roots`) + migrasi `supabase/migrations/20261009000000_phase3_magistrate.sql` + `scripts/supabase-check.js` (8 tes). **Migrasi belum diterapkan pada proyek Supabase Anda** (DDL harus dijalankan di SQL Editor); pemeriksa melaporkan 5 item yang kurang.

### H2: IPFS ✔ (kode + tes), ✖ penyedia nyata
- `lib/aspStore.js` (pin ke beberapa penyedia, fetch dengan fallback multi-gateway, verifikasi root on-chain), pembaca sisi server `frontend/src/lib/aspStore.ts`, dan `folio.ts` memakai CID dari `rootData(latestRoot)` sebagai sumber pertama.
- Tidak perlu perubahan kontrak (string `data` sudah ada).
- Integritas tidak bergantung pada gateway: dokumen dengan label tambahan, himpunan lain yang konsisten, versi salah, duplikat, angka non-desimal, dan CID traversal semuanya ditolak.
- **Temuan skala:** membangun pohon 10.000 label memakan **21 detik** → diganti pembangunan massal per level: **1,3 detik** (Node), identik bit-per-bit dengan insert (12 kasus, termasuk path).
- **Target tidak tercapai:** SDK browser (JS murni) membutuhkan **4,6 detik** untuk 10.000 daun, target rencana 3 detik. Tidak relevan pada skala sekarang (puluhan daun); jalur perbaikan bila daftar > ±5.000: cache layer di IndexedDB dan insert hanya daun baru.
- **Belum diuji:** Pinata/Filebase sungguhan (tidak ada kredensial); diuji dengan server tiruan dan `services/magistrate/dev-ipfs.js`.

### H3: Multisig ✔ di staging, ✖ di deployment live
- Safe v1.4.1 **sudah ter-deploy** di Robinhood Testnet (spike H3-T0: risiko terbesar hilang).
- `scripts/governance/` (`transfer-roles.js` dengan dry-run bawaan dan pemeriksaan prasyarat, `rotate-magistrate.js`, `pause-deposits.js`).
- Terbukti dengan Safe 2-of-3 nyata: deployer kehilangan semua 8 fungsi admin dengan error spesifik (`NotOwner` / `NotMagistrate` / `NotGuardian`); satu tanda tangan ditolak; rotasi 1,6 detik; publisher lama `NotMagistrate`; pause 1,4 detik, deposit ditolak sementara **ragequit tetap berjalan**; skrip menolak publisher=deployer, Safe ber-threshold 1, dan Safe yang memuat deployer.
- **Belum:** pemindahan peran pada deployment live. Menunggu keputusan tiga penandatangan (bagian 4).

### H4: Relayer sehat ✔
- Saldo/kesehatan di `/api/status`, Courier otomatis dinonaktifkan (UI + API 503) di bawah `RELAYER_MIN_BALANCE_ETH`, alarm webhook maksimal sekali per 10 menit, toleransi fee 90% dan batas fee ≤ 50% nilai, relay diserialisasi (satu nonce), biaya gas aktual vs fee dicatat.
- Data nyata: fee 25,3 µETH vs biaya gas ≈ 10,8 µETH; saldo relayer **naik** setelah relay.
- **Dilengkapi kemudian:** quote kini empiris (persentil ke-90 gas relay nyata + headroom; konstanta terukur sebelum ada 3 sampel) dan saat relay `eth_estimateGas` transaksi sebenarnya harus tertutup fee (6 tes model gas); biaya gas vs fee dicatat di `relayer_jobs`.
- **Belum:** pengukuran akurasi H4-TEST1 pada 20 relay nyata (perlu preview dengan relayer berdana).

### H5: Optimasi gas: **dihentikan oleh gerbang keputusan** (sesuai rencana)
- Spike: Poseidon assembly (`poseidon-solidity`) **bit-identik tetapi tidak lebih murah**: T3 +4,5%, T4 +75% lebih mahal dibanding hasher circomlibjs saat ini. 20 hash T3 = 644k dari 930k gas deposit; klaim lama "deposit ≈ 220k" tidak terbukti.
- Tidak ada perubahan kontrak, jadi **tidak ada redeploy dan tidak ada ceremony ulang**. Artefak spike dihapus dari repo agar permukaan audit tidak bertambah; yang dipertahankan adalah penjaga regresi gas.
- Peluang kecil yang tidak dikerjakan (≈ 4%): `zeros` sebagai konstanta kode, bukan `SLOAD`. Di rantai ini biaya gas sangat murah (0,01 gwei), jadi tidak dikejar.

### H6: Integrasi ✔ (kecuali soak)
- Tes keamanan kontrak dipindah ke CI (21 tes, error spesifik), CI diperbarui (Node 22, job frontend, audit produksi, pemindaian rahasia), E2E mendukung Magistrate otomatis dan deployment alternatif, runbook insiden diperbarui (model tata kelola, rotasi, pause).
- **Belum:** soak 72 jam, tag `v0.3.0-rc1`.

## 3. Temuan dan koreksi di sepanjang jalan
1. Keputusan D6 terbukti benar: gerbang H5 menghemat ±1 minggu kerja.
2. Pembangunan pohon `O(20n)` adalah bottleneck nyata, sekarang `O(2n)`.
3. Tes saya sendiri ada yang terlalu longgar (hanya memeriksa "revert"); sudah diperketat ke error spesifik.
4. RPC publik membaca saldo satu blok terlambat; tes E2E sekarang mem-polling selisih saldo, bukan menganggap Courier rusak (Courier terbukti berjalan di chain).
5. Fee relayer belum tentu menutup biaya bila harga gas melonjak >10% antara quote dan relay (diterima toleransi 90%); pada skala ini aman, perlu dipantau lewat log `[relay] ... net=`.

## 3b. Keputusan pemilik (diterima 2026-10-09) dan tindak lanjutnya

| Keputusan | Tindak lanjut di kode/dokumen |
|---|---|
| Safe **2-of-3**, tiga kunci di hardware wallet berbeda; kunci publisher terpisah dan hanya boleh publish | Sudah sesuai rancangan dan teruji (15/15). Safe v1.4.1 resmi tersedia di chain 46630 (dicek di H3-T0). |
| IPFS: **Pinata + Filebase** | Konfigurasi didokumentasikan (`PINATA_JWT`, `IPFS_RPC_URL`+`IPFS_RPC_AUTH`); keduanya memakai kode pinner yang sama dengan tes. Belum diuji dengan kredensial sungguhan. |
| Denylist: sumber publik dulu, berbayar menjelang mainnet | Dibangun: kebijakan OFAC (daftar nyata 120 alamat termuat), Chainalysis free API, daftar manual; komposisi fail-closed; 10 tes baru. |
| Peninjau harian; override lewat Safe; proses banding di halaman Compliance | Bagian "Screening policy & appeals" ditambahkan ke `/compliance`. Override lewat Safe adalah kebijakan, belum ditegakkan secara teknis. |
| Worker di Railway, restart otomatis, RPC berbayar + cadangan | `services/magistrate/railway.json` (restart ALWAYS); `RH_LOGS_RPC_URL` menerima beberapa URL dengan failover otomatis. |
| Deploy ke produksi lewat staging dulu | Urutan di bagian 5. Staging di testnet sudah dijalankan penuh (15/15); preview Railway tinggal dibuat. |
| Metadata `canonical` / `og:url` salah | Diperbaiki (lihat 3c). |

## 3c. Temuan SEO / link-preview dari pemeriksaan situs
- `canonical` dan `og:url` mengarah ke domain Railway lama; sekarang `https://marginaliazk.tech` (bisa diganti dengan `NEXT_PUBLIC_SITE_URL`).
- **Bug yang lebih besar:** semua halaman ber-`canonical` ke `/` (menyuruh mesin pencari menganggap `/app`, `/explorer`, dst. sebagai duplikat beranda). Sekarang canonical per halaman.
- **Gambar OG tidak pernah ada:** `/images/marginalia-hero.webp` mengembalikan 404 di situs live, jadi pratinjau tautan di X tanpa gambar. Diganti gambar yang dibangkitkan (`opengraph-image` / `twitter-image`, PNG 1200x630) dan dipasang di tiap halaman.
- Judul halaman memakai template `"%s | MARGINALIA"`; halaman 404 diberi `noindex`.

## 4. Keputusan yang masih diperlukan dari pemilik proyek
1. **Nama tiga penandatangan Safe** dan alamat hardware wallet mereka (untuk `transfer-roles.js`).
2. **Kredensial**: Pinata JWT, kunci IPFS RPC Filebase, kunci Chainalysis free API, dan RPC berbayar + cadangan.
3. **Nama peninjau harian** untuk keputusan screening.
4. Membuat layanan Railway kedua (worker) dan environment **preview/staging**; saya tidak punya akses Railway.

## 5. Langkah berikutnya (urutan aman, sesuai keputusan "lewat staging dulu")
1. Commit + push ke cabang/preview; **deploy web ke preview Railway** (tanpa perubahan kontrak). Perbaikan stale-ASP adalah yang paling penting.
2. Di preview jalankan alur penuh: deposit, persetujuan otomatis, withdraw lewat relayer (`APP_URL=<preview> node scripts/test-browser-e2e.js`; di preview pakai `ASP_PUBLISH_CMD` atau worker bila sudah ada). Simpan deployment lama untuk rollback.
3. Deploy worker Magistrate (Railway terpisah) dengan kunci publisher baru + dua pinner; `setMagistrate(publisher)` oleh deployer.
4. Promosikan web ke produksi. Soak 48 jam di testnet live, lalu 72 jam untuk sistem utuh.
5. Setelah soak hijau: `transfer-roles.js` (dry-run dulu) ke Safe 2-of-3.
6. Tag `v0.3.0-rc1` dan serahkan ke Fase 04.
