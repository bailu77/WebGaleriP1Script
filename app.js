const CONFIG = {
  LIVE_MODE: true,
  API_BASE_URL: "http://127.0.0.1:8000",
  SEPOLIA_CHAIN_ID: "0xaa36a7", // Sepolia (11155111)
  CONTRACT_ADDRESS: "0xF2517341bFA5C6C43f1095315d3D5b23431e4B26",
  CONTRACT_ABI: [
    "function CURATOR_ROLE() view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function mintKarya(string idKarya, address kreator, string uriMetadata) returns (uint256)",
    "function tambahKurator(address kuratorBaru)",
    "function hapusKurator(address kuratorLama)",
    "function getKaryaById(string idKarya) view returns (address kreator, uint256 tokenId, address pemilikSaatIni, string uriMetadata, bool sudahTerbit)",
    "function getIdKaryaByToken(uint256 tokenId) view returns (string)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "event KaryaDiterbitkan(string indexed idKaryaHash, string idKarya, address indexed kreator, address indexed kurator, uint256 tokenId, string tokenURI)",
  ],
  IPFS_GATEWAY: "https://gateway.pinata.cloud/ipfs/",
  PINATA_JWT: "", // Isi JWT Pinata bila unggah langsung dari browser
};

let state = {
  walletAddress: null,
  selectedFile: null,
  analysisResult: null,
  cidAset: null,
  cidMetadata: null,
};

const el = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  const box = el("statusBox");
  if (!box) return;
  box.textContent = msg;
  box.style.color = isError ? "#b91c1c" : "#111827";
}

function getEthersInterface() {
  if (!window.ethers || !window.ethers.Interface) {
    throw new Error(
      'Library ethers.js belum dimuat. Tambahkan <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js"></script> di index.html.'
    );
  }
  if (!Array.isArray(CONFIG.CONTRACT_ABI) || CONFIG.CONTRACT_ABI.length === 0) {
    throw new Error("CONFIG.CONTRACT_ABI masih kosong.");
  }
  return new window.ethers.Interface(CONFIG.CONTRACT_ABI);
}

async function connectWallet() {
  try {
    if (!window.ethereum) {
      throw new Error("MetaMask tidak terdeteksi di browser.");
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      throw new Error("Tidak ada akun MetaMask yang aktif.");
    }

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== CONFIG.SEPOLIA_CHAIN_ID) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.SEPOLIA_CHAIN_ID }],
      });
    }

    state.walletAddress = accounts[0];
    if (el("walletInfo")) {
      el("walletInfo").textContent = `Wallet: ${state.walletAddress} (Sepolia)`;
    }
    setStatus("Dompet MetaMask terhubung ke jaringan Sepolia.");
    return state.walletAddress;
  } catch (err) {
    setStatus(`Koneksi/transaksi wallet dibatalkan atau gagal: ${err.message}`, true);
    return null;
  }
}

async function analyzeImage() {
  try {
    const fileInput = el("fileInput");
    const file = fileInput?.files?.[0];
    if (!file) {
      throw new Error("Pilih berkas gambar terlebih dahulu.");
    }
    state.selectedFile = file;

    const title = el("titleInput")?.value?.trim() || "Karya Galeri";
    const urutan = Number(el("orderInput")?.value || 1);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("urutan", String(urutan));

    setStatus("Mengirim gambar ke API klasifikasi & draf deskripsi...");
    const res = await fetch(`${CONFIG.API_BASE_URL}/analyze-asset`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || `API mengembalikan status ${res.status}`);
    }

    state.analysisResult = data;
    if (el("categorySelect")) el("categorySelect").value = data.predicted_category;
    if (el("descInput")) el("descInput").value = data.draft_description;
    if (el("confidenceInfo")) {
      el("confidenceInfo").textContent =
        `Prediksi CNN: ${data.predicted_category} (${data.confidence_percent}%) | Sumber deskripsi: ${data.description_source}`;
    }
    setStatus("Analisis selesai. Silakan periksa atau koreksi kategori & deskripsi sebelum unggah IPFS.");
  } catch (err) {
    setStatus(`Gagal menganalisis gambar (cek berkas atau layanan AI): ${err.message}`, true);
  }
}

async function uploadToPinataFile(file) {
  if (!CONFIG.PINATA_JWT) {
    throw new Error("PINATA_JWT belum diisi di CONFIG.");
  }
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${CONFIG.PINATA_JWT}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || !data.IpfsHash) {
    throw new Error(data.error?.details || data.error || "Gagal mengunggah file gambar ke Pinata IPFS.");
  }
  return data.IpfsHash;
}

async function uploadToPinataJSON(jsonObj, name = "metadata.json") {
  if (!CONFIG.PINATA_JWT) {
    throw new Error("PINATA_JWT belum diisi di CONFIG.");
  }
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataContent: jsonObj,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.IpfsHash) {
    throw new Error(data.error?.details || data.error || "Gagal mengunggah metadata JSON ke Pinata IPFS.");
  }
  return data.IpfsHash;
}

async function isCurator(address) {
  if (!window.ethereum || !address) return false;
  const iface = getEthersInterface();

  const curatorRoleHex = await window.ethereum.request({
    method: "eth_call",
    params: [
      {
        to: CONFIG.CONTRACT_ADDRESS,
        data: iface.encodeFunctionData("CURATOR_ROLE", []),
      },
      "latest",
    ],
  });
  const [curatorRole] = iface.decodeFunctionResult("CURATOR_ROLE", curatorRoleHex);

  const hasRoleHex = await window.ethereum.request({
    method: "eth_call",
    params: [
      {
        to: CONFIG.CONTRACT_ADDRESS,
        data: iface.encodeFunctionData("hasRole", [curatorRole, address]),
      },
      "latest",
    ],
  });
  const [allowed] = iface.decodeFunctionResult("hasRole", hasRoleHex);
  return Boolean(allowed);
}

async function mintKaryaSepolia(idKarya, kreatorAddress, uriMetadata) {
  const fromAddress = state.walletAddress || (await connectWallet());
  if (!fromAddress) {
    throw new Error("Wallet MetaMask belum terhubung.");
  }

  const targetKreator = kreatorAddress || fromAddress;
  if (!window.ethers.isAddress(targetKreator)) {
    throw new Error("Alamat kreator tidak valid.");
  }

  const iface = getEthersInterface();
  const dataHex = iface.encodeFunctionData("mintKarya", [
    idKarya,
    targetKreator,
    uriMetadata,
  ]);

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: fromAddress,
        to: CONFIG.CONTRACT_ADDRESS,
        data: dataHex,
      },
    ],
  });

  return txHash;
}

async function getKaryaByIdSepolia(idKarya) {
  if (!window.ethereum) {
    throw new Error("MetaMask/provider Ethereum tidak tersedia.");
  }
  const iface = getEthersInterface();
  const callData = iface.encodeFunctionData("getKaryaById", [idKarya]);

  const rawResult = await window.ethereum.request({
    method: "eth_call",
    params: [
      {
        to: CONFIG.CONTRACT_ADDRESS,
        data: callData,
      },
      "latest",
    ],
  });

  const decoded = iface.decodeFunctionResult("getKaryaById", rawResult);
  return {
    kreator: decoded.kreator,
    tokenId: decoded.tokenId.toString(),
    pemilikSaatIni: decoded.pemilikSaatIni,
    uriMetadata: decoded.uriMetadata,
    sudahTerbit: decoded.sudahTerbit,
  };
}

async function publishAsset() {
  try {
    if (!state.selectedFile) {
      throw new Error("Belum ada gambar yang dipilih.");
    }

    const finalTitle = el("titleInput")?.value?.trim() || "Karya Galeri";
    const finalOrder = Number(el("orderInput")?.value || 1);
    const finalCategory = el("categorySelect")?.value || "Foto";
    const finalDesc = el("descInput")?.value?.trim() || "";
    const idKarya = el("idKaryaInput")?.value?.trim() || `KARYA-${finalOrder}`;
    const kreatorAddress = el("creatorInput")?.value?.trim() || state.walletAddress;

    setStatus("Mengunggah gambar ke IPFS...");
    const cidAset = await uploadToPinataFile(state.selectedFile);
    state.cidAset = cidAset;
    const uriAset = `ipfs://${cidAset}`;

    const metadata = {
      name: finalTitle,
      category: finalCategory,
      description: finalDesc,
      image: uriAset,
      attributes: [
        { trait_type: "Kategori", value: finalCategory },
        { trait_type: "Nomor Urut", value: finalOrder },
      ],
    };

    setStatus("Mengunggah metadata JSON final ke IPFS...");
    const cidMetadata = await uploadToPinataJSON(metadata, `metadata_${finalOrder}.json`);
    state.cidMetadata = cidMetadata;
    const uriMetadata = `ipfs://${cidMetadata}`;

    if (el("ipfsInfo")) {
      el("ipfsInfo").innerHTML = `
        <div>ID Karya: <code>${idKarya}</code></div>
        <div>CID Aset: <code>${cidAset}</code> (<code>${uriAset}</code>)</div>
        <div>CID Metadata: <code>${cidMetadata}</code> (<code>${uriMetadata}</code>)</div>
        <div>Preview Gateway: <a href="${CONFIG.IPFS_GATEWAY}${cidMetadata}" target="_blank" rel="noreferrer">Buka Metadata IPFS</a></div>
      `;
    }

    if (CONFIG.LIVE_MODE && window.ethereum) {
      setStatus("Mengirim transaksi mintKarya ke kontrak GaleriMultimedia di Sepolia...");
      const txHash = await mintKaryaSepolia(idKarya, kreatorAddress, uriMetadata);
      if (el("ipfsInfo")) {
        el("ipfsInfo").innerHTML += `
          <div>Tx Hash Sepolia: <code>${txHash}</code> (<a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" rel="noreferrer">Lihat di Etherscan</a>)</div>
        `;
      }
      setStatus(`Transaksi mintKarya terkirim (${txHash}).`);
    } else {
      setStatus("CID gambar & metadata JSON berhasil dibuat.");
    }
  } catch (err) {
    setStatus(`Gagal unggah ke IPFS atau transaksi Sepolia: ${err.message}`, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  el("btnConnect")?.addEventListener("click", connectWallet);
  el("btnAnalyze")?.addEventListener("click", analyzeImage);
  el("btnPublish")?.addEventListener("click", publishAsset);
});