const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, kurator, kreator, kolektor] = await hre.ethers.getSigners();

  console.log("=== MULAI DEPLOYMENT GALERI MULTIMEDIA ===");
  console.log("Jaringan aktif   :", hre.network.name);
  console.log("Akun Deployer    :", deployer.address);

  // 1. Deploy Smart Contract
  const GaleriMultimedia = await hre.ethers.getContractFactory("GaleriMultimedia");
  const galeri = await GaleriMultimedia.deploy(deployer.address, deployer.address);
  await galeri.waitForDeployment();

  const alamatKontrak = await galeri.getAddress();
  const deployTx = galeri.deploymentTransaction();
  const deployReceipt = await deployTx.wait();

  console.log("Alamat Kontrak   :", alamatKontrak);
  console.log("Tx Hash Deploy   :", deployReceipt.hash);
  console.log("Gas Used Deploy  :", deployReceipt.gasUsed.toString());

  // 2. Simulasi Transaksi Minting (untuk mengukur gasUsed minting)
  const txMint = await galeri.mintKarya(
    "KARYA-SIMULASI-01",
    kreator ? kreator.address : deployer.address,
    "ipfs://QmContohCIDMetadataKarya01"
  );
  const receiptMint = await txMint.wait();
  console.log("\n--- Simulasi Minting ---");
  console.log("Tx Hash Minting  :", receiptMint.hash);
  console.log("Gas Used Minting :", receiptMint.gasUsed.toString());

  // 3. Simulasi Transaksi Transfer (jika di jaringan lokal yang punya multi-akun)
  let gasTransfer = "Tidak dijalankan (single signer)";
  let hashTransfer = "-";
  if (kreator && kolektor) {
    const txTransfer = await galeri
      .connect(kreator)
      .safeTransferFrom(kreator.address, kolektor.address, 1);
    const receiptTransfer = await txTransfer.wait();
    gasTransfer = receiptTransfer.gasUsed.toString();
    hashTransfer = receiptTransfer.hash;
    console.log("\n--- Simulasi Transfer ---");
    console.log("Tx Hash Transfer :", hashTransfer);
    console.log("Gas Used Transfer:", gasTransfer);
  }

  // 4. Ekspor ABI dan Laporan Deployment ke folder output_deployment
  const artifact = await hre.artifacts.readArtifact("GaleriMultimedia");
  const outputDir = path.join(__dirname, "..", "output_deployment");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  fs.writeFileSync(
    path.join(outputDir, "GaleriMultimedia_ABI.json"),
    JSON.stringify(artifact.abi, null, 2)
  );

  const ringkasan = {
    jaringan: hre.network.name,
    alamatKontrak: alamatKontrak,
    adminDanKurator: deployer.address,
    deploy: {
      txHash: deployReceipt.hash,
      gasUsed: deployReceipt.gasUsed.toString(),
    },
    minting: {
      txHash: receiptMint.hash,
      gasUsed: receiptMint.gasUsed.toString(),
    },
    transfer: {
      txHash: hashTransfer,
      gasUsed: gasTransfer,
    },
  };

  fs.writeFileSync(
    path.join(outputDir, `laporan_${hre.network.name}.json`),
    JSON.stringify(ringkasan, null, 2)
  );

  console.log("\nFile ABI dan laporan JSON tersimpan di folder: output_deployment/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});