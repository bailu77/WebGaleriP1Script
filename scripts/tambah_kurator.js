const hre = require("hardhat");

async function main() {
  const alamatKontrak = "0xF2517341bFA5C6C43f1095315d3D5b23431e4B26";
  const alamatKuratorBaru = "0x71d22ad002970d45d07ceef3bea0ddaa1c1789f4";

  const [admin] = await hre.ethers.getSigners();
  console.log("Admin pengirim   :", admin.address);
  console.log("Menambah kurator :", alamatKuratorBaru);

  const GaleriMultimedia = await hre.ethers.getContractFactory("GaleriMultimedia");
  const galeri = GaleriMultimedia.attach(alamatKontrak);

  const tx = await galeri.tambahKurator(alamatKuratorBaru);
  console.log("Menunggu konfirmasi Sepolia...");
  const receipt = await tx.wait(2);

  console.log("Berhasil! Tx Hash:", receipt.hash);

  // Verifikasi apakah peran kurator sudah aktif
  const curatorRole = await galeri.CURATOR_ROLE();
  const status = await galeri.hasRole(curatorRole, alamatKuratorBaru);
  console.log("Status CURATOR_ROLE aktif:", status);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});