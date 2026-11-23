import os
import time
import numpy as np
from PIL import Image
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, classification_report, confusion_matrix
import matplotlib.pyplot as plt

# =========================================================================
# 1. KONFIGURASI & EKSTRAKSI FITUR WARNA + TEKSTUR
# =========================================================================
DATA_DIR = "dataset"
CM_SVM_PATH = "confusion_matrix_svm.png"
CATEGORIES = ["Foto", "Ilustrasi", "Poster"]  # Urutan sama dengan ImageFolder

def extract_color_texture_features(image_path):
    img = Image.open(image_path).convert("RGB").resize((128, 128))
    arr = np.asarray(img, dtype=np.float32) / 255.0

    # Fitur Warna: Histogram RGB (16 bin per channel = 48 fitur)
    hist_r, _ = np.histogram(arr[:, :, 0], bins=16, range=(0.0, 1.0))
    hist_g, _ = np.histogram(arr[:, :, 1], bins=16, range=(0.0, 1.0))
    hist_b, _ = np.histogram(arr[:, :, 2], bins=16, range=(0.0, 1.0))
    color_feat = np.concatenate([hist_r, hist_g, hist_b]).astype(np.float32)
    color_feat /= (color_feat.sum() + 1e-7)

    # Fitur Tekstur: Gradien tepi & statistik kontras grayscale (22 fitur)
    gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    dx = np.abs(np.diff(gray, axis=1))
    dy = np.abs(np.diff(gray, axis=0))
    grad_mag = np.sqrt(dx[:-1, :] ** 2 + dy[:, :-1] ** 2)

    edge_hist, _ = np.histogram(grad_mag, bins=16, range=(0.0, 1.0))
    edge_hist = edge_hist.astype(np.float32) / (edge_hist.sum() + 1e-7)

    stats_feat = np.array([
        np.mean(gray), np.std(gray),
        np.mean(dx), np.std(dx),
        np.mean(dy), np.std(dy)
    ], dtype=np.float32)

    return np.concatenate([color_feat, edge_hist, stats_feat])

def load_split(split_name):
    X, y = [], []
    for label_idx, cat in enumerate(CATEGORIES):
        folder = os.path.join(DATA_DIR, split_name, cat)
        for fname in sorted(os.listdir(folder)):
            if fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                fpath = os.path.join(folder, fname)
                X.append(extract_color_texture_features(fpath))
                y.append(label_idx)
    return np.array(X), np.array(y)

# =========================================================================
# 2. MUAT DATA SPLIT 80:20 & PELATIHAN MODEL SVM
# =========================================================================
print("Mengekstrak fitur warna & tekstur dari dataset...")
X_train, y_train = load_split("train")
X_test, y_test = load_split("test")

# Normalisasi dipelajari hanya dari data train agar bebas kebocoran data
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

start_train = time.time()
svm_model = SVC(kernel="rbf", C=10.0, gamma="scale", random_state=42)
svm_model.fit(X_train_scaled, y_train)
train_time = time.time() - start_train

# =========================================================================
# 3. EVALUASI MODEL SVM PADA DATA UJI
# =========================================================================
y_pred = []
inf_times = []

for i in range(len(X_test_scaled)):
    t0 = time.time()
    pred = svm_model.predict(X_test_scaled[i : i + 1])[0]
    t1 = time.time()
    y_pred.append(pred)
    inf_times.append((t1 - t0) * 1000)

acc = accuracy_score(y_test, y_pred) * 100
macro_f1 = f1_score(y_test, y_pred, average="macro") * 100
precision = precision_score(y_test, y_pred, average="macro", zero_division=0) * 100
recall = recall_score(y_test, y_pred, average="macro", zero_division=0) * 100
avg_inf_ms = np.mean(inf_times)

print("=" * 55)
print("HASIL EVALUASI MODEL PEMBANDING SVM (DATA UJI)")
print("=" * 55)
print(f"Akurasi Test      : {acc:.2f}%")
print(f"Macro-F1 Score    : {macro_f1:.2f}%")
print(f"Macro Precision   : {precision:.2f}%")
print(f"Macro Recall      : {recall:.2f}%")
print(f"Waktu Latih       : {train_time:.4f} detik")
print(f"Waktu Inferensi   : {avg_inf_ms:.2f} ms / gambar")
print("-" * 55)
print("\nDetail Laporan Klasifikasi SVM per Kelas:")
print(classification_report(y_test, y_pred, target_names=CATEGORIES, zero_division=0))

# =========================================================================
# 4. SIMPAN GRAFIK CONFUSION MATRIX SVM
# =========================================================================
cm = confusion_matrix(y_test, y_pred)
fig, ax = plt.subplots(figsize=(6, 5))
im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Greens)
ax.figure.colorbar(im, ax=ax)
ax.set(
    xticks=np.arange(len(CATEGORIES)),
    yticks=np.arange(len(CATEGORIES)),
    xticklabels=CATEGORIES,
    yticklabels=CATEGORIES,
    title=f"Confusion Matrix SVM (Akurasi: {acc:.1f}%)",
    ylabel="Label Asli",
    xlabel="Prediksi Model"
)

for i in range(len(CATEGORIES)):
    for j in range(len(CATEGORIES)):
        ax.text(j, i, format(cm[i, j], "d"), ha="center", va="center",
                color="white" if cm[i, j] > cm.max() / 2 else "black")

plt.tight_layout()
plt.savefig(CM_SVM_PATH, dpi=150)
print(f"[Tersimpan] Gambar Confusion Matrix SVM disimpan ke: {CM_SVM_PATH}")