const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const alamatKontrak = "0xF2517341bFA5C6C43f1095315d3D5b23431e4B26";

  console.log("=== SIMULASI MINTING DI SEPOLIA ===");
  console.log("Alamat Kontrak   :", alamatKontrak);
  console.log("Akun Kurator     :", deployer.address);

  const GaleriMultimedia = await hre.ethers.getContractFactory("GaleriMultimedia");
  const galeri = GaleriMultimedia.attach(alamatKontrak);

  // Tunggu 5 detik untuk memastikan nonce RPC sinkron
  await new Promise((r) => setTimeout(r, 5000));

  const txMint = await galeri.mintKarya(
    "KARYA-SEPOLIA-01",
    deployer.address,
    "ipfs://QmContohCIDMetadataKaryaSepolia01"
  );
  console.log("Menunggu konfirmasi transaksi minting...");
  const receiptMint = await txMint.wait(2);

  console.log("Tx Hash Minting  :", receiptMint.hash);
  console.log("Gas Used Minting :", receiptMint.gasUsed.toString());

  // Simpan laporan_sepolia.json lengkap
  const outputDir = path.join(__dirname, "..", "output_deployment");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const ringkasan = {
    jaringan: "sepolia",
    alamatKontrak: alamatKontrak,
    adminDanKurator: deployer.address,
    deploy: {
      txHash: "0x88412269ffb397b0b1e5fb51a79ca13c6f91a328f79f06b2f6779cb8a9a202fa",
      gasUsed: "22224157",
    },
    minting: {
      txHash: receiptMint.hash,
      gasUsed: receiptMint.gasUsed.toString(),
    },
  };

  fs.writeFileSync(
    path.join(outputDir, "laporan_sepolia.json"),
    JSON.stringify(ringkasan, null, 2)
  );

  console.log("\nBerhasil! File output_deployment/laporan_sepolia.json sudah dibuat.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});