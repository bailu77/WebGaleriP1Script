import os
import time
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, classification_report, confusion_matrix
import matplotlib.pyplot as plt
import numpy as np

# =========================================================================
# 1. KONFIGURASI PELATIHAN
# =========================================================================
DATA_DIR = "dataset"
MODEL_SAVE_PATH = "model_cnn_galeri.pth"
CM_IMAGE_PATH = "confusion_matrix_cnn.png"
BATCH_SIZE = 16
EPOCHS = 15
LEARNING_RATE = 0.001
SEED = 42

torch.manual_seed(SEED)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Menggunakan perangkat komputasi: {device}")

# =========================================================================
# 2. PRAPROSES & AUGMENTASI (HANYA PADA TRAIN SESUAI ATURAN PANDUAN)
# =========================================================================
train_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomRotation(degrees=15),
    transforms.ColorJitter(brightness=0.2, contrast=0.2),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# Data test tidak boleh diaugmentasi agar evaluasi murni
test_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

train_dataset = datasets.ImageFolder(os.path.join(DATA_DIR, "train"), transform=train_transform)
test_dataset = datasets.ImageFolder(os.path.join(DATA_DIR, "test"), transform=test_transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=1, shuffle=False)

class_names = train_dataset.classes
print(f"Kelas terdeteksi: {class_names}")
print(f"Jumlah data latih: {len(train_dataset)} | Jumlah data uji: {len(test_dataset)}\n")

# =========================================================================
# 3. ARSITEKTUR TRANSFER LEARNING (MOBILENETV2)
# =========================================================================
model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)

# Bekukan bobot ekstraksi fitur awal agar pelatihan cepat & tidak overfitting
for param in model.features.parameters():
    param.requires_grad = False

# Sesuaikan layer klasifikasi akhir menjadi 3 kelas (Foto, Ilustrasi, Poster)
in_features = model.classifier[1].in_features
model.classifier[1] = nn.Linear(in_features, len(class_names))
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.classifier.parameters(), lr=LEARNING_RATE)

# =========================================================================
# 4. PROSES PELATIHAN (TRAINING)
# =========================================================================
print("Memulai pelatihan model CNN...")
start_train_time = time.time()

for epoch in range(1, EPOCHS + 1):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for inputs, labels in train_loader:
        inputs, labels = inputs.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * inputs.size(0)
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()

    epoch_loss = running_loss / total
    epoch_acc = (correct / total) * 100
    print(f"Epoch [{epoch:02d}/{EPOCHS:02d}] - Loss: {epoch_loss:.4f} - Akurasi Train: {epoch_acc:.2f}%")

train_duration = time.time() - start_train_time
print(f"\nPelatihan selesai dalam {train_duration:.2f} detik.\n")

# =========================================================================
# 5. EVALUASI PADA DATA UJI INDEPENDEN (TEST SET)
# =========================================================================
model.eval()
y_true = []
y_pred = []
misclassified_samples = []
inference_times = []

with torch.no_grad():
    for idx, (inputs, labels) in enumerate(test_loader):
        inputs = inputs.to(device)
        
        t0 = time.time()
        outputs = model(inputs)
        probs = torch.softmax(outputs, dim=1)
        conf, predicted = torch.max(probs, 1)
        t1 = time.time()

        inference_times.append((t1 - t0) * 1000) # dalam milidetik
        true_idx = labels.item()
        pred_idx = predicted.item()

        y_true.append(true_idx)
        y_pred.append(pred_idx)

        # Catat contoh gambar yang salah ditebak untuk bahan laporan
        if true_idx != pred_idx:
            img_path, _ = test_dataset.samples[idx]
            misclassified_samples.append({
                "file": os.path.basename(img_path),
                "asli": class_names[true_idx],
                "prediksi": class_names[pred_idx],
                "confidence": f"{conf.item()*100:.1f}%"
            })

# Hitung seluruh metrik wajib proposal
acc = accuracy_score(y_true, y_pred) * 100
macro_f1 = f1_score(y_true, y_pred, average="macro") * 100
precision = precision_score(y_true, y_pred, average="macro", zero_division=0) * 100
recall = recall_score(y_true, y_pred, average="macro", zero_division=0) * 100
avg_inf_time = np.mean(inference_times)

print("=" * 55)
print("HASIL EVALUASI MODEL CNN (DATA UJI INDEPENDEN)")
print("=" * 55)
print(f"Akurasi Test      : {acc:.2f}% (Target minimal: 85.00%)")
print(f"Macro-F1 Score    : {macro_f1:.2f}%")
print(f"Macro Precision   : {precision:.2f}%")
print(f"Macro Recall      : {recall:.2f}%")
print(f"Waktu Inferensi   : {avg_inf_time:.2f} ms / gambar")
print("-" * 55)
print("\nDetail Laporan Klasifikasi per Kelas:")
print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

# Catat contoh kegagalan prediksi
print("Contoh Kegagalan Prediksi (Misclassified):")
if len(misclassified_samples) == 0:
    print("- Tidak ada kesalahan prediksi pada set data uji.")
else:
    for item in misclassified_samples:
        print(f"- {item['file']} | Asli: {item['asli']} -> Terbaca: {item['prediksi']} ({item['confidence']})")

# =========================================================================
# 6. SIMPAN CHECKPOINT MODEL & GAMBAR CONFUSION MATRIX
# =========================================================================
torch.save({
    "model_state_dict": model.state_dict(),
    "class_names": class_names,
    "accuracy": acc,
    "macro_f1": macro_f1
}, MODEL_SAVE_PATH)
print(f"\n[Tersimpan] Bobot model CNN disimpan ke: {MODEL_SAVE_PATH}")

# Simpan grafik Confusion Matrix untuk laporan
cm = confusion_matrix(y_true, y_pred)
fig, ax = plt.subplots(figsize=(6, 5))
im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
ax.figure.colorbar(im, ax=ax)
ax.set(
    xticks=np.arange(len(class_names)),
    yticks=np.arange(len(class_names)),
    xticklabels=class_names,
    yticklabels=class_names,
    title=f"Confusion Matrix CNN (Akurasi: {acc:.1f}%)",
    ylabel="Label Asli",
    xlabel="Prediksi Model"
)

for i in range(len(class_names)):
    for j in range(len(class_names)):
        ax.text(j, i, format(cm[i, j], "d"), ha="center", va="center",
                color="white" if cm[i, j] > cm.max() / 2 else "black")

plt.tight_layout()
plt.savefig(CM_IMAGE_PATH, dpi=150)
print(f"[Tersimpan] Gambar Confusion Matrix disimpan ke: {CM_IMAGE_PATH}")