import json, math
from collections import defaultdict

with open('data/transition_data.json', encoding='utf-8') as f:
    data = json.load(f)

records = data['records']

# Aggregate per classroom per period
agg = defaultdict(lambda: {'lanjut': 0, 'keluar': 0})
for r in records:
    key = r['organization_code'] + '_' + r['classroom_code'] + '_' + r['period_code']
    agg[key][r['type']] += r['jumlah_siswa']

classrooms = []
for d in agg.values():
    total = d['lanjut'] + d['keluar']
    if total > 0:
        rr = d['lanjut'] / total * 100
        classrooms.append({'rr': rr, 'total': total})

rates = [c['rr'] for c in classrooms]
weights = [c['total'] for c in classrooms]
n = len(classrooms)

# --- Method 1: Unweighted mean (current) ---
mean_uw = sum(rates) / n
var_uw = sum((x - mean_uw)**2 for x in rates) / n
sd_uw = math.sqrt(var_uw)

# --- Method 2: Weighted mean by student count ---
total_students = sum(weights)
mean_w = sum(r * w for r, w in zip(rates, weights)) / total_students
var_w = sum(w * (r - mean_w)**2 for r, w in zip(rates, weights)) / total_students
sd_w = math.sqrt(var_w)

# --- Per-year breakdown ---
agg_year = defaultdict(lambda: {'lanjut': 0, 'keluar': 0, 'n_kelas': 0})
for r in records:
    agg_year[r['period_code']]['n_kelas'] = 0  # placeholder

agg_yr_detail = defaultdict(lambda: {'lanjut': 0, 'keluar': 0})
for r in records:
    agg_yr_detail[r['period_code']]['lanjut' if r['type'] == 'lanjut' else 'keluar'] += r['jumlah_siswa']

# count classrooms per year
kelas_per_year = defaultdict(set)
for r in records:
    key = r['organization_code'] + '_' + r['classroom_code']
    kelas_per_year[r['period_code']].add(key)

print('=== Per-Year Breakdown ===')
print('{:<12} {:>10} {:>10} {:>8} {:>12}'.format('Period', 'Lanjut', 'Keluar', 'N Kelas', 'RR (%)'))
print('-' * 58)
for period in sorted(agg_yr_detail.keys()):
    d = agg_yr_detail[period]
    total = d['lanjut'] + d['keluar']
    rr = d['lanjut'] / total * 100 if total > 0 else 0
    nk = len(kelas_per_year[period])
    print('{:<12} {:>10} {:>10} {:>8} {:>11.1f}%'.format(period, d['lanjut'], d['keluar'], nk, rr))

print('')
print('=== Mean Comparison ===')
print('Method 1 - Unweighted (tiap kelas bobot sama):')
print('  Mean = ' + str(round(mean_uw, 2)) + '%,  SD = ' + str(round(sd_uw, 2)) + '%')
print('  Tinggi >= ' + str(round(mean_uw + 0.5*sd_uw, 1)) + '% | Sedang ' + str(round(mean_uw - 0.5*sd_uw, 1)) + '-' + str(round(mean_uw + 0.5*sd_uw, 1)) + '% | Rendah < ' + str(round(mean_uw - 0.5*sd_uw, 1)) + '%')

print('')
print('Method 2 - Weighted by student count (kelas besar lebih berpengaruh):')
print('  Mean = ' + str(round(mean_w, 2)) + '%,  SD = ' + str(round(sd_w, 2)) + '%')
print('  Tinggi >= ' + str(round(mean_w + 0.5*sd_w, 1)) + '% | Sedang ' + str(round(mean_w - 0.5*sd_w, 1)) + '-' + str(round(mean_w + 0.5*sd_w, 1)) + '% | Rendah < ' + str(round(mean_w - 0.5*sd_w, 1)) + '%')

print('')
diff_mean = abs(mean_uw - mean_w)
print('Selisih Mean: ' + str(round(diff_mean, 2)) + '%')
