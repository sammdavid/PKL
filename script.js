const DATA_CONFIG = {
    transitionDataPath: './data/transition_data.json',
    surveyDataPath: './data/survey_data.json',
};

// --- Official Petra Organization Code to Full Name Mapping ---
const ORG_NAMES = {
    // KB & TK
    "K01": "KB & TK Kristen Petra 1",
    "K02": "KB & TK Kristen Petra 2",
    "K03": "KB & TK Kristen Petra 3",
    "K04": "KB & TK Kristen Petra 4",
    "K05": "KB & TK Kristen Petra 5",
    "K06": "KB & TK Kristen Petra 6",
    "K07": "KB & TK Kristen Petra 7",
    "K08": "KB & TK Kristen Petra 8",
    "K09": "KB & TK Kristen Petra 9",
    "K10": "KB & TK Kristen Petra 10",
    "K11": "KB & TK Kristen Petra 11",
    "K12": "KB & TK Kristen Petra 12",
    "K13": "KB & TK Kristen Petra 13",

    // SD
    "D01": "SD Kristen Petra 1",
    "D02": "SD Kristen Petra 2",
    "D03": "SD Kristen Petra 3",
    "D04": "SD Kristen Petra 4",
    "D05": "SD Kristen Petra 5",
    "D06": "SD Kristen Petra 6",
    "D07": "SD Kristen Petra 7",
    "D08": "SD Kristen Petra 8",
    "D09": "SD Kristen Petra 9",
    "D10": "SD Kristen Petra 10",
    "D11": "SD Kristen Petra 11",
    "D12": "SD Kristen Petra 12",
    "D13": "SD Kristen Petra 13",

    // SMP
    "P01": "SMP Kristen Petra 1",
    "P02": "SMP Kristen Petra 2",
    "P03": "SMP Kristen Petra 3",
    "P04": "SMP Kristen Petra 4",
    "P05": "SMP Kristen Petra 5",
    "P06": "SMP Kristen Petra Acitya",
    "P07": "SMP Kristen Petra 7",

    // SMA / SMK
    "S01": "SMA Kristen Petra 1",
    "S02": "SMA Kristen Petra 2",
    "S03": "SMA Kristen Petra 3",
    "S04": "SMA Kristen Petra 4",
    "S05": "SMA Kristen Petra 5",
    "S06": "SMA Kristen Petra Acitya",
    "M01": "SMK Kristen Petra"
};

function getOrgName(code) {
    return ORG_NAMES[code] || code;
}

// --- Retention Status Classification (Dynamic: Mean ± 0.5 SD) ---
// Threshold dihitung otomatis dari data yang sedang ditampilkan.
// Multiplier 0.5 dipilih karena menghasilkan distribusi paling seimbang (~34/39/26%).
const SD_MULTIPLIER = 0.5;

function computeThresholds(tableData) {
    if (tableData.length < 2) return { tinggi: 100, rendah: 0, mean: 0, sd: 0 };
    const rates = tableData.map(d => d.retention);
    const n = rates.length;
    const mean = rates.reduce((a, b) => a + b, 0) / n;
    const variance = rates.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const sd = Math.sqrt(variance);
    return {
        tinggi: mean + SD_MULTIPLIER * sd,
        rendah: mean - SD_MULTIPLIER * sd,
        mean: mean,
        sd: sd
    };
}

function getStatusLabel(retentionRate) {
    if (retentionRate >= state.thresholds.tinggi) return 'tinggi';
    if (retentionRate >= state.thresholds.rendah) return 'sedang';
    return 'rendah';
}

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
    tableSearch: '',
    thresholds: { tinggi: 100, rendah: 0, mean: 0, sd: 0 }, // computed dynamically
    detailLevel: 0,
    selectedJenjang: null,
    selectedOrg: null
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

Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
if (Chart.defaults.plugins && Chart.defaults.plugins.legend) {
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    Chart.defaults.plugins.legend.labels.padding = 20;
}

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
            if (els.dataStatus) els.dataStatus.textContent = 'Data Source: Live';
        } else {
            generateSampleData();
            showToast('Menggunakan sample data', 'error');
            if (els.dataStatus) els.dataStatus.textContent = 'Data Source: Sample';
        }

        try {
            const [alasanMendaftar, alasanKeluar, sumberInfo, kepuasanLayanan] = await Promise.all([
                fetch('data/survey_data/alasan_mendaftar.json').then(r => r.json()),
                fetch('data/survey_data/alasan_keluar.json').then(r => r.json()),
                fetch('data/survey_data/sumber_info.json').then(r => r.json()),
                fetch('data/survey_data/kepuasan_layanan.json').then(r => r.json())
            ]);
            state.survey = {
                alasan_mendaftar: alasanMendaftar,
                alasan_keluar: alasanKeluar,
                sumber_info: sumberInfo,
                kepuasan_layanan: kepuasanLayanan
            };
        } catch (surveyErr) {
            console.warn('Gagal memuat survey_data JSON, mencoba fallback:', surveyErr);
            if (surveyRes.status === 'fulfilled') {
                state.survey = surveyRes.value;
            } else {
                state.survey = generateSampleSurveyData();
            }
        }
    } catch (e) {
        generateSampleData();
        state.survey = generateSampleSurveyData();
        showToast('Gagal memuat data. Menggunakan sample.', 'error');
        if (els.dataStatus) els.dataStatus.textContent = 'Data Source: Sample';
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
            
            // Reset detail drill-down when navigating to Detail Sekolah
            if (item.dataset.target === 'section-details') {
                state.detailLevel = 0;
                state.selectedJenjang = null;
                state.selectedOrg = null;
                navigateDetail(0);
            }
            
            // Update title
            const titles = {
                'section-overview': {t: 'Overview', s: 'Ringkasan transisi dan retensi siswa'},
                'section-trends': {t: 'Analisis Tren', s: 'Tren pertumbuhan siswa (Lanjut vs Keluar)'},
                'section-survey': {t: 'Analisis Survei', s: 'Data alasan siswa lanjut dan keluar'},
                'section-details': {t: 'Detail Sekolah', s: 'Navigasi detail per jenjang, sekolah, dan kelas'}
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

    function resetAllFilters() {
        state.filters.period = 'all';
        state.filters.jenjang = 'all';
        state.filters.organization = 'all';
        state.tableSearch = '';
        state.tablePage = 1;
        state.detailLevel = 0;
        state.selectedJenjang = null;
        state.selectedOrg = null;
        state.tableSort = { col: 'org', asc: true };
        if (els.table.search) els.table.search.value = '';
        
        const jenjangSel = document.querySelector('#filterGroupJenjang .dropdown-selected');
        if (jenjangSel) jenjangSel.textContent = 'Semua Jenjang';
        document.querySelectorAll('#filterGroupJenjang .dropdown-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.value === 'all');
        });
        
        populateFilters();
        updateDashboard();
        navigateDetail(0);
        showToast('Semua filter & sorting dikembalikan ke default', 'success');
    }

    const btnResetFilter = document.getElementById('btnResetFilter');
    if (btnResetFilter) {
        btnResetFilter.addEventListener('click', resetAllFilters);
    }

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
    const drilldownHeader = document.getElementById('drilldownHeader');
    if (drilldownHeader) {
        drilldownHeader.addEventListener('click', (e) => {
            const th = e.target.closest('th[data-sort]');
            if (!th) return;
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
    }
    if(els.table.export) els.table.export.addEventListener('click', exportToCSV);

    const btnExportSurveyCSV = document.getElementById('btnExportSurveyCSV');
    if (btnExportSurveyCSV) btnExportSurveyCSV.addEventListener('click', exportSurveyToCSV);

    const btnExportSurveyExcel = document.getElementById('btnExportSurveyExcel');
    if (btnExportSurveyExcel) btnExportSurveyExcel.addEventListener('click', exportSurveyToExcel);
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
    
    const orgOpts = [{value: 'all', label: 'Semua Sekolah', selected: state.filters.organization === 'all'}];
    orgs.forEach(o => {
        const name = getOrgName(o);
        const labelText = name !== o ? `${o} — ${name}` : o;
        orgOpts.push({value: o, label: labelText, selected: state.filters.organization === o});
    });
    updateDropdownOptions('filterGroupOrg', orgOpts);
}

// ========== Detail Sekolah Drill-Down ==========

function navigateDetail(level, jenjang, org) {
    state.detailLevel = level;
    if (jenjang !== undefined) state.selectedJenjang = jenjang;
    if (org !== undefined) state.selectedOrg = org;
    
    // Show/hide levels
    document.querySelectorAll('.detail-level').forEach(el => el.classList.remove('active'));
    const activeLevel = document.getElementById('detailLevel' + level);
    if (activeLevel) activeLevel.classList.add('active');
    
    // Show/hide nav bar
    const navBar = document.getElementById('detailNavBar');
    if (navBar) navBar.style.display = level === 0 ? 'none' : 'flex';
    
    // Update breadcrumb
    updateDetailBreadcrumb();
    
    // Render appropriate level
    const filtered = getFilteredRecords();
    if (level === 0) {
        renderDetailLevel0(filtered);
    } else if (level === 1) {
        renderDetailLevel1(filtered);
    } else if (level === 2) {
        renderDetailLevel2(filtered);
    }
}

function updateDetailBreadcrumb() {
    const bc = document.getElementById('detailBreadcrumb');
    if (!bc) return;
    
    let html = '<span class="detail-breadcrumb-item" onclick="navigateDetail(0)">Detail Sekolah</span>';
    
    if (state.detailLevel >= 1 && state.selectedJenjang) {
        html += '<span class="detail-breadcrumb-sep material-icons-round">chevron_right</span>';
        if (state.detailLevel === 1) {
            html += `<span class="detail-breadcrumb-item active">${state.selectedJenjang}</span>`;
        } else {
            html += `<span class="detail-breadcrumb-item" onclick="navigateDetail(1, '${state.selectedJenjang}')">${state.selectedJenjang}</span>`;
        }
    }
    
    if (state.detailLevel >= 2 && state.selectedOrg) {
        html += '<span class="detail-breadcrumb-sep material-icons-round">chevron_right</span>';
        const orgName = getOrgName(state.selectedOrg);
        html += `<span class="detail-breadcrumb-item active">${orgName} [${state.selectedOrg}]</span>`;
    }
    
    bc.innerHTML = html;
    
    // Setup back button
    const backBtn = document.getElementById('detailBackBtn');
    if (backBtn) {
        backBtn.onclick = () => {
            if (state.detailLevel === 2) {
                navigateDetail(1, state.selectedJenjang);
            } else if (state.detailLevel === 1) {
                navigateDetail(0);
            }
        };
    }
}

function getJenjangStats(records) {
    const jenjangList = ['TK', 'SD', 'SMP'];
    const stats = {};
    
    jenjangList.forEach(j => {
        const jRecords = records.filter(r => r.jenjang === j);
        let lanjut = 0, keluar = 0;
        const orgSet = new Set();
        const classSet = new Set();
        
        jRecords.forEach(r => {
            if (r.type === 'lanjut') lanjut += r.jumlah_siswa;
            else if (r.type === 'keluar') keluar += r.jumlah_siswa;
            orgSet.add(r.organization_code);
            classSet.add(r.organization_code + '_' + r.classroom_code);
        });
        
        const total = lanjut + keluar;
        stats[j] = {
            lanjut,
            keluar,
            total,
            retention: total > 0 ? (lanjut / total * 100) : 0,
            orgCount: orgSet.size,
            classCount: classSet.size
        };
    });
    
    return stats;
}

function getOrgStats(records, jenjang) {
    const orgRecords = records.filter(r => r.jenjang === jenjang);
    const orgMap = {};
    
    orgRecords.forEach(r => {
        if (!orgMap[r.organization_code]) {
            orgMap[r.organization_code] = { lanjut: 0, keluar: 0, classes: new Set() };
        }
        orgMap[r.organization_code].classes.add(r.classroom_code);
        if (r.type === 'lanjut') orgMap[r.organization_code].lanjut += r.jumlah_siswa;
        else if (r.type === 'keluar') orgMap[r.organization_code].keluar += r.jumlah_siswa;
    });
    
    return Object.entries(orgMap).map(([code, data]) => {
        const total = data.lanjut + data.keluar;
        return {
            code,
            name: getOrgName(code),
            lanjut: data.lanjut,
            keluar: data.keluar,
            total,
            retention: total > 0 ? (data.lanjut / total * 100) : 0,
            classCount: data.classes.size
        };
    }).sort((a, b) => a.code.localeCompare(b.code));
}

function getYearlyStats(records) {
    const periods = state.metadata ? state.metadata.periods : [];
    const yearly = {};
    
    records.forEach(r => {
        if (!yearly[r.period_code]) yearly[r.period_code] = { lanjut: 0, keluar: 0 };
        if (r.type === 'lanjut') yearly[r.period_code].lanjut += r.jumlah_siswa;
        else if (r.type === 'keluar') yearly[r.period_code].keluar += r.jumlah_siswa;
    });
    
    return periods.filter(p => yearly[p]).map(p => {
        const d = yearly[p];
        const total = d.lanjut + d.keluar;
        return {
            period: p,
            lanjut: d.lanjut,
            keluar: d.keluar,
            total,
            retention: total > 0 ? (d.lanjut / total * 100) : 0
        };
    });
}

function renderDetailLevel0(filtered) {
    const stats = getJenjangStats(filtered);
    const grid = document.getElementById('jenjangCardGrid');
    if (!grid) return;
    
    const icons = { TK: 'child_care', SD: 'menu_book', SMP: 'school' };
    const labels = { TK: 'Taman Kanak-Kanak', SD: 'Sekolah Dasar', SMP: 'Sekolah Menengah Pertama' };
    
    let html = '';
    ['TK', 'SD', 'SMP'].forEach(j => {
        const s = stats[j];
        
        const yearlyData = getYearlyStats(filtered.filter(r => r.jenjang === j));
        let yearlyHtml = '';
        if (yearlyData.length > 1) {
            yearlyHtml = `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Per Tahun Ajaran</div>`;
            yearlyData.forEach(y => {
                yearlyHtml += `<div class="jenjang-stat-row" style="margin-bottom: 4px;">
                    <span class="jenjang-stat-label" style="font-size: 12px;">${y.period}</span>
                    <span class="jenjang-stat-value" style="font-size: 13px;">${y.retention.toFixed(1)}%</span>
                </div>`;
            });
            yearlyHtml += `</div>`;
        }
        html += `
        <div class="jenjang-card" onclick="navigateDetail(1, '${j}')">
            <div class="jenjang-card-header">
                <div class="jenjang-card-title">${j}</div>
                <div class="jenjang-card-icon">
                    <span class="material-icons-round">${icons[j]}</span>
                </div>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; font-weight: 500;">${labels[j]}</div>
            <div class="jenjang-card-stats">
                <div class="jenjang-stat-row">
                    <span class="jenjang-stat-label">Cabang Sekolah</span>
                    <span class="jenjang-stat-value">${s.orgCount} sekolah</span>
                </div>
                <div class="jenjang-stat-row">
                    <span class="jenjang-stat-label">Total Kelas</span>
                    <span class="jenjang-stat-value">${s.classCount} kelas</span>
                </div>
                <div class="jenjang-stat-row">
                    <span class="jenjang-stat-label">Siswa Lanjut</span>
                    <span class="jenjang-stat-value" style="color: var(--green-dark);">${s.lanjut.toLocaleString()}</span>
                </div>
                <div class="jenjang-stat-row">
                    <span class="jenjang-stat-label">Siswa Keluar</span>
                    <span class="jenjang-stat-value" style="color: var(--yellow-dark);">${s.keluar.toLocaleString()}</span>
                </div>
                <div class="jenjang-stat-row">
                    <span class="jenjang-stat-label">Retention Rate</span>
                    <span class="jenjang-stat-value" style="font-size: 18px; font-weight: 700;">${s.retention.toFixed(1)}%</span>
                </div>
            </div>
            ${yearlyHtml}
            <div class="jenjang-retention-bar">
                <div class="jenjang-retention-fill" style="width: ${s.retention}%;"></div>
            </div>
            <div class="jenjang-card-footer">
                <span>Lihat detail</span>
                <span class="material-icons-round">arrow_forward</span>
            </div>
        </div>`;
    });
    
    grid.innerHTML = html;
}

function renderDetailLevel1(filtered) {
    const orgStats = getOrgStats(filtered, state.selectedJenjang);
    const grid = document.getElementById('schoolCardGrid');
    if (!grid) return;
    
    // Compute thresholds for org-level retention
    const orgRetentions = orgStats.map(o => ({ retention: o.retention }));
    const orgThresholds = computeThresholds(orgRetentions);
    
    let html = '';
    orgStats.forEach(o => {
        const orgYearly = getYearlyStats(filtered.filter(r => r.jenjang === state.selectedJenjang && r.organization_code === o.code));
        let yearlyMiniHtml = '';
        if (orgYearly.length > 1) {
            yearlyMiniHtml = `<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px;">`;
            orgYearly.forEach(y => {
                const shortYear = y.period.split('/')[0].slice(-2) + '/' + y.period.split('/')[1].slice(-2);
                yearlyMiniHtml += `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.04); color: var(--text-secondary);">${shortYear}: ${y.retention.toFixed(0)}%</span>`;
            });
            yearlyMiniHtml += `</div>`;
        }

        let statusLabel, badgeClass;
        if (o.retention >= orgThresholds.tinggi) {
            statusLabel = 'Tinggi'; badgeClass = 'badge-tinggi';
        } else if (o.retention >= orgThresholds.rendah) {
            statusLabel = 'Sedang'; badgeClass = 'badge-sedang';
        } else {
            statusLabel = 'Rendah'; badgeClass = 'badge-rendah';
        }
        
        html += `
        <div class="school-card" onclick="navigateDetail(2, '${state.selectedJenjang}', '${o.code}')">
            <div class="school-card-header">
                <div class="school-card-name">${o.name}</div>
                <span class="school-card-code">${o.code}</span>
            </div>
            <div class="school-card-retention">${o.retention.toFixed(1)}%</div>
            ${yearlyMiniHtml}
            <div class="school-card-meta">
                <span class="school-card-classes">${o.classCount} kelas &middot; ${o.total.toLocaleString()} siswa</span>
                <span class="${badgeClass}">${statusLabel}</span>
            </div>
            <div class="school-card-footer">
                <span class="school-card-detail-link">
                    <span>Lihat kelas</span>
                    <span class="material-icons-round">arrow_forward</span>
                </span>
            </div>
        </div>`;
    });
    
    grid.innerHTML = html;
    
    // Render comparison chart
    renderSchoolComparisonChart(orgStats, orgThresholds);
    
    // Render yearly trend chart
    renderJenjangYearlyTrend(filtered, state.selectedJenjang);
}

function renderSchoolComparisonChart(orgStats, thresholds) {
    destroyChart('schoolComparisonChart');
    const canvas = document.getElementById('schoolComparisonChart');
    if (!canvas) return;
    
    const labels = orgStats.map(o => o.code);
    const data = orgStats.map(o => o.retention.toFixed(1));
    const colors = orgStats.map(o => {
        if (o.retention >= thresholds.tinggi) return 'rgba(2, 197, 190, 0.8)';
        if (o.retention >= thresholds.rendah) return 'rgba(71, 85, 105, 0.6)';
        return 'rgba(255, 152, 0, 0.8)';
    });
    
    state.charts['schoolComparisonChart'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Retention Rate (%)',
                data,
                backgroundColor: colors,
                borderRadius: 8,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    formatter: v => v + '%',
                    font: { weight: 600, size: 12 },
                    color: '#1e293b'
                }
            },
            scales: {
                x: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
                y: { grid: { display: false } }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function renderJenjangYearlyTrend(records, jenjang) {
    destroyChart('jenjangYearlyTrendChart');
    const canvas = document.getElementById('jenjangYearlyTrendChart');
    if (!canvas) return;
    
    const jRecords = records.filter(r => r.jenjang === jenjang);
    const yearlyData = getYearlyStats(jRecords);
    if (yearlyData.length < 2) {
        canvas.parentElement.style.display = 'none';
        return;
    }
    canvas.parentElement.style.display = '';
    
    state.charts['jenjangYearlyTrendChart'] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: yearlyData.map(y => y.period),
            datasets: [{
                label: 'Retention Rate (%)',
                data: yearlyData.map(y => y.retention.toFixed(1)),
                borderColor: 'rgba(2, 197, 190, 1)',
                backgroundColor: 'rgba(2, 197, 190, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 6,
                pointBackgroundColor: 'rgba(2, 197, 190, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    formatter: v => v + '%',
                    font: { weight: 600, size: 12 },
                    color: '#1e293b'
                }
            },
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
                x: { grid: { display: false } }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function renderDetailLevel2(filtered) {
    const orgRecords = filtered.filter(r => r.jenjang === state.selectedJenjang && r.organization_code === state.selectedOrg);
    
    // School info header
    const header = document.getElementById('schoolInfoHeader');
    if (header) {
        const orgName = getOrgName(state.selectedOrg);
        let totalLanjut = 0, totalKeluar = 0;
        orgRecords.forEach(r => {
            if (r.type === 'lanjut') totalLanjut += r.jumlah_siswa;
            else if (r.type === 'keluar') totalKeluar += r.jumlah_siswa;
        });
        const totalAll = totalLanjut + totalKeluar;
        const overallRetention = totalAll > 0 ? (totalLanjut / totalAll * 100) : 0;
        
        header.innerHTML = `
            <div class="school-info-left">
                <div class="school-info-icon">
                    <span class="material-icons-round">account_balance</span>
                </div>
                <div>
                    <div class="school-info-name">${orgName}</div>
                    <div class="school-info-code">${state.selectedOrg} &middot; ${state.selectedJenjang} &middot; ${totalAll.toLocaleString()} siswa</div>
                </div>
            </div>
            <div class="school-info-right">
                <div class="school-info-retention">${overallRetention.toFixed(1)}%</div>
                <div class="school-info-retention-label">Retention Rate</div>
            </div>`;
    }
    
    // Use existing table logic for class-level data
    state.tableData = getClassroomDrilldown(orgRecords);
    state.tableSort = { col: 'kelas', asc: true };
    state.tablePage = 1;
    state.tableSearch = '';
    const searchInput = document.getElementById('tableSearch');
    if (searchInput) searchInput.value = '';
    
    sortData();
    updateStatusSummary(state.tableData);
    renderTable();
    
    // Render class-level charts
    renderClassCharts(state.tableData);
    
    // Render yearly trend for this school
    renderSchoolYearlyTrend(filtered);
}

function renderClassCharts(tableData) {
    // 1. Retention Rate per Kelas (horizontal bar)
    destroyChart('classRetentionChart');
    const canvas1 = document.getElementById('classRetentionChart');
    if (canvas1 && tableData.length > 0) {
        const sorted = [...tableData].sort((a, b) => b.retention - a.retention);
        const labels = sorted.map(d => d.kelas);
        const data = sorted.map(d => d.retention.toFixed(1));
        const colors = sorted.map(d => {
            const s = getStatusLabel(d.retention);
            if (s === 'tinggi') return 'rgba(2, 197, 190, 0.8)';
            if (s === 'sedang') return 'rgba(71, 85, 105, 0.6)';
            return 'rgba(255, 152, 0, 0.8)';
        });
        
        state.charts['classRetentionChart'] = new Chart(canvas1, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Retention Rate (%)', data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 36 }]
            },
            options: {
                responsive: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end', align: 'end',
                        formatter: v => v + '%',
                        font: { weight: 600, size: 11 },
                        color: '#1e293b'
                    }
                },
                scales: {
                    x: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
                    y: { grid: { display: false } }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
    
    // 2. Distribution chart (Lanjut vs Keluar per class - stacked bar)
    destroyChart('classDistributionChart');
    const canvas2 = document.getElementById('classDistributionChart');
    if (canvas2 && tableData.length > 0) {
        const sorted = [...tableData].sort((a, b) => a.kelas.localeCompare(b.kelas));
        state.charts['classDistributionChart'] = new Chart(canvas2, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d.kelas),
                datasets: [
                    {
                        label: 'Lanjut',
                        data: sorted.map(d => d.lanjut),
                        backgroundColor: 'rgba(2, 197, 190, 0.7)',
                        borderRadius: 4
                    },
                    {
                        label: 'Keluar',
                        data: sorted.map(d => d.keluar),
                        backgroundColor: 'rgba(255, 152, 0, 0.7)',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    datalabels: { display: false }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true }
                }
            }
        });
    }
}

function renderSchoolYearlyTrend(allRecords) {
    destroyChart('schoolYearlyTrendChart');
    const canvas = document.getElementById('schoolYearlyTrendChart');
    if (!canvas) return;
    
    // Get ALL records for this school (not just filtered by period) to show full trend
    const schoolRecords = state.records.filter(r => 
        r.jenjang === state.selectedJenjang && r.organization_code === state.selectedOrg
    );
    const yearlyData = getYearlyStats(schoolRecords);
    
    if (yearlyData.length < 2) {
        canvas.parentElement.style.display = 'none';
        return;
    }
    canvas.parentElement.style.display = '';
    
    state.charts['schoolYearlyTrendChart'] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: yearlyData.map(y => y.period),
            datasets: [
                {
                    label: 'Retention Rate (%)',
                    data: yearlyData.map(y => y.retention.toFixed(1)),
                    borderColor: 'rgba(2, 197, 190, 1)',
                    backgroundColor: 'rgba(2, 197, 190, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 6,
                    pointBackgroundColor: 'rgba(2, 197, 190, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    borderWidth: 3,
                    yAxisID: 'y'
                },
                {
                    label: 'Siswa Lanjut',
                    data: yearlyData.map(y => y.lanjut),
                    borderColor: 'rgba(2, 197, 190, 0.5)',
                    backgroundColor: 'rgba(2, 197, 190, 0.3)',
                    type: 'bar',
                    borderRadius: 4,
                    yAxisID: 'y1'
                },
                {
                    label: 'Siswa Keluar',
                    data: yearlyData.map(y => y.keluar),
                    borderColor: 'rgba(255, 152, 0, 0.5)',
                    backgroundColor: 'rgba(255, 152, 0, 0.3)',
                    type: 'bar',
                    borderRadius: 4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                datalabels: { display: false }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    min: 0, max: 100,
                    ticks: { callback: v => v + '%' },
                    title: { display: true, text: 'Retention Rate' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Jumlah Siswa' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateDashboard() {
    const filtered = getFilteredRecords();
    updateKPIs(filtered);
    renderCharts(filtered);
    
    // Detail Sekolah drill-down rendering based on current level
    navigateDetail(state.detailLevel, state.selectedJenjang, state.selectedOrg);
}

function updateStatusSummary(tableData) {
    // Compute dynamic thresholds from current filtered data
    state.thresholds = computeThresholds(tableData);
    const { tinggi: tHigh, rendah: tLow, mean, sd } = state.thresholds;

    let cntTinggi = 0, cntSedang = 0, cntRendah = 0;
    tableData.forEach(row => {
        const status = getStatusLabel(row.retention);
        if (status === 'tinggi') cntTinggi++;
        else if (status === 'sedang') cntSedang++;
        else cntRendah++;
    });

    const elTinggi = document.getElementById('summaryTinggi');
    const elSedang = document.getElementById('summarySedang');
    const elRendah = document.getElementById('summaryRendah');
    const elTotal = document.getElementById('summaryTotal');

    if (!elTinggi) return;

    animateCount(elTinggi, cntTinggi);
    animateCount(elSedang, cntSedang);
    animateCount(elRendah, cntRendah);
    if (elTotal) animateCount(elTotal, tableData.length);

    // Update dynamic threshold labels in cards
    const elThTinggi = document.getElementById('thresholdTinggi');
    const elThSedang = document.getElementById('thresholdSedang');
    const elThRendah = document.getElementById('thresholdRendah');
    const elThInfo   = document.getElementById('thresholdInfo');

    if (elThTinggi) elThTinggi.textContent = '\u2265 ' + tHigh.toFixed(1) + '%';
    if (elThSedang) elThSedang.textContent = tLow.toFixed(1) + '\u2013' + tHigh.toFixed(1) + '%';
    if (elThRendah) elThRendah.textContent = '< ' + tLow.toFixed(1) + '%';
    if (elThInfo)   elThInfo.textContent = 'Mean ' + mean.toFixed(1) + '% \u00b1 0.5 SD (' + sd.toFixed(1) + '%)';
}

function animateCount(el, end) {
    let start = 0;
    const duration = 600;
    const startTime = performance.now();
    const step = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        el.textContent = Math.round(progress * end);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
    
    // For trend charts over time, filter by jenjang and organization only so non-selected periods don't drop to 0
    const trendRecords = state.records.filter(r => {
        const mJenjang = state.filters.jenjang === 'all' || r.jenjang === state.filters.jenjang;
        const mOrg = state.filters.organization === 'all' || r.organization_code === state.filters.organization;
        return mJenjang && mOrg;
    });

    const aggPeriod = aggregateByPeriod(trendRecords);
    let labels = state.metadata.periods;
    if (state.filters.period !== 'all') {
        const idx = state.metadata.periods.indexOf(state.filters.period);
        if (idx > 0) {
            labels = [state.metadata.periods[idx - 1], state.metadata.periods[idx]];
        } else if (idx === 0) {
            labels = ['2020/2021', state.metadata.periods[0]];
        }
    }
    const dataLanjut = labels.map(p => aggPeriod[p] ? aggPeriod[p].lanjut : 0);
    const dataKeluar = labels.map(p => aggPeriod[p] ? aggPeriod[p].keluar : 0);

    // 1. Overview Trend (Line)
    destroyChart('overviewTrendChart');
    state.charts['overviewTrendChart'] = new Chart(document.getElementById('overviewTrendChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Lanjut', data: dataLanjut, borderColor: '#02C5BE', backgroundColor: 'rgba(2, 197, 190, 0.15)', fill: true, tension: 0.4 },
                { label: 'Keluar', data: dataKeluar, borderColor: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.15)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // 2. Overview Donut (use filtered so Donut reflects current period selection)
    destroyChart('overviewDonutChart');
    let totL = 0, totK = 0;
    filtered.forEach(r => {
        if (r.type === 'lanjut') totL += r.jumlah_siswa;
        else if (r.type === 'keluar') totK += r.jumlah_siswa;
    });
    state.charts['overviewDonutChart'] = new Chart(document.getElementById('overviewDonutChart'), {
        type: 'doughnut',
        plugins: [ChartDataLabels],
        data: {
            labels: ['Lanjut', 'Keluar'],
            datasets: [{ data: [totL, totK], backgroundColor: ['#02C5BE', '#ff9800'], borderWidth: 0, cutout: '75%', hoverOffset: 10 }]
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
                { label: 'Lanjut', data: dataLanjut, borderColor: '#02C5BE', backgroundColor: 'rgba(2, 197, 190, 0.15)', fill: true, tension: 0.4 },
                { label: 'Keluar', data: dataKeluar, borderColor: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.15)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // 4 & 5. Jenjang charts (use trendRecords)
    const aggJenjang = aggregateByJenjang(trendRecords, labels);
    
    destroyChart('keluarJenjangChart');
    state.charts['keluarJenjangChart'] = new Chart(document.getElementById('keluarJenjangChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'TK', data: labels.map(p => aggJenjang[p].keluar.TK), backgroundColor: '#ffcc80' },
                { label: 'SD', data: labels.map(p => aggJenjang[p].keluar.SD), backgroundColor: '#ff9800' },
                { label: 'SMP', data: labels.map(p => aggJenjang[p].keluar.SMP), backgroundColor: '#e65100' }
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
                { label: 'TK', data: labels.map(p => aggJenjang[p].lanjut.TK), backgroundColor: '#80cbc4' },
                { label: 'SD', data: labels.map(p => aggJenjang[p].lanjut.SD), backgroundColor: '#02C5BE' },
                { label: 'SMP', data: labels.map(p => aggJenjang[p].lanjut.SMP), backgroundColor: '#00695c' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: false }, y: { stacked: false } } }
    });

    // Survey Charts (Data Survei Aktual PSB)
    if(state.survey) {
        let sKey = state.filters.jenjang === 'all' ? 'ALL' : state.filters.jenjang;
        
        // Helper untuk merapikan dan menyingkat label Y agar tidak kepotong (dipecah jadi 2 baris bila perlu)
        function formatChartLabel(text) {
            if (!text) return '';
            let cleaned = String(text)
                .replace(/Media sosial \([^)]+\)/i, 'Media Sosial (IG, FB, YT, dll)')
                .replace(/Mencari informasi sendiri \([^)]+\)/i, 'Mencari Info Sendiri (Telp/WA)')
                .replace(/Informasi media cetak \([^)]+\)/i, 'Media Cetak (Koran/Majalah)')
                .replace(/Informasi di media elektronik \([^)]+\)/i, 'Media Elektronik (Radio/TV)')
                .replace(/^Sekolah berkelanjutan dari KB\/TK-Perguruan Tinggi Petra/i, 'Berkelanjutan KB/TK - PT Petra')
                .replace(/^Sekolah memiliki sistem pembelajaran yang terus berinovasi/i, 'Sistem Pembelajaran Inovatif')
                .replace(/^Sekolah memiliki pembinaan kerohanian kristiani yang baik/i, 'Pembinaan Kerohanian Kristiani')
                .replace(/^Sekolah memiliki pendidikan character building/i, 'Pendidikan Character Building')
                .replace(/^Lingkungan dan pergaulan yang kondusif/i, 'Lingkungan & Pergaulan Kondusif')
                .replace(/^Sekolah memiliki /i, '')
                .replace(/^Adanya /i, '')
                .replace(/^Sekolah dengan /i, '')
                .replace(/^Pelayanan sekolah dalam melayani /i, 'Pelayanan ')
                .replace(/^Tutorial proses pendaftaran melalui /i, 'Tutorial Pendaftaran ')
                .replace(/\(boleh lebih dari satu jawaban\)/i, '')
                .trim();

            if (cleaned.length > 30) {
                const words = cleaned.split(' ');
                if (words.length >= 3) {
                    const mid = Math.ceil(words.length / 2);
                    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
                }
                return cleaned.slice(0, 28) + '...';
            }
            return cleaned;
        }

        // Mendukung format JSON baru (array) ataupun format lama ber-key jenjang
        let aK_raw = Array.isArray(state.survey.alasan_keluar) ? state.survey.alasan_keluar : (state.survey.alasan_keluar[sKey] || state.survey.alasan_keluar['ALL'] || []);
        let aL_raw = Array.isArray(state.survey.alasan_mendaftar) ? state.survey.alasan_mendaftar : (state.survey.alasan_lanjut ? (Array.isArray(state.survey.alasan_lanjut) ? state.survey.alasan_lanjut : (state.survey.alasan_lanjut[sKey] || state.survey.alasan_lanjut['ALL'] || [])) : []);
        
        // Filter agar sentimen positif ('Tidak ada, semua sudah baik') tidak masuk ke Top Area Perbaikan (merah)
        const aK = aK_raw.filter(d => {
            const lbl = (d.label || d.alasan || '').toLowerCase();
            return !lbl.includes('tidak ada') && !lbl.includes('semua sudah baik') && !lbl.includes('sudah bagus');
        }).slice(0, 8);
        
        const aL = aL_raw.slice(0, 8);

        destroyChart('alasanKeluarChart');
        const elKeluar = document.getElementById('alasanKeluarChart');
        if (elKeluar && aK.length > 0) {
            state.charts['alasanKeluarChart'] = new Chart(elKeluar, {
                type: 'bar',
                data: {
                    labels: aK.map(d => formatChartLabel(d.label || d.alasan)),
                    datasets: [{
                        label: 'Jumlah Responden',
                        data: aK.map(d => d.count || d.jumlah),
                        backgroundColor: '#e53935', // Merah untuk area perbaikan / alasan keluar
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const item = aK[ctx.dataIndex];
                                    const pct = item.percentage ? ` (${item.percentage}%)` : '';
                                    return `Jumlah: ${ctx.raw} Responden${pct}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: {
                            grid: { display: false },
                            ticks: {
                                autoSkip: false,
                                font: { size: 11, family: "'Inter', sans-serif" },
                                color: '#475569'
                            }
                        }
                    },
                    layout: {
                        padding: { left: 4, right: 16 }
                    }
                }
            });
        }

        destroyChart('alasanLanjutChart');
        const elLanjut = document.getElementById('alasanLanjutChart');
        if (elLanjut && aL.length > 0) {
            state.charts['alasanLanjutChart'] = new Chart(elLanjut, {
                type: 'bar',
                data: {
                    labels: aL.map(d => formatChartLabel(d.label || d.alasan)),
                    datasets: [{
                        label: 'Jumlah Responden',
                        data: aL.map(d => d.count || d.jumlah),
                        backgroundColor: '#10b981', // Hijau untuk sentimen positif / alasan lanjut
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const item = aL[ctx.dataIndex];
                                    const pct = item.percentage ? ` (${item.percentage}%)` : '';
                                    return `Jumlah: ${ctx.raw} Responden${pct}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: {
                            grid: { display: false },
                            ticks: {
                                autoSkip: false,
                                font: { size: 11, family: "'Inter', sans-serif" },
                                color: '#475569'
                            }
                        }
                    },
                    layout: {
                        padding: { left: 4, right: 16 }
                    }
                }
            });
        }

        // Sumber Informasi Chart
        const sInfo_raw = Array.isArray(state.survey.sumber_info) ? state.survey.sumber_info : [];
        const sInfo = sInfo_raw.slice(0, 8);
        destroyChart('sumberInfoChart');
        const elSumber = document.getElementById('sumberInfoChart');
        if (elSumber && sInfo.length > 0) {
            state.charts['sumberInfoChart'] = new Chart(elSumber, {
                type: 'bar',
                data: {
                    labels: sInfo.map(d => formatChartLabel(d.label)),
                    datasets: [{
                        label: 'Jumlah Responden',
                        data: sInfo.map(d => d.count),
                        backgroundColor: '#0288d1',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const item = sInfo[ctx.dataIndex];
                                    const pct = item.percentage ? ` (${item.percentage}%)` : '';
                                    return `Jumlah: ${ctx.raw} Responden${pct}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: {
                            grid: { display: false },
                            ticks: {
                                autoSkip: false,
                                font: { size: 11, family: "'Inter', sans-serif" },
                                color: '#475569'
                            }
                        }
                    },
                    layout: {
                        padding: { left: 4, right: 16 }
                    }
                }
            });
        }

        // Kepuasan Layanan (Likert) Chart
        const likert_raw = Array.isArray(state.survey.kepuasan_layanan) ? state.survey.kepuasan_layanan : [];
        destroyChart('kepuasanLayananChart');
        const elKepuasan = document.getElementById('kepuasanLayananChart');
        if (elKepuasan && likert_raw.length > 0) {
            const shortQuestions = likert_raw.map(item => {
                let q = item.question;
                if (q.includes('Kemudahan memperoleh informasi')) return 'Informasi PSB';
                if (q.includes('Kemudahan akses melalui Whatsapp')) return 'Akses WA (Login)';
                if (q.includes('Kemudahan menggunakan aplikasi')) return 'Aplikasi PSB Online';
                if (q.includes('Informasi dalam aplikasi')) return 'Konten Aplikasi';
                if (q.includes('PSB online memudahkan')) return 'Proses Pendaftaran';
                if (q.includes('Sekolah melayani dengan baik')) return 'Pelayanan Kendala';
                return q.slice(0, 25) + '...';
            });

            const likertLabels = ['5 (Sangat Baik/Mudah)', '4 (Baik/Mudah)', '3 (Cukup)', '2 (Kurang)', '1 (Sangat Kurang)', 'Tidak Diisi'];
            const likertKeys = ['5', '4', '3', '2', '1', 'tidak diisi'];
            const colors = ['#10b981', '#34d399', '#fbbf24', '#f87171', '#ef4444', '#94a3b8'];

            const datasets = likertLabels.map((lbl, idx) => {
                const targetKey = likertKeys[idx];
                return {
                    label: lbl,
                    data: likert_raw.map(qItem => {
                        const found = (qItem.distribution || []).find(d => {
                            const dStr = String(d.label || '').trim().toLowerCase();
                            return dStr.startsWith(targetKey);
                        });
                        return found ? found.count : 0;
                    }),
                    backgroundColor: colors[idx] || '#cbd5e1'
                };
            });

            state.charts['kepuasanLayananChart'] = new Chart(elKepuasan, {
                type: 'bar',
                data: {
                    labels: shortQuestions,
                    datasets: datasets
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 12,
                                font: { size: 11, family: "'Inter', sans-serif" },
                                padding: 12
                            }
                        },
                        tooltip: {
                            mode: 'nearest',
                            intersect: true,
                            filter: function(item) {
                                return item.raw > 0;
                            },
                            callbacks: {
                                label: function(ctx) {
                                    const val = ctx.raw || 0;
                                    const total = ctx.chart.data.datasets.reduce((sum, ds) => sum + (ds.data[ctx.dataIndex] || 0), 0);
                                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                                    return `${ctx.dataset.label}: ${val.toLocaleString('id-ID')} Responden (${pct}%)`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: {
                            stacked: true,
                            grid: { display: false },
                            ticks: {
                                font: { size: 11, family: "'Inter', sans-serif" },
                                color: '#475569'
                            }
                        }
                    }
                }
            });
        }
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
            row.kelas.toLowerCase().includes(state.tableSearch)
        );
    }
    
    const maxPage = Math.ceil(filtered.length / state.tableRowsPerPage) || 1;
    if (state.tablePage > maxPage) state.tablePage = maxPage;
    
    const start = (state.tablePage - 1) * state.tableRowsPerPage;
    const paginated = filtered.slice(start, start + state.tableRowsPerPage);
    
    paginated.forEach(row => {
        const statusKey = getStatusLabel(row.retention);
        const badgeClass = statusKey === 'tinggi' ? 'badge-tinggi' : statusKey === 'sedang' ? 'badge-sedang' : 'badge-rendah';
        const badgeLabel = statusKey === 'tinggi' ? 'Tinggi' : statusKey === 'sedang' ? 'Sedang' : 'Rendah';
        const badge = `<span class="${badgeClass}">${badgeLabel}</span>`;
        
        html += `
            <tr>
                <td style="font-weight: 600; padding-left: 48px;">${row.kelas}</td>
                <td>${row.lanjut}</td>
                <td>${row.keluar}</td>
                <td style="font-weight: 600">${row.retention.toFixed(1)}%</td>
                <td>${badge}</td>
            </tr>
        `;
    });
    
    if (paginated.length === 0) {
        html = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted)">Tidak ada data ditemukan</td></tr>`;
    }
    
    els.table.body.innerHTML = html;
    
    els.table.info.textContent = `Menampilkan ${filtered.length > 0 ? start + 1 : 0} - ${Math.min(start + state.tableRowsPerPage, filtered.length)} dari ${filtered.length} data`;
    els.table.pageIndicator.textContent = `Halaman ${state.tablePage} dari ${maxPage}`;

    document.querySelectorAll('#drilldownHeader th[data-sort]').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (icon) {
            if (th.dataset.sort === state.tableSort.col) {
                icon.textContent = state.tableSort.asc ? 'arrow_upward' : 'arrow_downward';
                icon.style.opacity = '1';
                icon.style.color = 'var(--green-primary)';
            } else {
                icon.textContent = 'unfold_more';
                icon.style.opacity = '';
                icon.style.color = '';
            }
        }
    });
}

function exportToCSV() {
    if (state.tableData.length === 0) return;
    
    const orgName = getOrgName(state.selectedOrg);
    const headers = ['Kelas', 'Jumlah Lanjut', 'Jumlah Keluar', 'Retention Rate'];
    const rows = state.tableData.map(r => 
        [r.kelas, r.lanjut, r.keluar, r.retention.toFixed(1) + '%'].join(',')
    );
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `detail_${state.selectedOrg || 'all'}_${orgName}.csv`;
    link.click();
}

function exportSurveyToExcel() {
    if (!state.survey) {
        showToast('Data survei belum dimuat', 'error');
        return;
    }
    try {
        if (typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();

            // Sheet 1: Alasan Mendaftar (Sentimen Positif)
            const aL = (Array.isArray(state.survey.alasan_mendaftar) ? state.survey.alasan_mendaftar : []).map((d, i) => ({
                'No': i + 1,
                'Alasan Mendaftar': d.label || d.alasan,
                'Jumlah Responden': d.count || d.jumlah || 0,
                'Persentase (%)': d.percentage || 0
            }));
            const ws1 = XLSX.utils.json_to_sheet(aL);
            XLSX.utils.book_append_sheet(wb, ws1, 'Alasan Mendaftar');

            // Sheet 2: Area Perbaikan (Alasan Keluar)
            const aK = (Array.isArray(state.survey.alasan_keluar) ? state.survey.alasan_keluar : [])
                .filter(d => !String(d.label || '').toLowerCase().includes('tidak ada') && !String(d.label || '').toLowerCase().includes('semua sudah baik'))
                .map((d, i) => ({
                    'No': i + 1,
                    'Area Perbaikan / Alasan Keluar': d.label || d.alasan,
                    'Jumlah Responden': d.count || d.jumlah || 0,
                    'Persentase (%)': d.percentage || 0
                }));
            const ws2 = XLSX.utils.json_to_sheet(aK);
            XLSX.utils.book_append_sheet(wb, ws2, 'Area Perbaikan');

            // Sheet 3: Sumber Informasi PSB
            const sInfo = (Array.isArray(state.survey.sumber_info) ? state.survey.sumber_info : []).map((d, i) => ({
                'No': i + 1,
                'Sumber Informasi PSB': d.label,
                'Jumlah Responden': d.count || 0,
                'Persentase (%)': d.percentage || 0
            }));
            const ws3 = XLSX.utils.json_to_sheet(sInfo);
            XLSX.utils.book_append_sheet(wb, ws3, 'Sumber Informasi');

            // Sheet 4: Kepuasan Layanan (Likert)
            const likertLabels = ['5 (Sangat Baik/Mudah)', '4 (Baik/Mudah)', '3 (Cukup)', '2 (Kurang)', '1 (Sangat Kurang)', 'Tidak Diisi'];
            const likertKeys = ['5', '4', '3', '2', '1', 'tidak diisi'];
            const likertRows = (Array.isArray(state.survey.kepuasan_layanan) ? state.survey.kepuasan_layanan : []).map((qItem, idx) => {
                let row = { 'No': idx + 1, 'Aspek Layanan PSB': qItem.question };
                likertLabels.forEach((lbl, i) => {
                    const found = (qItem.distribution || []).find(d => String(d.label || '').trim().toLowerCase().startsWith(likertKeys[i]));
                    row[lbl] = found ? found.count : 0;
                });
                return row;
            });
            const ws4 = XLSX.utils.json_to_sheet(likertRows);
            XLSX.utils.book_append_sheet(wb, ws4, 'Kepuasan Layanan');

            XLSX.writeFile(wb, 'Laporan_Survei_PSB_Petra.xlsx');
            showToast('File Excel berhasil diunduh (.xlsx)', 'success');
        } else {
            exportSurveyToCSV();
        }
    } catch (e) {
        console.error('Gagal export Excel:', e);
        exportSurveyToCSV();
    }
}

function exportSurveyToCSV() {
    if (!state.survey) {
        showToast('Data survei belum dimuat', 'error');
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM untuk format Excel Indonesia/UTF-8
    
    // Section 1: Alasan Mendaftar
    csvContent += "=== 1. TOP ALASAN MENDAFTAR (SENTIMEN POSITIF) ===\n";
    csvContent += "No,Alasan Mendaftar,Jumlah Responden,Persentase (%)\n";
    const aL = Array.isArray(state.survey.alasan_mendaftar) ? state.survey.alasan_mendaftar : [];
    aL.forEach((d, i) => {
        const label = `"${String(d.label || d.alasan || '').replace(/"/g, '""')}"`;
        csvContent += `${i + 1},${label},${d.count || 0},${d.percentage || 0}%\n`;
    });
    csvContent += "\n";

    // Section 2: Area Perbaikan
    csvContent += "=== 2. TOP AREA PERBAIKAN / ALASAN KELUAR ===\n";
    csvContent += "No,Area Perbaikan / Alasan Keluar,Jumlah Responden,Persentase (%)\n";
    const aK = (Array.isArray(state.survey.alasan_keluar) ? state.survey.alasan_keluar : [])
        .filter(d => !String(d.label || '').toLowerCase().includes('tidak ada') && !String(d.label || '').toLowerCase().includes('semua sudah baik'));
    aK.forEach((d, i) => {
        const label = `"${String(d.label || d.alasan || '').replace(/"/g, '""')}"`;
        csvContent += `${i + 1},${label},${d.count || 0},${d.percentage || 0}%\n`;
    });
    csvContent += "\n";

    // Section 3: Sumber Informasi
    csvContent += "=== 3. SUMBER INFORMASI PSB ===\n";
    csvContent += "No,Sumber Informasi PSB,Jumlah Responden,Persentase (%)\n";
    const sInfo = Array.isArray(state.survey.sumber_info) ? state.survey.sumber_info : [];
    sInfo.forEach((d, i) => {
        const label = `"${String(d.label || '').replace(/"/g, '""')}"`;
        csvContent += `${i + 1},${label},${d.count || 0},${d.percentage || 0}%\n`;
    });
    csvContent += "\n";

    // Section 4: Kepuasan Layanan
    csvContent += "=== 4. TINGKAT KEPUASAN LAYANAN (LIKERT 1-5) ===\n";
    csvContent += "No,Aspek Layanan PSB,5 (Sangat Baik/Mudah),4 (Baik/Mudah),3 (Cukup),2 (Kurang),1 (Sangat Kurang),Tidak Diisi\n";
    const likertLabels = ['5 (Sangat Baik/Mudah)', '4 (Baik/Mudah)', '3 (Cukup)', '2 (Kurang)', '1 (Sangat Kurang)', 'Tidak Diisi'];
    const likertKeys = ['5', '4', '3', '2', '1', 'tidak diisi'];
    const likertRows = Array.isArray(state.survey.kepuasan_layanan) ? state.survey.kepuasan_layanan : [];
    likertRows.forEach((qItem, idx) => {
        const qLabel = `"${String(qItem.question || '').replace(/"/g, '""')}"`;
        const vals = likertKeys.map(key => {
            const found = (qItem.distribution || []).find(d => String(d.label || '').trim().toLowerCase().startsWith(key));
            return found ? found.count : 0;
        });
        csvContent += `${idx + 1},${qLabel},${vals.join(',')}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Laporan_Survei_PSB_Petra.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV berhasil diunduh', 'success');
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
