import os, shutil, random, csv

RAW_DIR = "raw_dataset"
OUTPUT_DIR = "dataset"
CATEGORIES = ["Poster", "Ilustrasi", "Foto"]
random.seed(42)

for split in ["train", "test"]:
    for cat in CATEGORIES:
        os.makedirs(os.path.join(OUTPUT_DIR, split, cat), exist_ok=True)

manifest_rows = []
for cat in CATEGORIES:
    cat_path = os.path.join(RAW_DIR, cat)
    files = sorted([f for f in os.listdir(cat_path) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))])
    random.shuffle(files)
    split_idx = int(len(files) * 0.8)

    for split_name, subset in [("train", files[:split_idx]), ("test", files[split_idx:])]:
        for idx, fname in enumerate(subset, start=1):
            ext = os.path.splitext(fname)[1].lower()
            new_name = f"{cat.lower()}_{split_name}_{idx:02d}{ext}"
            shutil.copy2(os.path.join(cat_path, fname), os.path.join(OUTPUT_DIR, split_name, cat, new_name))
            manifest_rows.append([new_name, fname, cat, split_name, f"grup_{cat.lower()}_{idx:02d}", "Karya Sendiri / Sumber Berizin"])

with open("manifest.csv", "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(["nama_file_baru", "nama_file_asli", "kelas", "split", "id_grup", "sumber_dan_izin"])
    writer.writerows(manifest_rows)

print(f"Berhasil bagi {len(manifest_rows)} gambar ke folder dataset & bikin manifest.csv!")