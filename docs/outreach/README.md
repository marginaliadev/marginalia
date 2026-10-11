# Outreach kit: audit request and ceremony recruitment (ready to send)

Semua teks di sini siap disalin. Isian yang wajib diganti ditandai `<...>`. Urutan kerja:

| # | Kirim | Kepada | Berkas |
|---|---|---|---|
| 1 | Permintaan penawaran audit | 3-4 firma (daftar di bawah) | [`audit_email.md`](audit_email.md) |
| 2 | Undangan kontributor ceremony (email/DM) | ~35 kandidat untuk 20 komitmen | [`contributor_invite.md`](contributor_invite.md) |
| 3 | Postingan publik rekrutmen | X @MarginaliaZK, komunitas Robinhood Chain/Orbit | [`contributor_invite.md`](contributor_invite.md) bagian 3 |
| 4 | Pelacak kandidat | koordinator | [`contributors_tracker.csv`](contributors_tracker.csv) |

## Sebelum mengirim email audit
1. Di mesin tempat bundel dibuat: `sha256sum .audit-build/marginalia-audit-1fa8c667.zip`, tempel hasilnya ke email.
2. Pastikan commit `1fa8c667` sudah ada di GitHub (`git push`), karena auditor akan membandingkan bundel dengan repo.
3. Lampirkan bundel dan `docs/audit/AUDITOR_PACKAGE.md`. Jika bundel > 10 MB, unggah sebagai rilis GitHub dan kirim tautannya.

## Kandidat firma audit (Groth16/circom + Solidity)
Cek dulu halaman kontak resmi masing-masing; jangan memakai alamat dari pihak ketiga.

| Firma | Kenapa relevan |
|---|---|
| Veridise | fokus ZK, alat analisis circom (Picus) |
| zkSecurity | spesialis ZK, banyak laporan circom/Groth16 |
| Trail of Bits | Solidity + kriptografi, laporan publik |
| Zellic | Solidity + ZK |
| Nethermind Security | Solidity + ZK, juga ekosistem L2 |
| Least Authority | kriptografi dan ceremony |

Kirim ke minimal 3 sekaligus, catat tanggal kirim, follow-up setelah 5 hari kerja. Pilih dengan tabel seleksi di `docs/audit/RFP_EMAIL.md`.

## Aturan rekrutmen (dari rencana B1)
- Minimal 15 kontributor independen per sirkuit (dikunci di kode), target 20 komitmen.
- Minimal 3 orang benar-benar di luar tim dan komunitas langsung proyek.
- Tanggal slot belum dijanjikan sampai audit selesai dan sirkuit dibekukan; undangan menyebut "rentang perkiraan".
- Kontak kontributor hanya disimpan oleh koordinator (`contributors.json`, tidak di-commit); halaman publik tidak pernah menampilkannya.
