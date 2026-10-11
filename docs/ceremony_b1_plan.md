# MARGINALIA: Rencana B1, Phase-2 Trusted Setup Ceremony publik

**Status:** rencana (belum dijalankan) · **Disusun:** 2026-10-11 · **Rujukan:** `docs/ceremony_guide.md`, `docs/mainnet_readiness.md` (B1, B2), `scripts/ceremony/`

## 1. Tujuan dan kriteria selesai
Menghasilkan proving key dan verifier untuk `withdraw` dan `ragequit` yang tidak dapat dipalsukan **selama minimal satu kontributor jujur**. Setup yang dipakai sekarang adalah setup dev satu pihak: pemegang "toxic waste"-nya dapat memalsukan proof, sehingga mainnet tidak aman sampai ceremony ini selesai.

B1 dinyatakan selesai hanya jika **semua** terpenuhi (sebagian ditegakkan kode oleh `scripts/ceremony/mainnet-guard.js`):
1. >= 15 kontributor independen per sirkuit (batas `MIN_CONTRIBUTORS` di kode), nama unik, tiap kontribusi terverifikasi dalam rantai.
2. Beacon publik (drand) berasal dari ronde yang **diumumkan sebelum kontributor terakhir menyerahkan**, dengan >= 2^10 iterasi.
3. Phase 1 (`powersOfTau28_hez_final_15.ptau`) dipin di `docs/ceremony/phase1.json` setelah dicocokkan dengan sumber-sumber independen (ini juga B2).
4. Transkrip lolos `cli.js verify` yang dijalankan oleh **minimal dua pihak independen** selain koordinator, dan verifier Solidity di repo identik dengan ekspor `final.zkey`.
5. Seluruh artefak (r1cs, ptau, zkey tiap putaran, final.zkey, transkrip, atestasi) dipublikasikan.

## 2. Urutan yang tidak boleh dibalik
```
audit sirkuit (B4) -> perbaikan -> FREEZE sirkuit -> build O2 final (B3) -> ceremony (B1) -> redeploy (B5) -> freeze akhir (B6)
```
Setiap perubahan sirkuit setelah ceremony **membatalkan** ceremony (r1cs berubah). Karena itu:
- **Rekrutmen dan persiapan boleh mulai sekarang. Putaran kontribusi dimulai hanya setelah sirkuit dibekukan** (hasil audit sudah diperbaiki, hash r1cs sudah dikunci di `docs/audit/manifest.json`).
- Ceremony dijalankan untuk dua sirkuit dalam **satu sesi** per kontributor: `withdraw` (≈ 6,7 MB per zkey pada build O2) lalu `ragequit` (sangat kecil). Dua rantai terpisah, dua transkrip.

## 3. Peran
| Peran | Jumlah | Tugas | Syarat |
|---|---|---|---|
| Koordinator | 1 (+1 cadangan) | init, kirim/terima zkey, `verify-chain` tiap putaran, beacon, finalize, transkrip, publikasi | **Bukan** satu-satunya kontributor; tidak boleh menyimpan entropi kontributor |
| Kontributor | **>= 15 target 20** (cadangan untuk yang gagal atau tidak muncul) | menjalankan `contribute` di mesin sendiri, mengirim hasil, mengumumkan atestasi | independen satu sama lain dan dari tim inti |
| Verifikator independen | >= 2 | menjalankan `verify` dari berkas publik, melaporkan hasil secara terbuka | bukan koordinator, bukan kontributor ke-1 sampai ke-3 |
| Penjamin beacon | 1 | mengumumkan sumber beacon (ronde drand) sebelum putaran terakhir | publik, dapat diverifikasi siapa pun |

**Kriteria independensi kontributor** (campur sebanyak mungkin): organisasi berbeda, negara/zona waktu berbeda, perangkat dan OS berbeda, tidak saling mengenal secara dekat, minimal 3 orang di luar tim dan komunitas langsung proyek (pengembang ZK lain, peneliti keamanan, auditor, kontributor proyek terkait).

## 4. Rekrutmen
**Sumber kandidat:** komunitas Robinhood Chain dan Orbit, pengembang ZK/circom/snarkjs yang dikenal, peneliti keamanan, tim proyek ZK lain yang pernah mengadakan ceremony, kontributor sebelumnya pada ceremony publik, auditor yang tidak terlibat dalam audit proyek ini.

**Komitmen yang diminta dari kontributor** (sekitar 30-60 menit, sekali):
- Mesin yang dipercaya, ideal: baru di-boot dari live USB, **tanpa jaringan** saat kontribusi.
- Node.js >= 22 dan paket proyek (disediakan sebagai bundel, lihat 8).
- Mengumumkan atestasi publik (nama, contribution hash, hash zkey) di kanal yang mereka kendalikan (tweet, gist bertanda tangan).
- Menghapus entropi, riwayat shell, dan berkas sementara setelah selesai.

**Target waktu rekrutmen:** 6-8 minggu sebelum jadwal ceremony; kirim undangan ke ~35 orang untuk mendapat 20 komitmen.

### Template undangan (siap disalin)
> Subject: Join the MARGINALIA trusted-setup ceremony (about 45 min)
>
> MARGINALIA is a zero-knowledge shielded pool for Robinhood Chain. Before mainnet we run a public Phase-2 trusted-setup ceremony: each contributor adds randomness to the proving key. The setup is secure as long as **at least one** participant is honest and discards their secret, so every additional independent contributor matters.
>
> What we ask: run one command on a machine you trust (ideally offline), send us the resulting ~7 MB file, publicly post your contribution hash, then delete your secret. Window: <dates>. Your slot: <24 h window>. Instructions: <link to docs/ceremony_guide.md section 2>.
>
> Testnet audit pack and the ceremony toolkit are public in the repository. Reply with your preferred name for the public record and a contact for slot reminders.

## 5. Logistik pelaksanaan
- **Antrian berurutan** (rantai tidak bisa paralel): kontributor ke-N menerima `000(N-1).zkey` hanya setelah koordinator memverifikasi putaran sebelumnya lulus.
- **Slot 24 jam per kontributor** (bukan 24 jam penuh bekerja; hanya jendela untuk muncul). Jika slot lewat tanpa hasil, kontributor itu dilewati dan tercatat; kontributor berikutnya memakai berkas terakhir yang lulus.
- **Penyimpanan dan transfer berkas:** bucket objek sementara (tautan unggah bertanda tangan, satu tautan per slot) atau rilis GitHub. Setiap berkas diumumkan bersama SHA-256-nya; kontributor mencocokkan hash zkey masukan sebelum bekerja.
- **Alur satu putaran:** koordinator mengirim tautan dan hash → kontributor `contribute` → mengirim hasil dan mengumumkan atestasi → koordinator menjalankan `verify-chain` pada pasangan (sebelumnya, sesudahnya) → lulus: lanjut; gagal: tolak dan ulangi dengan slot cadangan.
- **Jadwal puncak:** 20 slot x sekitar 1 jam efektif + penyangga = 1-3 minggu kalender (tergantung ketersediaan; jangan paksakan satu hari).
- Dua sirkuit: untuk setiap slot, kontributor menjalankan perintah dua kali (`withdraw`, `ragequit`) dalam satu sesi.

## 6. Beacon
1. Umumkan **sebelumnya** sumber keacakan publik yang tidak dapat diprediksi dan diverifikasi siapa pun: ronde drand tertentu (League of Entropy; pilih rantai dan nomor ronde pada saat pengumuman, verifikasi nilainya lewat sumber resmi drand) yang waktu terbitnya **setelah** kontributor terakhir menyerahkan.
2. Pengumuman memuat: sumber, nomor ronde, perkiraan waktu terbit, dan jumlah iterasi (10 berarti 2^10; boleh lebih besar).
3. Setelah ronde terbit, ambil nilainya dari >= 2 titik akses drand independen dan bandingkan, lalu jalankan `cli.js beacon --hash <hex> --iterations 10`.
4. Mengapa ini penting: tanpa beacon yang tak dapat diprediksi, kontributor terakhir dapat memilih entropinya setelah melihat semua yang lain.

## 7. Phase 1 (B2, dikerjakan di awal)

**Status 2026-10-11 (provisional, sudah dipin di `docs/ceremony/phase1.json`):** berkas 37.831.832 byte dari `circom.info`; blake2b-512 `982372c867d229c2…969ae6e` sama dengan hash yang dipublikasikan README snarkjs, dan `snarkjs powersoftau verify` lulus (54 kontribusi + beacon, 2^10 iterasi). **Belum cukup:** baru satu publikasi sebagai pembanding. Tambahkan minimal dua sumber independen lagi sebelum ceremony nyata, lalu ubah `status` menjadi `VERIFIED`.

1. Unduh `powersOfTau28_hez_final_15.ptau` dari sumber resmi Hermez/PSE.
2. Cocokkan hash (blake2b) **dengan minimal tiga sumber independen** (publikasi resmi, repositori snarkjs, dan ceremony lain yang memakai berkas yang sama). Catat alamat sumber dan tanggal pemeriksaan.
3. Isi `docs/ceremony/phase1.json` (`blake2b`, `sources`). Selama `blake2b` masih `null`, guard mainnet menolak deploy.
4. Power 15 cukup: withdraw 11.432 constraint dan ragequit 693 jauh di bawah 2^15 = 32.768.

## 8. Yang disiapkan engineering sebelum hari-H
| # | Tugas | Keterangan |
|---|---|---|
| E1 ✅ | **Bundel kontributor** (selesai: `scripts/ceremony/contribute.js`, mandiri; perlu `snarkjs` dengan versi yang dipin): paket kecil (skrip `contribute`, versi Node yang dipin, checksum) beserta halaman petunjuk satu langkah | menurunkan hambatan; mengurangi kesalahan; hash bundel diumumkan |
| E2 ✅ | **Skrip koordinator** (selesai: `scripts/ceremony/coordinator.js`: start, next, receive, skip, status, seal; `test/ceremony_coordinator.test.js`): antrian slot, pencatatan hash masuk/keluar, verifikasi otomatis tiap putaran, log publik | berbasis `scripts/ceremony/lib.js`; keluaran siap dipublikasikan |
| E3 ✅ | **Halaman status** (selesai: `frontend/src/app/ceremony/`, data dari `coordinator.js publish` ke `frontend/public/ceremony/status.json`; kontak kontributor tidak pernah diekspor) di situs (mis. `/ceremony`): daftar kontributor, status putaran, hash, tautan atestasi, hitung mundur beacon | transparansi; memudahkan verifikasi pihak ketiga |
| E4 | **Tes ulang gladi bersih** pada sirkuit final (rantai penuh, proof nyata, 6/6 tanpa SKIP) dan **CI `circuits-o2`** hijau | sudah ada untuk build saat ini; ulangi setelah freeze |
| E5 ✅ | **Panduan verifikasi publik** (selesai: `docs/ceremony/VERIFY.md`, `scripts/ceremony/phase1-check.js`, `scripts/ceremony/check-deployed-verifier.js`) (satu halaman: unduh berkas, jalankan `verify`, bandingkan hash verifier dengan bytecode di chain) | agar siapa pun dapat memeriksa tanpa mempercayai kami |
| E6 | **Penjaga mainnet** tetap aktif; uji bahwa transkrip palsu/di bawah ambang ditolak (sudah ada, 10 tes) | tidak dilemahkan |

## 9. Risiko dan mitigasi
| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kontributor tidak muncul / lambat | jadwal mundur | 20 komitmen untuk 15 slot, slot cadangan, batas waktu per slot |
| Kontribusi rusak atau berbahaya | rantai gagal | `verify-chain` tiap putaran; tolak dan ulangi |
| Semua kontributor dikendalikan satu pihak | setup tidak aman | kriteria independensi, tiga orang luar wajib, atestasi publik |
| Koordinator curang | zkey diganti | verifikasi publik dari berkas dan transkrip; verifikator independen >= 2 |
| Kontributor terakhir menentukan hasil | bias | beacon drand yang diumumkan di muka |
| Sirkuit berubah setelah ceremony | ceremony batal | freeze sebelum mulai; hash r1cs dikunci di manifest |
| Kebocoran entropi kontributor | satu kontributor tidak jujur | cukup satu jujur; jangan mengandalkan satu orang |
| Berkas hilang / tidak ada cadangan | ulang dari awal | semua berkas antara disimpan dan di-hash di log publik |

## 10. Jadwal usulan (relatif terhadap freeze sirkuit = T0)
| Waktu | Kegiatan |
|---|---|
| **Sekarang** hingga T0 | pin Phase 1 (B2); rekrutmen (undangan ke ~35, target 20 komitmen); E1-E3, E5 |
| T0 minus 1 minggu | konfirmasi 20 slot; umumkan jadwal dan sumber beacon (ronde drand setelah slot terakhir) |
| T0 | freeze sirkuit, build O2 final, hash r1cs dikunci, gladi bersih akhir (E4) |
| T0 sampai T0+3 minggu | putaran kontribusi (`withdraw` + `ragequit`) |
| Kontribusi terakhir + 1-2 hari | beacon (ronde yang diumumkan), finalize, transkrip |
| + 3-7 hari | verifikasi independen oleh >= 2 pihak, publikasi seluruh artefak |
| Sesudahnya | B5: redeploy verifier dan pool, E2E dengan zkey final |

## 11. Keputusan yang dibutuhkan dari pemilik
1. **Siapa koordinator** (dan cadangannya)?
2. **Daftar kandidat kontributor** dan siapa saja yang menjadi orang luar tim.
3. **Kanal publikasi atestasi** yang diwajibkan (X, GitHub gist, atau lainnya).
4. **Sumber hash Phase 1** yang dianggap otoritatif (untuk B2).
5. **Rentang tanggal** yang diinginkan (bergantung pada jadwal audit B4).
6. Apakah halaman `/ceremony` (E3) dibuat di situs utama atau situs terpisah.
