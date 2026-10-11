# Slither triage (kode saat ini, 2026-10-09)

Perintah: `slither . --hardhat-ignore-compile --filter-paths "node_modules|Groth16Verifier|RagequitVerifier|mocks|TokenPool"` (setelah `npx hardhat clean && npx hardhat compile`; hasil dari artefak basi tidak dipakai). Dianalisis: 12 kontrak, 102 detektor, **9 hasil, 0 Tinggi, 0 Sedang**.

| Detektor | Dampak | Lokasi | Keputusan |
|---|---|---|---|
| calls-loop (3 instance) | Low | `MarginaliaPool._h2` dipanggil dari `_insert` (pohon 20 level) | **Diterima.** Panggilan ke kontrak Poseidon `immutable` yang tepercaya dan tanpa state; loop terbatas 20 iterasi. Menggantinya dengan Poseidon inline diukur tidak lebih murah (spike H5: +4,5% gas) |
| cyclomatic-complexity | Info | `MarginaliaPool.withdraw` (13) | Diterima. Seluruh cek harus berurutan sebelum efek; dipecah akan menyulitkan audit urutan cek-efek-interaksi |
| low-level-calls | Info | `MarginaliaPool._send` | Diterima. Pengiriman ETH memang memakai `call`; dilindungi `nonReentrant`, efek ditulis sebelum interaksi, hasil dicek (`TransferFailed`) |
| naming-convention (4) | Info | parameter dengan awalan `_` | Diterima (gaya) |

Catatan: laporan lama yang memuat `arbitrary-send-eth` (High) dan `missing-zero-check` berasal dari artefak build lama; pada kode saat ini kedua hal itu tidak ada (konstruktor dan setter memeriksa alamat nol, dan pengiriman ETH hanya ke penerima yang terikat proof).
