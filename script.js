// F:\PKL\Project PKL\dashboard\script.js
const DATA_CONFIG = {
    transitionDataPath: 'data/transition_data.json',
    surveyDataPath: 'data/survey_data.json',
};

// Global state
let state = {
    records: [],
    metadata: null,
    survey: null,
    filters: {
        period: 'all',
        jenjang: 'all',
        organization: 'all'
    },
    charts: {},
    tableData: [],
    tableSort: { col: 'org', asc: true },
    tablePage: 1,
    tableRowsPerPage: 15,
    tableSearch: ''
};

// DOM Elements
const els = {
    loading: document.getElementById('loadingOverlay'),
    dataStatus: document.getElementById('dataStatusText'),
    filters: {
        period: document.getElementById('filterGroupPeriod'),
        jenjang: document.getElementById('filterGroupJenjang'),
        org: document.getElementById('filterGroupOrg')
    },
    btnRefresh: document.getElementById('btnRefresh'),
    table: {
        body: document.getElementById('drilldownBody'),
        search: document.getElementById('tableSearch'),
        info: document.getElementById('tableInfo'),
        pageIndicator: document.getElementById('pageIndicator'),
        prev: document.getElementById('prevPage'),
        next: document.getElementById('nextPage'),
        export: document.getElementById('btnExport'),
        headers: document.querySelectorAll('th[data-sort]')
    }
};

Chart.defaults.color = '#A1A1AA';
Chart.defaults.font.family = "'Inter', sans-serif";

// Initialize Dashboard
async function init() {
    setupEventListeners();
    await loadData();
    populateFilters();
    updateDashboard();
}

async function loadData() {
    showLoading(true);
    try {
        const [transRes, surveyRes] = await Promise.allSettled([
            fetch(DATA_CONFIG.transitionDataPath).then(r => r.json()),
            fetch(DATA_CONFIG.surveyDataPath).then(r => r.json())
        ]);

        if (transRes.status === 'fulfilled' && transRes.value.records) {
            state.records = transRes.value.records;
            state.metadata = transRes.value.metadata;
            showToast('Data berhasil dimuat', 'success');
            els.dataStatus.textContent = 'Data Source: Live';
        } else {
            generateSampleData();
            showToast('Menggunakan sample data', 'error');
            els.dataStatus.textContent = 'Data Source: Sample';
        }

        if (surveyRes.status === 'fulfilled') {
            state.survey = surveyRes.value;
        } else {
            state.survey = generateSampleSurveyData();
        }
    } catch (e) {
        generateSampleData();
        state.survey = generateSampleSurveyData();
        showToast('Gagal memuat data. Menggunakan sample.', 'error');
        els.dataStatus.textContent = 'Data Source: Sample';
    } finally {
        showLoading(false);
    }
}

// Filter Logic
function setupEventListeners() {
    // Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            const target = document.getElementById(item.dataset.target);
            if (target) target.classList.add('active');
            
            // Update title
            const titles = {
                'section-overview': {t: 'Overview', s: 'Ringkasan transisi dan retensi siswa'},
                'section-trends': {t: 'Analisis Tren', s: 'Tren pertumbuhan siswa (Lanjut vs Keluar)'},
                'section-survey': {t: 'Analisis Survei', s: 'Data alasan siswa lanjut dan keluar'},
                'section-details': {t: 'Detail Data', s: 'Data detail per unit dan kelas'}
            };
            document.getElementById('pageTitle').textContent = titles[item.dataset.target].t;
            document.getElementById('pageSubtitle').textContent = titles[item.dataset.target].s;
            
            // Re-render charts to fix width issues when unhidden
            setTimeout(renderCharts, 10);
        });
    });

    // Sidebar Menu Toggle
    document.getElementById('menuToggle').addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            document.getElementById('sidebar').classList.toggle('open');
        } else {
            document.getElementById('sidebar').classList.toggle('folded');
            document.querySelector('.main-content').classList.toggle('sidebar-folded');
            // Re-render charts for size adjustment
            setTimeout(renderCharts, 300);
        }
    });

    // Custom Dropdown Logic
    function setupCustomDropdown(groupId, stateKey, onChange) {
        const groupEl = document.getElementById(groupId);
        const dropdownOptions = groupEl.querySelector('.dropdown-options');
        const selectedText = groupEl.querySelector('.dropdown-selected');
        
        groupEl.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-group').forEach(el => {
                if (el !== groupEl) el.classList.remove('active');
            });
            groupEl.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!groupEl.contains(e.target)) {
                groupEl.classList.remove('active');
            }
        });

        dropdownOptions.addEventListener('click', (e) => {
            const option = e.target.closest('.dropdown-option');
            if (option) {
                e.stopPropagation();
                const val = option.dataset.value;
                const text = option.textContent;
                selectedText.textContent = text;
                state.filters[stateKey] = val;
                
                dropdownOptions.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                
                groupEl.classList.remove('active');
                if (onChange) onChange(val);
            }
        });
    }

    setupCustomDropdown('filterGroupPeriod', 'period', () => { updateDashboard(); });
    setupCustomDropdown('filterGroupJenjang', 'jenjang', () => { 
        state.filters.organization = 'all';
        updateOrgFilter(); 
        updateDashboard(); 
    });
    setupCustomDropdown('filterGroupOrg', 'organization', () => { updateDashboard(); });

    // Refresh
    els.btnRefresh.addEventListener('click', async () => {
        els.btnRefresh.classList.add('spinning');
        await loadData();
        populateFilters();
        updateDashboard();
        setTimeout(() => els.btnRefresh.classList.remove('spinning'), 500);
    });

    // Table
    els.table.search.addEventListener('input', (e) => {
        state.tableSearch = e.target.value.toLowerCase();
        state.tablePage = 1;
        renderTable();
    });
    els.table.prev.addEventListener('click', () => {
        if (state.tablePage > 1) { state.tablePage--; renderTable(); }
    });
    els.table.next.addEventListener('click', () => {
        const maxPage = Math.ceil(state.tableData.length / state.tableRowsPerPage);
        if (state.tablePage < maxPage) { state.tablePage++; renderTable(); }
    });
    els.table.headers.forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (state.tableSort.col === col) {
                state.tableSort.asc = !state.tableSort.asc;
            } else {
                state.tableSort.col = col;
                state.tableSort.asc = true;
            }
            sortData();
            renderTable();
        });
    });
    els.table.export.addEventListener('click', exportToCSV);
}

function updateDropdownOptions(groupId, optionsArray) {
    const groupEl = document.getElementById(groupId);
    const optionsContainer = groupEl.querySelector('.dropdown-options');
    const selectedText = groupEl.querySelector('.dropdown-selected');
    
    let html = '';
    optionsArray.forEach(opt => {
        html += `<div class="dropdown-option ${opt.selected ? 'selected' : ''}" data-value="${opt.value}">${opt.label}</div>`;
        if(opt.selected) selectedText.textContent = opt.label;
    });
    optionsContainer.innerHTML = html;
}

function populateFilters() {
    if(!state.metadata) return;
    
    const periodOpts = [{value: 'all', label: 'Semua Tahun Ajaran', selected: state.filters.period === 'all'}];
    state.metadata.periods.forEach(p => {
        periodOpts.push({value: p, label: p, selected: state.filters.period === p});
    });
    updateDropdownOptions('filterGroupPeriod', periodOpts);
    
    updateOrgFilter();
}

function updateOrgFilter() {
    if(!state.metadata) return;
    
    let orgs = [];
    const j = state.filters.jenjang;
    if (j === 'all') {
        Object.values(state.metadata.organizations).forEach(arr => orgs = orgs.concat(arr));
    } else {
        orgs = state.metadata.organizations[j] || [];
    }
    
    orgs = [...new Set(orgs)].sort();
    
    const orgOpts = [{value: 'all', label: 'Semua Unit', selected: state.filters.organization === 'all'}];
    orgs.forEach(o => {
        orgOpts.push({value: o, label: o, selected: state.filters.organization === o});
    });
    updateDropdownOptions('filterGroupOrg', orgOpts);
}

function updateDashboard() {
    const filtered = getFilteredRecords();
    updateKPIs(filtered);
    renderCharts(filtered);
    
    // Prepare table data
    state.tableData = getClassroomDrilldown(filtered);
    sortData();
    renderTable();
}

function getFilteredRecords() {
    return state.records.filter(r => {
        const mPeriod = state.filters.period === 'all' || r.period_code === state.filters.period;
        
        let mJenjang = true;
        if (state.filters.jenjang !== 'all') {
            mJenjang = r.jenjang === state.filters.jenjang;
        }
        
        const mOrg = state.filters.organization === 'all' || r.organization_code === state.filters.organization;
        
        return mPeriod && mJenjang && mOrg;
    });
}

function updateKPIs(records) {
    let lanjut = 0, keluar = 0;
    records.forEach(r => {
        if (r.type === 'lanjut') lanjut += r.jumlah_siswa;
        else if (r.type === 'keluar') keluar += r.jumlah_siswa;
    });
    const total = lanjut + keluar;
    const rate = total > 0 ? ((lanjut / total) * 100).toFixed(1) : 0;
    
    // Calculate YoY
    let prevLanjut = 0, prevKeluar = 0;
    let hasPrev = false;
    
    if (state.metadata && state.metadata.periods && state.metadata.periods.length > 1) {
        // Find current period index
        let currentPeriodIdx = state.metadata.periods.length - 1; // Default to latest if 'all'
        if (state.filters.period !== 'all') {
            currentPeriodIdx = state.metadata.periods.indexOf(state.filters.period);
        }
        
        if (currentPeriodIdx > 0) {
            hasPrev = true;
            const prevPeriod = state.metadata.periods[currentPeriodIdx - 1];
            // Get records for previous period using same jenjang/org filters
            const prevRecords = state.records.filter(r => {
                const mPeriod = r.period_code === prevPeriod;
                let mJenjang = true;
                if (state.filters.jenjang !== 'all') mJenjang = r.jenjang === state.filters.jenjang;
                const mOrg = state.filters.organization === 'all' || r.organization_code === state.filters.organization;
                return mPeriod && mJenjang && mOrg;
            });
            
            prevRecords.forEach(r => {
                if (r.type === 'lanjut') prevLanjut += r.jumlah_siswa;
                else if (r.type === 'keluar') prevKeluar += r.jumlah_siswa;
            });
        }
    }
    
    // Update delta UI function
    const updateDelta = (id, currentVal, prevVal, isInvertedGood = false) => {
        const el = document.getElementById(id);
        if(!el) return;
        const textEl = el.querySelector('.trend-text');
        const iconEl = el.querySelector('.trend-icon');
        
        if (!hasPrev || prevVal === 0) {
            el.className = 'kpi-trend neutral';
            textEl.innerText = '-';
            iconEl.innerText = 'trending_flat';
            return;
        }
        
        const delta = ((currentVal - prevVal) / prevVal) * 100;
        const isPositive = delta > 0;
        const isNegative = delta < 0;
        
        textEl.innerText = (isPositive ? '+' : '') + delta.toFixed(1) + '% YoY';
        
        // Is positive good?
        let isGood = isPositive;
        if (isInvertedGood) isGood = isNegative; // for "Keluar", going down is good
        
        if (delta === 0) {
            el.className = 'kpi-trend neutral';
            iconEl.innerText = 'trending_flat';
        } else if (isGood) {
            el.className = 'kpi-trend positive';
            iconEl.innerText = isPositive ? 'trending_up' : 'trending_down';
        } else {
            el.className = 'kpi-trend negative';
            iconEl.innerText = isPositive ? 'trending_up' : 'trending_down';
        }
    };
    
    // Only calculate current rate if filtering specific period, otherwise use last year's rate for YoY if all
    let currentLanjutForRate = lanjut;
    let currentTotalForRate = total;
    if (state.filters.period === 'all' && hasPrev) {
         // If all periods, we compare latest vs previous
         const latestPeriod = state.metadata.periods[state.metadata.periods.length - 1];
         let latestLanjut = 0, latestKeluar = 0;
         state.records.filter(r => r.period_code === latestPeriod && 
            (state.filters.jenjang === 'all' || r.jenjang === state.filters.jenjang) &&
            (state.filters.organization === 'all' || r.organization_code === state.filters.organization)
         ).forEach(r => {
             if (r.type === 'lanjut') latestLanjut += r.jumlah_siswa;
             else if (r.type === 'keluar') latestKeluar += r.jumlah_siswa;
         });
         currentLanjutForRate = latestLanjut;
         currentTotalForRate = latestLanjut + latestKeluar;
    }
    
    const prevTotal = prevLanjut + prevKeluar;
    const prevRate = prevTotal > 0 ? (prevLanjut / prevTotal) * 100 : 0;
    const currentRate = currentTotalForRate > 0 ? (currentLanjutForRate / currentTotalForRate) * 100 : 0;
    
    // In updateKPIs, "lanjut" is total. If "all", YoY of sum vs sum doesn't make sense, we use latest vs previous.
    const displayLanjut = state.filters.period === 'all' ? currentLanjutForRate : lanjut;
    const displayKeluar = state.filters.period === 'all' ? (currentTotalForRate - currentLanjutForRate) : keluar;
    const displayTotal = state.filters.period === 'all' ? currentTotalForRate : total;
    
    updateDelta('kpiLanjutDelta', displayLanjut, prevLanjut, false);
    updateDelta('kpiKeluarDelta', displayKeluar, prevKeluar, true);
    
    // Rate delta is absolute difference in percentage points
    const elRate = document.getElementById('kpiRetentionDelta');
    if (elRate && hasPrev) {
        const rateDiff = currentRate - prevRate;
        const textEl = elRate.querySelector('.trend-text');
        const iconEl = elRate.querySelector('.trend-icon');
        textEl.innerText = (rateDiff > 0 ? '+' : '') + rateDiff.toFixed(1) + '% YoY';
        if (rateDiff === 0) {
            elRate.className = 'kpi-trend neutral';
            iconEl.innerText = 'trending_flat';
        } else if (rateDiff > 0) {
            elRate.className = 'kpi-trend positive';
            iconEl.innerText = 'trending_up';
        } else {
            elRate.className = 'kpi-trend negative';
            iconEl.innerText = 'trending_down';
        }
    }
    
    updateDelta('kpiTotalDelta', displayTotal, prevTotal, false);
    
    animateValue('kpiTotalLanjut', lanjut);
    animateValue('kpiTotalKeluar', keluar);
    animateValue('kpiRetentionRate', rate, '%');
    animateValue('kpiTotalSiswa', total);
}

function animateValue(id, end, suffix = '') {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const duration = 1000;
    const endVal = parseFloat(end);
    
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const curr = (progress * endVal).toFixed(suffix === '%' ? 1 : 0);
        obj.innerHTML = curr + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Charting
function destroyChart(id) {
    if (state.charts[id]) {
        state.charts[id].destroy();
        delete state.charts[id];
    }
}

function renderCharts(filtered = getFilteredRecords()) {
    if(!state.metadata) return;
    
    const aggPeriod = aggregateByPeriod(filtered);
    const labels = state.metadata.periods;
    const dataLanjut = labels.map(p => aggPeriod[p] ? aggPeriod[p].lanjut : 0);
    const dataKeluar = labels.map(p => aggPeriod[p] ? aggPeriod[p].keluar : 0);

    // 1. Overview Trend (Line)
    destroyChart('overviewTrendChart');
    state.charts['overviewTrendChart'] = new Chart(document.getElementById('overviewTrendChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Lanjut', data: dataLanjut, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)', fill: true, tension: 0.4 },
                { label: 'Keluar', data: dataKeluar, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // 2. Overview Donut
    destroyChart('overviewDonutChart');
    const totL = dataLanjut.reduce((a,b)=>a+b,0);
    const totK = dataKeluar.reduce((a,b)=>a+b,0);
    state.charts['overviewDonutChart'] = new Chart(document.getElementById('overviewDonutChart'), {
        type: 'doughnut',
        plugins: [ChartDataLabels],
        data: {
            labels: ['Lanjut', 'Keluar'],
            datasets: [{ data: [totL, totK], backgroundColor: ['#10B981', '#EF4444'], borderWidth: 0, cutout: '75%', hoverOffset: 10 }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom' },
                datalabels: { color: '#fff', formatter: (v, ctx) => { let sum = ctx.dataset.data.reduce((a,b)=>a+b,0); return sum>0 ? Math.round((v*100)/sum)+"%" : ""; } }
            }
        }
    });

    // 3. Trend Line Large
    destroyChart('trendLineChart');
    state.charts['trendLineChart'] = new Chart(document.getElementById('trendLineChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Lanjut', data: dataLanjut, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)', fill: true, tension: 0.4 },
                { label: 'Keluar', data: dataKeluar, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // 4 & 5. Jenjang charts
    const aggJenjang = aggregateByJenjang(filtered, labels);
    
    destroyChart('keluarJenjangChart');
    state.charts['keluarJenjangChart'] = new Chart(document.getElementById('keluarJenjangChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'TK', data: labels.map(p => aggJenjang[p].keluar.TK), backgroundColor: '#FCA5A5' },
                { label: 'SD', data: labels.map(p => aggJenjang[p].keluar.SD), backgroundColor: '#EF4444' },
                { label: 'SMP', data: labels.map(p => aggJenjang[p].keluar.SMP), backgroundColor: '#991B1B' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: false }, y: { stacked: false } } }
    });

    destroyChart('lanjutJenjangChart');
    state.charts['lanjutJenjangChart'] = new Chart(document.getElementById('lanjutJenjangChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'TK', data: labels.map(p => aggJenjang[p].lanjut.TK), backgroundColor: '#34D399' },
                { label: 'SD', data: labels.map(p => aggJenjang[p].lanjut.SD), backgroundColor: '#10B981' },
                { label: 'SMP', data: labels.map(p => aggJenjang[p].lanjut.SMP), backgroundColor: '#047857' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: false }, y: { stacked: false } } }
    });

    // Survey Charts
    if(state.survey) {
        let sKey = state.filters.jenjang === 'all' ? 'ALL' : state.filters.jenjang;
        if(!state.survey.alasan_keluar[sKey]) sKey = 'ALL';
        
        const aK = (state.survey.alasan_keluar[sKey] || []).slice(0,7);
        const aL = (state.survey.alasan_lanjut[sKey] || []).slice(0,7);

        destroyChart('alasanKeluarChart');
        state.charts['alasanKeluarChart'] = new Chart(document.getElementById('alasanKeluarChart'), {
            type: 'bar',
            data: {
                labels: aK.map(d => d.alasan),
                datasets: [{ label: 'Jumlah', data: aK.map(d => d.jumlah), backgroundColor: '#EF4444', borderRadius: 4 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        destroyChart('alasanLanjutChart');
        state.charts['alasanLanjutChart'] = new Chart(document.getElementById('alasanLanjutChart'), {
            type: 'bar',
            data: {
                labels: aL.map(d => d.alasan),
                datasets: [{ label: 'Jumlah', data: aL.map(d => d.jumlah), backgroundColor: '#10B981', borderRadius: 6 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}

// Data Aggregation
function aggregateByPeriod(records) {
    const res = {};
    records.forEach(r => {
        if (!res[r.period_code]) res[r.period_code] = { lanjut: 0, keluar: 0 };
        res[r.period_code][r.type] += r.jumlah_siswa;
    });
    return res;
}

function aggregateByJenjang(records, periods) {
    const res = {};
    periods.forEach(p => {
        res[p] = {
            lanjut: { TK: 0, SD: 0, SMP: 0 },
            keluar: { TK: 0, SD: 0, SMP: 0 }
        };
    });
    
    records.forEach(r => {
        if(!res[r.period_code]) return;
        let j = r.jenjang;
        if(res[r.period_code][r.type] && res[r.period_code][r.type][j] !== undefined) {
            res[r.period_code][r.type][j] += r.jumlah_siswa;
        }
    });
    return res;
}

function getClassroomDrilldown(records) {
    const map = {};
    records.forEach(r => {
        const key = `${r.organization_code}_${r.classroom_code}`;
        if (!map[key]) {
            let j = r.jenjang;
            
            map[key] = {
                org: r.organization_code,
                kelas: r.classroom_code,
                jenjang: j,
                lanjut: 0,
                keluar: 0
            };
        }
        map[key][r.type] += r.jumlah_siswa;
    });
    
    return Object.values(map).map(d => {
        const total = d.lanjut + d.keluar;
        d.retention = total > 0 ? (d.lanjut / total) * 100 : 0;
        return d;
    });
}

// Table & Data processing
function sortData() {
    const { col, asc } = state.tableSort;
    state.tableData.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
    });
}

function renderTable() {
    let html = '';
    let filtered = state.tableData;
    
    if (state.tableSearch) {
        filtered = filtered.filter(row => 
            row.org.toLowerCase().includes(state.tableSearch) || 
            row.kelas.toLowerCase().includes(state.tableSearch)
        );
    }
    
    const maxPage = Math.ceil(filtered.length / state.tableRowsPerPage) || 1;
    if (state.tablePage > maxPage) state.tablePage = maxPage;
    
    const start = (state.tablePage - 1) * state.tableRowsPerPage;
    const paginated = filtered.slice(start, start + state.tableRowsPerPage);
    
    paginated.forEach(row => {
        const badge = row.retention >= 70 ? '<span class="badge-lanjut">Tinggi</span>' : '<span class="badge-keluar">Rendah</span>';
        
        // Heatmap color for retention cell
        const hue = (row.retention / 100) * 120; // 0=red, 120=green
        const bg = `rgba(${hue < 60 ? 255 : 255 - ((hue-60)*4)}, ${hue > 60 ? 255 : (hue*4)}, 0, 0.15)`;
        
        html += `
            <tr>
                <td>${row.org}</td>
                <td>${row.kelas}</td>
                <td>${row.jenjang}</td>
                <td>${row.lanjut}</td>
                <td>${row.keluar}</td>
                <td style="background-color: ${bg}; font-weight: 600">${row.retention.toFixed(1)}%</td>
                <td>${badge}</td>
            </tr>
        `;
    });
    
    if (paginated.length === 0) {
        html = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted)">Tidak ada data ditemukan</td></tr>`;
    }
    
    els.table.body.innerHTML = html;
    
    els.table.info.textContent = `Menampilkan ${filtered.length > 0 ? start + 1 : 0} - ${Math.min(start + state.tableRowsPerPage, filtered.length)} dari ${filtered.length} data`;
    els.table.pageIndicator.textContent = `Halaman ${state.tablePage} dari ${maxPage}`;
}

function exportToCSV() {
    if (state.tableData.length === 0) return;
    
    const headers = ['Unit', 'Kelas', 'Jenjang', 'Jumlah Lanjut', 'Jumlah Keluar', 'Retention Rate'];
    const rows = state.tableData.map(r => 
        [r.org, r.kelas, r.jenjang, r.lanjut, r.keluar, r.retention.toFixed(1) + '%'].join(',')
    );
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'detail_transisi.csv';
    link.click();
}

// Utilities
function showLoading(show) {
    if (show) els.loading.classList.add('active');
    else els.loading.classList.remove('active');
}

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'check_circle' : 'error';
    toast.innerHTML = `<span class="material-icons-round toast-icon">${icon}</span> <span>${msg}</span>`;
    
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Mock Data Generators
function generateSampleData() {
    const periods = ["2021/2022", "2022/2023", "2023/2024", "2024/2025", "2025/2026"];
    const orgs = {
        "TK": ["K01","K02","K03"],
        "SD": ["D01","D02","D03"],
        "SMP": ["P01","P02"]
    };
    
    state.metadata = {
        periods,
        organizations: orgs,
        jenjang_lanjut: {"TK": ["TK-A","SD-1"], "SD": ["SMP-1"], "SMP": ["SMA-1"]},
        jenjang_keluar: {"TK": "KELUAR_TK", "SD": "KELUAR_SD", "SMP": "KELUAR_SMP"}
    };
    
    state.records = [];
    periods.forEach(p => {
        Object.keys(orgs).forEach(j => {
            orgs[j].forEach(o => {
                const lanjutType = state.metadata.jenjang_lanjut[j][0];
                const keluarType = state.metadata.jenjang_keluar[j];
                
                state.records.push({ jenjang: lanjutType, type: 'lanjut', period_code: p, organization_code: o, classroom_code: 'A', jumlah_siswa: Math.floor(Math.random()*20)+10 });
                state.records.push({ jenjang: keluarType, type: 'keluar', period_code: p, organization_code: o, classroom_code: 'A', jumlah_siswa: Math.floor(Math.random()*5) });
                
                state.records.push({ jenjang: lanjutType, type: 'lanjut', period_code: p, organization_code: o, classroom_code: 'B', jumlah_siswa: Math.floor(Math.random()*20)+10 });
                state.records.push({ jenjang: keluarType, type: 'keluar', period_code: p, organization_code: o, classroom_code: 'B', jumlah_siswa: Math.floor(Math.random()*5) });
            });
        });
    });
}

function generateSampleSurveyData() {
    return {
        is_placeholder: true,
        alasan_keluar: {
            "ALL": [
                {alasan: "Pindah Kota/Domisili", jumlah: 145},
                {alasan: "Biaya Pendidikan", jumlah: 85},
                {alasan: "Kurikulum Tidak Sesuai", jumlah: 42},
                {alasan: "Fasilitas Kurang", jumlah: 38},
                {alasan: "Jarak Terlalu Jauh", jumlah: 24}
            ]
        },
        alasan_lanjut: {
            "ALL": [
                {alasan: "Kualitas Akademik", jumlah: 320},
                {alasan: "Fasilitas Lengkap", jumlah: 254},
                {alasan: "Lokasi Strategis", jumlah: 180},
                {alasan: "Biaya Terjangkau", jumlah: 150},
                {alasan: "Rekomendasi", jumlah: 95}
            ]
        }
    };
}

// Start
document.addEventListener('DOMContentLoaded', init);
