const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GaleriMultimedia Smart Contract", function () {
  let galeri;
  let admin, kurator, kreator1, kreator2, penggunaUmum;

  beforeEach(async function () {
    [admin, kurator, kreator1, kreator2, penggunaUmum] = await ethers.getSigners();
    const GaleriMultimedia = await ethers.getContractFactory("GaleriMultimedia");
    galeri = await GaleriMultimedia.deploy(admin.address, kurator.address);
    await galeri.waitForDeployment();
  });

  // --- SKENARIO POSITIF ---

  it("1. Berhasil deploy dengan nama, simbol, dan peran Admin & Kurator yang benar", async function () {
    expect(await galeri.name()).to.equal("Galeri Karya Multimedia P1");
    expect(await galeri.symbol()).to.equal("GKMP1");

    const adminRole = await galeri.DEFAULT_ADMIN_ROLE();
    const curatorRole = await galeri.CURATOR_ROLE();

    expect(await galeri.hasRole(adminRole, admin.address)).to.be.true;
    expect(await galeri.hasRole(curatorRole, kurator.address)).to.be.true;
  });

  it("2. Kurator berhasil menerbitkan (mint) karya baru dan memancarkan event KaryaDiterbitkan", async function () {
    const idKarya = "KARYA-001";
    const uri = "ipfs://QmContohHashMetadataKarya001";

    await expect(galeri.connect(kurator).mintKarya(idKarya, kreator1.address, uri))
      .to.emit(galeri, "KaryaDiterbitkan")
      .withArgs(idKarya, idKarya, kreator1.address, kurator.address, 1, uri);

    expect(await galeri.ownerOf(1)).to.equal(kreator1.address);
    expect(await galeri.tokenURI(1)).to.equal(uri);
  });

  it("3. Berhasil membaca detail karya lengkap melalui getKaryaById dan getIdKaryaByToken", async function () {
    const idKarya = "KARYA-002";
    const uri = "ipfs://QmContohHashMetadataKarya002";

    await galeri.connect(kurator).mintKarya(idKarya, kreator1.address, uri);

    const detail = await galeri.getKaryaById(idKarya);
    expect(detail.kreator).to.equal(kreator1.address);
    expect(detail.tokenId).to.equal(1);
    expect(detail.pemilikSaatIni).to.equal(kreator1.address);
    expect(detail.uriMetadata).to.equal(uri);
    expect(detail.sudahTerbit).to.be.true;

    expect(await galeri.getIdKaryaByToken(1)).to.equal(idKarya);
  });

  it("4. Admin berhasil menambah kurator baru dan kurator baru dapat melakukan minting", async function () {
    await galeri.connect(admin).tambahKurator(penggunaUmum.address);
    const curatorRole = await galeri.CURATOR_ROLE();
    expect(await galeri.hasRole(curatorRole, penggunaUmum.address)).to.be.true;

    await galeri.connect(penggunaUmum).mintKarya("KARYA-003", kreator2.address, "ipfs://QmHash003");
    expect(await galeri.ownerOf(1)).to.equal(kreator2.address);
  });

  it("5. Admin berhasil mencabut hak kurator melalui hapusKurator", async function () {
    await galeri.connect(admin).hapusKurator(kurator.address);
    const curatorRole = await galeri.CURATOR_ROLE();
    expect(await galeri.hasRole(curatorRole, kurator.address)).to.be.false;
  });

  it("6. Pemilik sah dapat mentransfer token karya ke pemilik baru (safeTransferFrom)", async function () {
    await galeri.connect(kurator).mintKarya("KARYA-004", kreator1.address, "ipfs://QmHash004");
    await galeri.connect(kreator1).safeTransferFrom(kreator1.address, kreator2.address, 1);

    expect(await galeri.ownerOf(1)).to.equal(kreator2.address);
    const detail = await galeri.getKaryaById("KARYA-004");
    expect(detail.kreator).to.equal(kreator1.address);
    expect(detail.pemilikSaatIni).to.equal(kreator2.address);
  });

  it("7. Mendukung pengecekan antarmuka ERC-721 dan AccessControl (supportsInterface)", async function () {
    expect(await galeri.supportsInterface("0x80ac58cd")).to.be.true; // ERC721
    expect(await galeri.supportsInterface("0x7965db0b")).to.be.true; // AccessControl
  });

  // --- SKENARIO NEGATIF (KEAMANAN & VALIDASI) ---

  it("8. Gagal deploy jika alamat admin awal atau kurator awal adalah address(0)", async function () {
    const GaleriMultimedia = await ethers.getContractFactory("GaleriMultimedia");
    await expect(
      GaleriMultimedia.deploy(ethers.ZeroAddress, kurator.address)
    ).to.be.revertedWith("Alamat admin tidak valid");

    await expect(
      GaleriMultimedia.deploy(admin.address, ethers.ZeroAddress)
    ).to.be.revertedWith("Alamat kurator tidak valid");
  });

  it("9. Menolak minting jika dipanggil oleh akun yang bukan Kurator", async function () {
    await expect(
      galeri.connect(penggunaUmum).mintKarya("KARYA-005", kreator1.address, "ipfs://QmHash005")
    ).to.be.revertedWithCustomError(galeri, "AccessControlUnauthorizedAccount");
  });

  it("10. Menolak double minting jika ID karya sudah pernah diterbitkan", async function () {
    await galeri.connect(kurator).mintKarya("KARYA-DUPLIKAT", kreator1.address, "ipfs://QmHash1");

    await expect(
      galeri.connect(kurator).mintKarya("KARYA-DUPLIKAT", kreator2.address, "ipfs://QmHash2")
    ).to.be.revertedWith("ID karya sudah pernah diterbitkan");
  });

  it("11. Menolak minting jika ID karya kosong, alamat kreator nol, atau Token URI kosong", async function () {
    await expect(
      galeri.connect(kurator).mintKarya("", kreator1.address, "ipfs://QmHash")
    ).to.be.revertedWith("ID karya tidak boleh kosong");

    await expect(
      galeri.connect(kurator).mintKarya("KARYA-006", ethers.ZeroAddress, "ipfs://QmHash")
    ).to.be.revertedWith("Alamat kreator tidak valid");

    await expect(
      galeri.connect(kurator).mintKarya("KARYA-006", kreator1.address, "")
    ).to.be.revertedWith("Token URI tidak boleh kosong");
  });

  it("12. Menolak penambahan kurator jika dipanggil bukan oleh Admin atau alamat nol", async function () {
    await expect(
      galeri.connect(penggunaUmum).tambahKurator(kreator1.address)
    ).to.be.revertedWithCustomError(galeri, "AccessControlUnauthorizedAccount");

    await expect(
      galeri.connect(admin).tambahKurator(ethers.ZeroAddress)
    ).to.be.revertedWith("Alamat kurator tidak valid");
  });

  it("13. Menolak transfer token ilegal oleh akun yang bukan pemilik atau tidak disetujui", async function () {
    await galeri.connect(kurator).mintKarya("KARYA-007", kreator1.address, "ipfs://QmHash007");

    await expect(
      galeri.connect(penggunaUmum).safeTransferFrom(kreator1.address, penggunaUmum.address, 1)
    ).to.be.revertedWithCustomError(galeri, "ERC721InsufficientApproval");
  });

  it("14. Menolak pencarian data untuk ID karya yang belum terbit atau tokenId yang tidak ada", async function () {
    await expect(galeri.getKaryaById("ID-TIDAK-ADA")).to.be.revertedWith("Karya belum diterbitkan");
    await expect(galeri.getIdKaryaByToken(999)).to.be.revertedWith("Token tidak ditemukan");
  });
});