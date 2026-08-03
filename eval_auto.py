"""
eval_auto.py
============
Evaluasi akurasi otomatis menggunakan label manual yang sudah disimpan di eval_hasil.json.
Tidak perlu input manual lagi!
"""

import json
import os
import sys
import io
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EVAL_PATH = os.path.join(os.path.dirname(__file__), "eval_hasil.json")
DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "survey_data", "sentimen_saran.json")

CLASSES = ["Positif", "Saran Perbaikan", "Netral"]

if not os.path.exists(EVAL_PATH):
    print("  [!] File eval_hasil.json tidak ditemukan. Silakan jalankan eval_sentimen.py terlebih dahulu.")
    sys.exit(1)

# 1. Load human labels sebelumnya
with open(EVAL_PATH, "r", encoding="utf-8") as f:
    prev_eval = json.load(f)

human_db = {item["id"]: item["human"] for item in prev_eval["details"]}
print(f"  Membaca {len(human_db)} label manual dari eval_hasil.json ...")

# 2. Load data sentimen terbaru dari model
if not os.path.exists(DATA_PATH):
    print("  [!] File sentimen_saran.json tidak ditemukan. Jalankan nlp_groq.py dulu.")
    sys.exit(1)

with open(DATA_PATH, "r", encoding="utf-8") as f:
    model_data = json.load(f)

model_db = {item["id"]: item for item in model_data["all_comments"]}

# 3. Lakukan pencocokan otomatis
results = []
for cid, human_label in human_db.items():
    if cid in model_db:
        entry = model_db[cid]
        results.append({
            "id":    cid,
            "text":  entry["text"],
            "model": entry["sentiment"],
            "human": human_label,
            "match": entry["sentiment"] == human_label,
        })

if not results:
    print("  [!] Tidak ada ID yang cocok antara eval_hasil.json dan sentimen_saran.json.")
    sys.exit(1)

# 4. Hitung Metrik
total = len(results)
correct = sum(1 for r in results if r["model"] == r["human"])
accuracy = correct / total

metrics = {}
for cls in CLASSES:
    tp = sum(1 for r in results if r["model"] == cls and r["human"] == cls)
    fp = sum(1 for r in results if r["model"] == cls and r["human"] != cls)
    fn = sum(1 for r in results if r["model"] != cls and r["human"] == cls)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0
    metrics[cls] = {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}

# 5. Tampilkan Hasil
print("\n" + "="*60)
print("   HASIL EVALUASI OTOMATIS (Groq Llama-3.1-8b)")
print("="*60)
print(f"  Total data dievaluasi : {total}")
print(f"  Prediksi benar        : {correct}")
print(f"  Prediksi salah        : {total - correct}")
print(f"\n  🎯 Accuracy  : {accuracy*100:.1f}%")
print()
print(f"  {'Kelas':<22} {'Precision':>10} {'Recall':>10} {'F1':>8}")
print("  " + "-"*52)
for cls in CLASSES:
    m = metrics[cls]
    print(f"  {cls:<22} {m['precision']*100:>9.1f}% {m['recall']*100:>9.1f}% {m['f1']*100:>7.1f}%")

errors = [r for r in results if r["model"] != r["human"]]
if errors:
    print(f"\n  ❌ Contoh salah klasifikasi ({len(errors)} kasus):")
    for r in errors[:5]:
        snippet = r["text"][:70].replace("\n", " ")
        print(f"    • [{r['model']} -> {r['human']}] \"{snippet}...\"")

print("\n  📊 Interpretasi:")
if accuracy >= 0.85:
    print("     ✅ Sangat baik! Model akurat untuk dipakai di dashboard.")
elif accuracy >= 0.75:
    print("     🟡 Cukup baik. Masih ada ruang perbaikan (edge cases).")
else:
    print("     🔴 Kurang akurat. Perlu perbaikan pada model/prompt.")
print("="*60 + "\n")

# 6. Simpan kembali hasil terbaru
output = {
    "timestamp": datetime.now().isoformat(),
    "total_evaluated": total,
    "accuracy": round(accuracy * 100, 2),
    "per_class_metrics": {
        cls: {k: round(v * 100, 2) if isinstance(v, float) else v for k, v in m.items()}
        for cls, m in metrics.items()
    },
    "details": results,
    "errors": errors,
}

with open(EVAL_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"  💾 Hasil terupdate disimpan ke: {EVAL_PATH}\n")

