# MARGINALIA: Panduan Phase-2 Trusted Setup Ceremony

Tujuan: menghasilkan *proving key* dan verifier yang tidak dapat dipalsukan **selama minimal satu kontributor jujur**. Setup yang dipakai sekarang (`scripts/build-circuit.sh`) hanya untuk testnet: satu pihak memegang "toxic waste" dan dapat memalsukan proof. Mainnet **diblokir** oleh `scripts/ceremony/mainnet-guard.js` sampai ceremony ini selesai.

Alat: `node scripts/ceremony/cli.js help`. Semua langkah sudah dilatih dengan gladi bersih otomatis (`test/ceremony_rehearsal.test.js`, `scripts/ceremony/rehearsal.js`).

## 0. Prasyarat (sekali, oleh koordinator)
1. Sirkuit **dibekukan** (hasil audit sudah diperbaiki). Kompilasi dengan opsi **`--O2`** yang di-pin: `node -e 'require("./scripts/ceremony/compile").compileCircuit("withdraw")'` (output `.audit-build/withdraw.r1cs`). circom2 secara default memakai `--O1` yang menghasilkan sirkuit lain; jangan bergantung pada default kompiler.
2. **Phase 1**: gunakan Powers of Tau publik Hermez/PSE (`powersOfTau28_hez_final_15.ptau`, power 15 cukup untuk withdraw 11.432 constraint). Unduh dari sumber resmi, cocokkan hash dengan **beberapa sumber independen**, lalu isi `docs/ceremony/phase1.json` (`blake2b`). Hash dihitung dengan `node -e 'require("./scripts/ceremony/lib").hashFile("file.ptau").then(console.log)'`.
3. Rekrut **minimal 15 kontributor independen** (ditetapkan di kode: `MIN_CONTRIBUTORS`), idealnya dari organisasi berbeda, plus satu orang yang bukan bagian tim. Kirim panduan bagian 2.
4. Umumkan di muka **sumber beacon**: nomor ronde drand (atau blok masa depan) yang akan dipakai sebagai keacakan publik.

## 1. Koordinator: menjalankan ceremony (per sirkuit: `withdraw`, lalu `ragequit`)
```bash
# zkey #0 (deterministik: siapa pun dapat menghitung ulang dan membandingkan hash)
node scripts/ceremony/cli.js init --r1cs .audit-build/withdraw.r1cs --ptau powersOfTau28_hez_final_15.ptau --out ceremony/withdraw/0000.zkey

# untuk setiap kontributor N: kirim 000(N-1).zkey, terima 000N.zkey, lalu SEGERA verifikasi
node scripts/ceremony/cli.js verify-chain --r1cs .audit-build/withdraw.r1cs --ptau powersOfTau28_hez_final_15.ptau \
  --files ceremony/withdraw/0000.zkey,ceremony/withdraw/0001.zkey
# (tolak kontribusi yang gagal; kontributor berikutnya memakai berkas terakhir yang LULUS)

# setelah kontributor terakhir: segel dengan beacon yang diumumkan di muka
node scripts/ceremony/cli.js beacon --in ceremony/withdraw/0015.zkey --out ceremony/withdraw/final.zkey --hash <hex drand> --iterations 10

# ekspor kunci verifikasi + kontrak verifier
node scripts/ceremony/cli.js finalize --zkey ceremony/withdraw/final.zkey --out ceremony/withdraw/out --circuit withdraw --contract Groth16Verifier
```
Lalu tulis `ceremony/withdraw/ceremony.json` (contoh format di bawah) dan hasilkan transkrip:
```bash
node scripts/ceremony/cli.js transcript --config ceremony/withdraw/ceremony.json --out ceremony/withdraw/transcript.json
```
```json
{
  "circuit": "withdraw",
  "r1cs": "../../.audit-build/withdraw.r1cs",
  "ptau": "../../powersOfTau28_hez_final_15.ptau",
  "ptauSource": "Hermez/PSE powersOfTau28_hez_final_15.ptau (https://...)",
  "rounds": [
    { "contributor": "Nama Kontributor", "file": "0001.zkey", "contributionHash": "<hash dari kontributor>", "attestation": "https://... (tweet/gist bertanda tangan)" }
  ],
  "beacon": { "hash": "<hex drand>", "source": "drand round 1234567", "iterationsExp": 10, "contributionHash": "<dari output beacon>" },
  "finalZkey": "final.zkey",
  "finalization": { "vkeyHash": "<dari finalize>", "verifierHash": "<dari finalize>", "contractName": "Groth16Verifier" }
}
```

## 2. Kontributor
Lakukan di mesin yang Anda percayai (idealnya tanpa jaringan dan bersih, misalnya live USB):
```bash
node scripts/ceremony/cli.js contribute --in 0003.zkey --out 0004.zkey --name "Nama Anda"
```
Keluaran berisi **contribution hash** dan hash berkas. (1) kirim `0004.zkey` ke koordinator, (2) **publikasikan** nama + contribution hash di kanal publik yang Anda kendalikan (atestasi), (3) hapus berkas, riwayat shell, dan matikan mesin. Entropi dibuat acak 64 byte; Anda boleh menambahkan `--entropy "kalimat acak Anda"`. Jangan pernah memakai ulang entropi dan jangan menyimpannya: kerahasiaan entropi itulah yang menjamin keamanan.

## 3. Siapa pun: memverifikasi hasil (tanpa mempercayai koordinator)
Cukup berkas publik: r1cs, ptau, `final.zkey`, `transcript.json`, kontrak verifier.
```bash
node scripts/ceremony/cli.js verify --transcript transcript.json --r1cs withdraw.r1cs --ptau powersOfTau28_hez_final_15.ptau \
  --zkey final.zkey --verifier Groth16Verifier.sol --min 15 --ptau-hash <hash Phase 1 dari sumber independen>
```
Hasilnya daftar PASS/FAIL. Yang diperiksa: hash r1cs/ptau/zkey, zkey sah terhadap sirkuit dan ptau, setiap kontribusi yang diumumkan ada di dalam zkey **dengan urutan yang sama**, nama kontributor unik, jumlah minimum, beacon adalah kontribusi **terakhir** dengan ≥ 2^10 iterasi dan nilainya sama dengan yang diumumkan, kunci verifikasi dan kontrak Solidity yang diekspor ulang sama persis dengan yang dipublikasikan.
Lalu periksa bahwa `contracts/Groth16Verifier.sol` di repositori **identik** dengan berkas di atas, dan bahwa bytecode yang di-deploy di chain sama.

## 4. Setelah ceremony
1. Salin `final.zkey` dan wasm hasil build `--O2` ke `build/` dan `frontend/public/zk/`; salin verifier ke `contracts/`.
2. Deploy verifier + pool baru (verifier immutable); register dihubungkan lewat Safe; perbarui env dan `deployments/`.
3. Jalankan seluruh tes dan E2E browser. Proof dari zkey dev lama harus ditolak (`test/ceremony_rehearsal.test.js`, D-TEST6).
4. Publikasikan transkrip, zkey final, atestasi, dan panduan verifikasi ini. Deploy mainnet: `CEREMONY_WITHDRAW_TRANSCRIPT=... CEREMONY_RAGEQUIT_TRANSCRIPT=... npx hardhat run scripts/deploy.js --network robinhood` (penjaga menolak jika ada syarat yang tidak terpenuhi).

## Batas yang jujur
- Gladi bersih memakai ptau dev (bukan aman); ia membuktikan **alurnya**, bukan keamanan setup sungguhan.
- Keamanan nyata bergantung pada kontributor sungguhan yang independen dan jujur (minimal satu) dan pada beacon yang tidak dapat diprediksi saat kontributor terakhir memilih entropinya.
- Bukti dengan proof nyata untuk sirkuit `withdraw` hasil O2 membutuhkan compiler `circom` native (circom2/WASM tidak dapat menulis witness generator). Pasang `circom` yang di-pin di CI sebelum ceremony nyata.
