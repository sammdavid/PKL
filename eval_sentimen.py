"""
eval_sentimen.py
================
Script evaluasi akurasi model sentimen secara interaktif.

Cara pakai:
    python eval_sentimen.py

Kamu akan diberi 50 sampel acak dari sentimen_saran.json.
Untuk setiap teks, masukkan label kamu:
    P = Positif
    S = Saran Perbaikan
    N = Netral
    q = Berhenti lebih awal (tetap hitung akurasi dari yang sudah dilabel)

Hasil akan disimpan ke: eval_hasil.json
"""

import json
import random
import sys
import io
import os
from datetime import datetime

# Fix encoding untuk Windows terminal
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stdin  = io.TextIOWrapper(sys.stdin.buffer,  encoding="utf-8", errors="replace")

DATA_PATH   = os.path.join(os.path.dirname(__file__), "data", "survey_data", "sentimen_saran.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "eval_hasil.json")
SAMPLE_SIZE = 50

LABEL_MAP = {
    "p": "Positif",
    "s": "Saran Perbaikan",
    "n": "Netral",
}

CLASSES = ["Positif", "Saran Perbaikan", "Netral"]

# -------------------------------------------------
# Helpers
# -------------------------------------------------

def load_data():
    with open(DATA_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    return raw["all_comments"]

def print_header():
    print("\n" + "="*60)
    print("   EVALUASI AKURASI MODEL SENTIMEN - Saran & Masukan PSB")
    print("="*60)
    print("  Label yang tersedia:")
    print("    P  ->  Positif")
    print("    S  ->  Saran Perbaikan")
    print("    N  ->  Netral")
    print("    q  ->  Berhenti & hitung hasil sekarang")
    print("-"*60 + "\n")

def print_entry(idx, total, entry):
    print(f"\n[{idx}/{total}]  ID: {entry['id']}  |  Jenjang: {entry.get('jenjang','?')}  |  Sekolah: {entry.get('sekolah','?')}")
    print("-"*60)
    text = entry["text"]
    for line in text.splitlines():
        print(f"  {line}")
    print("-"*60)
    print(f"  Model bilang : [{entry['sentiment']}]")

def compute_metrics(results):
    total   = len(results)
    correct = sum(1 for r in results if r["model"] == r["human"])
    accuracy = correct / total if total else 0

    metrics = {}
    for cls in CLASSES:
        tp = sum(1 for r in results if r["model"] == cls and r["human"] == cls)
        fp = sum(1 for r in results if r["model"] == cls and r["human"] != cls)
        fn = sum(1 for r in results if r["model"] != cls and r["human"] == cls)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0
        metrics[cls] = {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}

    return accuracy, metrics

def print_results(results):
    total   = len(results)
    correct = sum(1 for r in results if r["model"] == r["human"])
    accuracy, metrics = compute_metrics(results)

    print("\n" + "="*60)
    print("   HASIL EVALUASI")
    print("="*60)
    print(f"  Total data dievaluasi : {total}")
    print(f"  Prediksi benar        : {correct}")
    print(f"  Prediksi salah        : {total - correct}")
    print(f"\n  Accuracy  : {accuracy*100:.1f}%")
    print()
    print(f"  {'Kelas':<22} {'Precision':>10} {'Recall':>10} {'F1':>8}")
    print("  " + "-"*52)
    for cls in CLASSES:
        m = metrics[cls]
        print(f"  {cls:<22} {m['precision']*100:>9.1f}% {m['recall']*100:>9.1f}% {m['f1']*100:>7.1f}%")

    errors = [r for r in results if r["model"] != r["human"]]
    if errors:
        print(f"\n  Contoh salah klasifikasi ({len(errors)} kasus):")
        for r in errors[:5]:
            snippet = r["text"][:70].replace("\n", " ")
            print(f"    [{r['model']} -> {r['human']}] \"{snippet}\"")

    print("\n  Interpretasi:")
    if accuracy >= 0.85:
        print("     Sangat baik! Model akurat untuk dipakai di dashboard.")
    elif accuracy >= 0.75:
        print("     Cukup baik. Masih ada ruang perbaikan (edge cases).")
    elif accuracy >= 0.60:
        print("     Lumayan. Pertimbangkan fine-tune kamus lexicon.")
    else:
        print("     Kurang akurat. Perlu perbaikan signifikan pada model.")
    print("="*60 + "\n")

def save_results(results, accuracy, metrics):
    output = {
        "timestamp": datetime.now().isoformat(),
        "total_evaluated": len(results),
        "accuracy": round(accuracy * 100, 2),
        "per_class_metrics": {
            cls: {k: round(v * 100, 2) if isinstance(v, float) else v
                  for k, v in m.items()}
            for cls, m in metrics.items()
        },
        "details": results,
        "errors": [r for r in results if r["model"] != r["human"]],
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  Hasil disimpan ke: {OUTPUT_PATH}\n")

# -------------------------------------------------
# Main
# -------------------------------------------------

def main():
    all_data = load_data()

    skip = {"-", "--", "---", "tidak ada", ".", "..", "belum ada masukan", "n/a"}
    meaningful = [
        e for e in all_data
        if e.get("text", "").strip().lower() not in skip
        and len(e.get("text", "").strip()) > 5
    ]

    sample = random.sample(meaningful, min(SAMPLE_SIZE, len(meaningful)))
    print_header()
    print(f"  Mengambil {len(sample)} sampel acak dari {len(meaningful)} data bermakna.\n")

    results = []
    stopped_early = False
    for i, entry in enumerate(sample, 1):
        print_entry(i, len(sample), entry)

        while True:
            try:
                raw = input("  Label kamu [P/S/N/q]: ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                raw = "q"

            if raw == "q":
                print("\n  Dihentikan lebih awal.\n")
                stopped_early = True
                break
            if raw in LABEL_MAP:
                human_label = LABEL_MAP[raw]
                results.append({
                    "id":    entry["id"],
                    "text":  entry["text"],
                    "model": entry["sentiment"],
                    "human": human_label,
                    "match": entry["sentiment"] == human_label,
                })
                break
            print("  Input tidak valid. Ketik P, S, N, atau q.")

        if stopped_early:
            break

    if not results:
        print("  Tidak ada data yang dievaluasi. Keluar.")
        return

    accuracy, metrics = compute_metrics(results)
    print_results(results)
    save_results(results, accuracy, metrics)

if __name__ == "__main__":
    main()
