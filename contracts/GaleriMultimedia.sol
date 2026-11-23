// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract GaleriMultimedia is ERC721URIStorage, AccessControl {
    // Definisi peran khusus Kurator
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    uint256 private _nextTokenId;

    // Struktur data karya yang disimpan on-chain
    struct DataKarya {
        string idKarya;
        address kreator;
        uint256 tokenId;
        bool sudahTerbit;
    }

    // Pemetaan ID Karya ke DataKarya (untuk anti-double minting)
    mapping(string => DataKarya) private _dataKaryaById;
    // Pemetaan tokenId ke ID Karya
    mapping(uint256 => string) private _idKaryaByToken;

    // Event saat karya resmi diterbitkan
    event KaryaDiterbitkan(
        string indexed idKaryaHash,
        string idKarya,
        address indexed kreator,
        address indexed kurator,
        uint256 tokenId,
        string tokenURI
    );

    constructor(address adminAwal, address kuratorAwal)
        ERC721("Galeri Karya Multimedia P1", "GKMP1")
    {
        require(adminAwal != address(0), "Alamat admin tidak valid");
        require(kuratorAwal != address(0), "Alamat kurator tidak valid");

        _grantRole(DEFAULT_ADMIN_ROLE, adminAwal);
        _grantRole(CURATOR_ROLE, kuratorAwal);
    }

    /**
     * @dev Menerbitkan karya multimedia menjadi token ERC-721.
     * Hanya bisa dipanggil oleh akun berperan CURATOR_ROLE.
     */
    function mintKarya(
        string memory idKarya,
        address kreator,
        string memory uriMetadata
    ) external onlyRole(CURATOR_ROLE) returns (uint256) {
        require(bytes(idKarya).length > 0, "ID karya tidak boleh kosong");
        require(kreator != address(0), "Alamat kreator tidak valid");
        require(bytes(uriMetadata).length > 0, "Token URI tidak boleh kosong");
        // Aturan anti-double minting
        require(!_dataKaryaById[idKarya].sudahTerbit, "ID karya sudah pernah diterbitkan");

        _nextTokenId++;
        uint256 tokenIdBaru = _nextTokenId;

        // Simpan data on-chain
        _dataKaryaById[idKarya] = DataKarya({
            idKarya: idKarya,
            kreator: kreator,
            tokenId: tokenIdBaru,
            sudahTerbit: true
        });
        _idKaryaByToken[tokenIdBaru] = idKarya;

        // Cetak token NFT langsung ke alamat kreator sebagai pemilik sah
        _safeMint(kreator, tokenIdBaru);
        _setTokenURI(tokenIdBaru, uriMetadata);

        emit KaryaDiterbitkan(
            idKarya,
            idKarya,
            kreator,
            msg.sender,
            tokenIdBaru,
            uriMetadata
        );

        return tokenIdBaru;
    }

    /**
     * @dev Menambah kurator baru (hanya bisa dilakukan oleh Admin).
     */
    function tambahKurator(address kuratorBaru) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(kuratorBaru != address(0), "Alamat kurator tidak valid");
        grantRole(CURATOR_ROLE, kuratorBaru);
    }

    /**
     * @dev Mencabut peran kurator (hanya bisa dilakukan oleh Admin).
     */
    function hapusKurator(address kuratorLama) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(CURATOR_ROLE, kuratorLama);
    }

    /**
     * @dev Mengambil informasi lengkap karya berdasarkan ID Karya.
     */
    function getKaryaById(string memory idKarya)
        external
        view
        returns (
            address kreator,
            uint256 tokenId,
            address pemilikSaatIni,
            string memory uriMetadata,
            bool sudahTerbit
        )
    {
        DataKarya memory data = _dataKaryaById[idKarya];
        require(data.sudahTerbit, "Karya belum diterbitkan");

        return (
            data.kreator,
            data.tokenId,
            ownerOf(data.tokenId),
            tokenURI(data.tokenId),
            data.sudahTerbit
        );
    }

    /**
     * @dev Mengambil ID Karya berdasarkan nomor tokenId.
     */
    function getIdKaryaByToken(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token tidak ditemukan");
        return _idKaryaByToken[tokenId];
    }

    /**
     * @dev Override wajib untuk menggabungkan ERC721URIStorage dan AccessControl.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}