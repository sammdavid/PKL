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
    "M01": "SMK Kristen Petra",
    "A01": "SMA Kristen Petra 1",
    "A02": "SMA Kristen Petra 2",
    "A03": "SMA Kristen Petra 3",
    "A04": "SMA Kristen Petra 4",
    "A05": "SMA Kristen Petra 5",
    "A06": "SMA Kristen Petra Acitya",
    "SMK": "SMK Kristen Petra"
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
    // Load text mining data for survey section
    // generateConclusion will be called after text mining data is available
    loadAndRenderTextMining();
    // Generate initial conclusion from transition + survey data (text mining will update it later)
    generateConclusion();
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
            const targetId = item.dataset.target;
            
            // Reset detail drill-down when navigating to Detail Sekolah
            if (targetId === 'section-details') {
                state.detailLevel = 0;
                state.selectedJenjang = null;
                state.selectedOrg = null;
                navigateDetail(0);
            }
            
            switchDashboardSection(targetId);
            
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

    setupSaranCustomDropdown('saranFilterGroupTopic', 'topic', 'Semua Topik', () => {
        saranExplorerState.currentPage = 1;
        renderSaranExplorerTable();
    });
    setupSaranCustomDropdown('saranFilterGroupJenjang', 'jenjang', 'Semua Jenjang', () => {
        saranExplorerState.currentPage = 1;
        renderSaranExplorerTable();
    });
    setupSaranCustomDropdown('saranFilterGroupOrg', 'sekolah', 'Semua Sekolah', () => {
        saranExplorerState.currentPage = 1;
        renderSaranExplorerTable();
    });
    setupSaranCustomDropdown('saranFilterGroupPageSize', 'pageSize', '15 per halaman', (val) => {
        changeSaranPageSize(val);
    });

    window.addEventListener('resize', () => {
        if (document.getElementById('section-survey')?.classList.contains('active') && state.textMining?.wordFreq) {
            renderWordCloud(state.textMining.wordFreq);
        }
    });

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
    const filtered = getFilteredRecords(true);
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
    
    // Generate insights for Detail Level 1
    generateDetailLevel1Insights(orgStats, orgThresholds, state.selectedJenjang);
    generateJenjangYearlyTrendInsight(filtered, state.selectedJenjang);
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
    
    // Generate insights for Detail Level 2
    generateDetailLevel2Insights(state.tableData);
    generateSchoolYearlyTrendInsight();
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
    
    // Generate dynamic chart insights
    generateOverviewInsights(filtered);
    generateTrenInsights(filtered);
    generateSurveyInsights();
    
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

function getFilteredRecords(ignoreLocationFilters = false) {
    return state.records.filter(r => {
        const mPeriod = state.filters.period === 'all' || r.period_code === state.filters.period;
        
        if (ignoreLocationFilters) {
            return mPeriod;
        }
        
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
                        backgroundColor: '#ff9800', // Amber/Orange to match Overview Keluar
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
                        backgroundColor: '#02C5BE', // Petra Primary Bright Teal
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
                        backgroundColor: '#0d9488', // Petra Teal 600
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
            const colors = ['#00897B', '#02C5BE', '#2dd4bf', '#f59e0b', '#ef4444', '#94a3b8']; // Harmonious Likert scale with Petra Teal

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

// ============================================================
// DYNAMIC CHART INSIGHTS (Rule-Based Interpretation)
// ============================================================

function setInsight(id, html) {
    const el = document.getElementById(id);
    if (!el) return;
    // Re-trigger fade animation
    el.style.animation = 'none';
    el.offsetHeight; // force reflow
    el.style.animation = '';
    el.innerHTML = html;
}

function fmt(n) { return Number(n).toLocaleString('id-ID'); }
function pct(n) { return Number(n).toFixed(1); }

// --- Overview Insights ---
function generateOverviewInsights(filtered) {
    // 1. Overview Trend
    const trendRecords = state.records.filter(r => {
        const mJ = state.filters.jenjang === 'all' || r.jenjang === state.filters.jenjang;
        const mO = state.filters.organization === 'all' || r.organization_code === state.filters.organization;
        return mJ && mO;
    });
    const aggP = aggregateByPeriod(trendRecords);
    const periods = state.metadata ? state.metadata.periods : [];

    if (periods.length >= 2) {
        const last = periods[periods.length - 1];
        const prev = periods[periods.length - 2];
        const dL = aggP[last] ? aggP[last].lanjut : 0;
        const dK = aggP[last] ? aggP[last].keluar : 0;
        const pL = aggP[prev] ? aggP[prev].lanjut : 0;
        const pK = aggP[prev] ? aggP[prev].keluar : 0;

        const deltaL = pL > 0 ? ((dL - pL) / pL * 100) : 0;
        const deltaK = pK > 0 ? ((dK - pK) / pK * 100) : 0;
        const trendL = deltaL > 1 ? 'naik' : deltaL < -1 ? 'turun' : 'relatif stabil';
        const trendK = deltaK > 1 ? 'naik' : deltaK < -1 ? 'turun' : 'relatif stabil';

        let trendInsight = `Pada periode <strong>${last}</strong>, jumlah siswa lanjut tercatat <strong>${fmt(dL)}</strong> siswa — `;
        trendInsight += trendL === 'relatif stabil'
            ? `<span class="insight-neutral">${trendL}</span> dibanding periode sebelumnya.`
            : `<span class="${trendL === 'naik' ? 'insight-highlight' : 'insight-warn'}">${trendL} ${pct(Math.abs(deltaL))}%</span> dari periode ${prev} (${fmt(pL)}).`;
        trendInsight += ` Siswa keluar ${trendK === 'relatif stabil' ? trendK : trendK + ' ' + pct(Math.abs(deltaK)) + '%'} (${fmt(dK)} siswa).`;
        setInsight('insightOverviewTrend', trendInsight);
    } else {
        setInsight('insightOverviewTrend', '');
    }

    // 2. Overview Donut
    let totL = 0, totK = 0;
    filtered.forEach(r => {
        if (r.type === 'lanjut') totL += r.jumlah_siswa;
        else if (r.type === 'keluar') totK += r.jumlah_siswa;
    });
    const totAll = totL + totK;
    if (totAll > 0) {
        const rate = (totL / totAll * 100);
        const rateClass = rate >= 90 ? 'insight-highlight' : rate >= 80 ? 'insight-neutral' : 'insight-warn';
        const rateLabel = rate >= 90 ? 'sangat baik' : rate >= 80 ? 'cukup baik' : 'perlu perhatian';
        setInsight('insightOverviewDonut',
            `Dari total <strong>${fmt(totAll)}</strong> siswa, <span class="${rateClass}">${pct(rate)}%</span> (<strong>${fmt(totL)}</strong>) melanjutkan dan <strong>${fmt(totK)}</strong> keluar. Retention rate secara keseluruhan tergolong <span class="${rateClass}">${rateLabel}</span>.`
        );
    } else {
        setInsight('insightOverviewDonut', '');
    }
}

// --- Tren Insights ---
function generateTrenInsights(filtered) {
    const trendRecords = state.records.filter(r => {
        const mJ = state.filters.jenjang === 'all' || r.jenjang === state.filters.jenjang;
        const mO = state.filters.organization === 'all' || r.organization_code === state.filters.organization;
        return mJ && mO;
    });
    const periods = state.metadata ? state.metadata.periods : [];
    const aggP = aggregateByPeriod(trendRecords);

    // 1. Trend Line Chart
    if (periods.length >= 2) {
        const last = periods[periods.length - 1];
        const first = periods[0];
        const firstL = aggP[first] ? aggP[first].lanjut : 0;
        const lastL = aggP[last] ? aggP[last].lanjut : 0;
        const firstK = aggP[first] ? aggP[first].keluar : 0;
        const lastK = aggP[last] ? aggP[last].keluar : 0;
        const longDeltaL = firstL > 0 ? ((lastL - firstL) / firstL * 100) : 0;
        const longDeltaK = firstK > 0 ? ((lastK - firstK) / firstK * 100) : 0;

        let txt = `Selama ${periods.length} periode (${first} s/d ${last}), siswa lanjut `;
        txt += longDeltaL > 1 ? `<span class="insight-highlight">meningkat ${pct(longDeltaL)}%</span>` : longDeltaL < -1 ? `<span class="insight-warn">menurun ${pct(Math.abs(longDeltaL))}%</span>` : `<span class="insight-neutral">relatif stabil</span>`;
        txt += ` (${fmt(firstL)} → ${fmt(lastL)}). Siswa keluar `;
        txt += longDeltaK > 1 ? `<span class="insight-warn">meningkat ${pct(longDeltaK)}%</span>` : longDeltaK < -1 ? `<span class="insight-highlight">menurun ${pct(Math.abs(longDeltaK))}%</span>` : `<span class="insight-neutral">relatif stabil</span>`;
        txt += ` (${fmt(firstK)} → ${fmt(lastK)}).`;
        setInsight('insightTrendLine', txt);
    } else {
        setInsight('insightTrendLine', '');
    }

    // 2 & 3. Jenjang Charts
    if (periods.length >= 1) {
        const aggJ = aggregateByJenjang(trendRecords, periods);
        const lastP = periods[periods.length - 1];
        const jData = aggJ[lastP];
        if (jData) {
            // Keluar per Jenjang
            const jenjangList = ['TK', 'SD', 'SMP'];
            const keluarArr = jenjangList.map(j => ({ j, v: jData.keluar[j] || 0 })).sort((a, b) => b.v - a.v);
            const totalKeluar = keluarArr.reduce((s, x) => s + x.v, 0);
            if (totalKeluar > 0) {
                const top = keluarArr[0];
                const topPct = (top.v / totalKeluar * 100);
                setInsight('insightKeluarJenjang',
                    `Pada periode terakhir (<strong>${lastP}</strong>), jenjang <span class="insight-warn">${top.j}</span> menyumbang jumlah siswa keluar terbanyak (<strong>${fmt(top.v)}</strong> siswa, ${pct(topPct)}% dari total). ${keluarArr.length > 1 ? `Diikuti ${keluarArr[1].j} (${fmt(keluarArr[1].v)}) dan ${keluarArr[2].j} (${fmt(keluarArr[2].v)}).` : ''}`
                );
            } else {
                setInsight('insightKeluarJenjang', '');
            }

            // Lanjut per Jenjang
            const lanjutArr = jenjangList.map(j => ({ j, v: jData.lanjut[j] || 0 })).sort((a, b) => b.v - a.v);
            const totalLanjut = lanjutArr.reduce((s, x) => s + x.v, 0);
            if (totalLanjut > 0) {
                const top = lanjutArr[0];
                const topPct = (top.v / totalLanjut * 100);
                setInsight('insightLanjutJenjang',
                    `Jenjang <span class="insight-highlight">${top.j}</span> mendominasi jumlah siswa lanjut pada periode <strong>${lastP}</strong> dengan <strong>${fmt(top.v)}</strong> siswa (${pct(topPct)}% dari total ${fmt(totalLanjut)}).`
                );
            } else {
                setInsight('insightLanjutJenjang', '');
            }
        }
    }
}

// --- Survey Insights ---
function generateSurveyInsights() {
    if (!state.survey) return;

    // Alasan Keluar
    const aK_raw = Array.isArray(state.survey.alasan_keluar) ? state.survey.alasan_keluar : [];
    const aK = aK_raw.filter(d => {
        const lbl = (d.label || d.alasan || '').toLowerCase();
        return !lbl.includes('tidak ada') && !lbl.includes('semua sudah baik') && !lbl.includes('sudah bagus');
    }).slice(0, 8);
    if (aK.length > 0) {
        const top = aK[0];
        const topLabel = top.label || top.alasan;
        const topCount = top.count || top.jumlah;
        const topPct = top.percentage ? ` (${top.percentage}%)` : '';
        let txt = `Area perbaikan utama yang paling banyak disoroti responden adalah "<span class="insight-warn">${topLabel}</span>" dengan <strong>${fmt(topCount)}</strong> responden${topPct}.`;
        if (aK.length > 1) {
            const sec = aK[1];
            txt += ` Diikuti oleh "${sec.label || sec.alasan}" (${fmt(sec.count || sec.jumlah)} responden).`;
        }
        setInsight('insightAlasanKeluar', txt);
    } else {
        setInsight('insightAlasanKeluar', '');
    }

    // Alasan Mendaftar
    const aL_raw = Array.isArray(state.survey.alasan_mendaftar) ? state.survey.alasan_mendaftar : [];
    const aL = aL_raw.slice(0, 8);
    if (aL.length > 0) {
        const top = aL[0];
        const topLabel = top.label || top.alasan;
        const topCount = top.count || top.jumlah;
        const topPct = top.percentage ? ` (${top.percentage}%)` : '';
        setInsight('insightAlasanLanjut',
            `Alasan mendaftar terpopuler adalah "<span class="insight-highlight">${topLabel}</span>" dengan <strong>${fmt(topCount)}</strong> responden${topPct}. Faktor ini menjadi daya tarik utama bagi orang tua dalam memilih sekolah Petra.`
        );
    } else {
        setInsight('insightAlasanLanjut', '');
    }

    // Sumber Info
    const sInfo_raw = Array.isArray(state.survey.sumber_info) ? state.survey.sumber_info : [];
    const sInfo = sInfo_raw.slice(0, 8);
    if (sInfo.length > 0) {
        const top = sInfo[0];
        const totalResp = sInfo.reduce((s, d) => s + (d.count || 0), 0);
        const topPct = totalResp > 0 ? pct(top.count / totalResp * 100) : '0';
        let txt = `<span class="insight-highlight">${top.label}</span> menjadi kanal informasi utama PSB (<strong>${fmt(top.count)}</strong> responden, ${topPct}%).`;
        if (sInfo.length > 1) {
            txt += ` Sumber kedua terpopuler adalah "${sInfo[1].label}" (${fmt(sInfo[1].count)} responden).`;
        }
        setInsight('insightSumberInfo', txt);
    } else {
        setInsight('insightSumberInfo', '');
    }

    // Kepuasan Layanan (Likert)
    const likert = Array.isArray(state.survey.kepuasan_layanan) ? state.survey.kepuasan_layanan : [];
    if (likert.length > 0) {
        const scores = likert.map(q => {
            const dist = q.distribution || [];
            let weightedSum = 0, totalResp = 0;
            dist.forEach(d => {
                const labelStr = String(d.label || '').trim();
                const scoreVal = parseInt(labelStr);
                if (!isNaN(scoreVal) && scoreVal >= 1 && scoreVal <= 5) {
                    weightedSum += scoreVal * (d.count || 0);
                    totalResp += (d.count || 0);
                }
            });
            return { question: q.question, avg: totalResp > 0 ? weightedSum / totalResp : 0 };
        }).filter(s => s.avg > 0);

        if (scores.length > 0) {
            scores.sort((a, b) => b.avg - a.avg);
            const best = scores[0];
            const worst = scores[scores.length - 1];
            const overallAvg = scores.reduce((s, x) => s + x.avg, 0) / scores.length;

            let shortBest = best.question.length > 40 ? best.question.slice(0, 37) + '...' : best.question;
            let shortWorst = worst.question.length > 40 ? worst.question.slice(0, 37) + '...' : worst.question;

            const overallLabel = overallAvg >= 4.0 ? 'sangat baik' : overallAvg >= 3.5 ? 'baik' : overallAvg >= 3.0 ? 'cukup' : 'perlu perbaikan';
            const overallClass = overallAvg >= 4.0 ? 'insight-highlight' : overallAvg >= 3.0 ? 'insight-neutral' : 'insight-warn';

            setInsight('insightKepuasanLayanan',
                `Rata-rata kepuasan keseluruhan: <span class="${overallClass}">${pct(overallAvg)}/5 (${overallLabel})</span>. Skor tertinggi pada "<strong>${shortBest}</strong>" (${pct(best.avg)}/5), terendah pada "<span class="insight-warn">${shortWorst}</span>" (${pct(worst.avg)}/5).`
            );
        } else {
            setInsight('insightKepuasanLayanan', '');
        }
    } else {
        setInsight('insightKepuasanLayanan', '');
    }
}

// --- Text Mining Insights ---
function generateTextMiningInsights() {
    // Sentiment Donut
    if (state.textMining && state.textMining.sentiment && state.textMining.sentiment.summary) {
        const summary = state.textMining.sentiment.summary;
        const total = state.textMining.sentiment.total || summary.reduce((s, x) => s + x.count, 0);
        const positif = summary.find(s => s.label === 'Positif');
        const perbaikan = summary.find(s => s.label === 'Saran Perbaikan');

        if (total > 0 && positif && perbaikan) {
            const dominan = positif.count >= perbaikan.count ? positif : perbaikan;
            const dominanClass = dominan.label === 'Positif' ? 'insight-highlight' : 'insight-warn';
            setInsight('insightSentimentDonut',
                `Dari <strong>${fmt(total)}</strong> saran yang dianalisis, mayoritas bersifat <span class="${dominanClass}">${dominan.label}</span> (${dominan.percentage}%). Terdapat <strong>${fmt(positif.count)}</strong> komentar positif dan <strong>${fmt(perbaikan.count)}</strong> saran perbaikan yang bisa ditindaklanjuti.`
            );
        }
    }

    // Topic Bar
    if (state.textMining && state.textMining.topics && state.textMining.topics.topics) {
        const topics = state.textMining.topics.topics;
        if (topics.length > 0) {
            const top = topics[0];
            let txt = `Topik yang paling banyak dibahas adalah "<span class="insight-highlight">${top.topic}</span>" (<strong>${fmt(top.count)}</strong> saran, ${top.percentage}%).`;
            if (topics.length > 1) {
                txt += ` Diikuti "${topics[1].topic}" (${fmt(topics[1].count)}, ${topics[1].percentage}%).`;
            }
            if (topics.length > 2) {
                txt += ` Topik ini layak mendapat perhatian prioritas.`;
            }
            setInsight('insightTopicBar', txt);
        }
    }
}

// --- Detail Sekolah Insights ---
function generateDetailLevel1Insights(orgStats, thresholds, jenjang) {
    if (!orgStats || orgStats.length === 0) return;

    // School Comparison
    const sorted = [...orgStats].sort((a, b) => b.retention - a.retention);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const avgRet = orgStats.reduce((s, o) => s + o.retention, 0) / orgStats.length;

    let txt = `Dari <strong>${orgStats.length}</strong> cabang ${jenjang}, rata-rata retention rate adalah <strong>${pct(avgRet)}%</strong>. `;
    txt += `Cabang terbaik: <span class="insight-highlight">${best.name || best.code}</span> (${pct(best.retention)}%). `;
    if (sorted.length > 1 && worst.retention < thresholds.rendah) {
        txt += `Cabang <span class="insight-warn">${worst.name || worst.code}</span> (${pct(worst.retention)}%) perlu perhatian khusus.`;
    } else if (sorted.length > 1) {
        txt += `Cabang terendah: ${worst.name || worst.code} (${pct(worst.retention)}%).`;
    }
    setInsight('insightSchoolComparison', txt);
}

function generateJenjangYearlyTrendInsight(records, jenjang) {
    const jRecords = records.filter(r => r.jenjang === jenjang);
    const yearly = getYearlyStats(jRecords);
    if (yearly.length < 2) { setInsight('insightJenjangYearlyTrend', ''); return; }

    const first = yearly[0];
    const last = yearly[yearly.length - 1];
    const delta = last.retention - first.retention;
    const trendWord = delta > 1 ? 'meningkat' : delta < -1 ? 'menurun' : 'relatif stabil';
    const trendClass = delta > 1 ? 'insight-highlight' : delta < -1 ? 'insight-warn' : 'insight-neutral';

    setInsight('insightJenjangYearlyTrend',
        `Retention rate jenjang <strong>${jenjang}</strong> <span class="${trendClass}">${trendWord}</span> dari <strong>${pct(first.retention)}%</strong> (${first.period}) menjadi <strong>${pct(last.retention)}%</strong> (${last.period})${Math.abs(delta) > 1 ? ` (${delta > 0 ? '+' : ''}${pct(delta)} poin)` : ''}.`
    );
}

function generateDetailLevel2Insights(tableData) {
    if (!tableData || tableData.length === 0) {
        setInsight('insightClassRetention', '');
        setInsight('insightClassDistribution', '');
        return;
    }

    // Class Retention
    const sorted = [...tableData].sort((a, b) => b.retention - a.retention);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const avgRet = tableData.reduce((s, d) => s + d.retention, 0) / tableData.length;

    let txt = `Rata-rata retention rate: <strong>${pct(avgRet)}%</strong> dari ${tableData.length} kelas. `;
    txt += `Kelas terbaik: <span class="insight-highlight">${best.kelas}</span> (${pct(best.retention)}%)`;
    if (sorted.length > 1) {
        txt += `, terendah: <span class="insight-warn">${worst.kelas}</span> (${pct(worst.retention)}%)`;
    }
    txt += '.';
    setInsight('insightClassRetention', txt);

    // Class Distribution
    const totalL = tableData.reduce((s, d) => s + d.lanjut, 0);
    const totalK = tableData.reduce((s, d) => s + d.keluar, 0);
    const totalAll = totalL + totalK;
    if (totalAll > 0) {
        const worstKeluar = [...tableData].sort((a, b) => b.keluar - a.keluar)[0];
        let distTxt = `Dari <strong>${tableData.length}</strong> kelas, total <span class="insight-highlight">${fmt(totalL)}</span> siswa melanjutkan dan <span class="insight-warn">${fmt(totalK)}</span> keluar.`;
        if (worstKeluar.keluar > 0) {
            const worstPct = (worstKeluar.keluar / totalK * 100);
            distTxt += ` ${worstKeluar.kelas} menyumbang jumlah keluar terbesar (<strong>${fmt(worstKeluar.keluar)}</strong> siswa, ${pct(worstPct)}% dari total keluar).`;
        }
        setInsight('insightClassDistribution', distTxt);
    } else {
        setInsight('insightClassDistribution', '');
    }
}

function generateSchoolYearlyTrendInsight() {
    const schoolRecords = state.records.filter(r =>
        r.jenjang === state.selectedJenjang && r.organization_code === state.selectedOrg
    );
    const yearly = getYearlyStats(schoolRecords);
    if (yearly.length < 2) { setInsight('insightSchoolYearlyTrend', ''); return; }

    const first = yearly[0];
    const last = yearly[yearly.length - 1];
    const delta = last.retention - first.retention;
    const trendWord = delta > 1 ? 'meningkat' : delta < -1 ? 'menurun' : 'relatif stabil';
    const trendClass = delta > 1 ? 'insight-highlight' : delta < -1 ? 'insight-warn' : 'insight-neutral';

    const orgName = getOrgName(state.selectedOrg);
    setInsight('insightSchoolYearlyTrend',
        `Retention rate <strong>${orgName}</strong> <span class="${trendClass}">${trendWord}</span> dari ${pct(first.retention)}% (${first.period}) ke ${pct(last.retention)}% (${last.period})${Math.abs(delta) > 1 ? ` (${delta > 0 ? '+' : ''}${pct(delta)} poin)` : ''}. Jumlah siswa lanjut pada periode terakhir: <strong>${fmt(last.lanjut)}</strong> siswa.`
    );
}

// ============================================================
// SECTION KESIMPULAN — Conclusion Generator
// ============================================================

function generateConclusion() {
    const allRecords = state.records;
    if (!allRecords || allRecords.length === 0) return;

    const periods = state.metadata ? state.metadata.periods : [];
    const jenjangList = ['TK', 'SD', 'SMP'];

    // ---- Global Retention ----
    let gLanjut = 0, gKeluar = 0;
    allRecords.forEach(r => {
        if (r.type === 'lanjut') gLanjut += r.jumlah_siswa;
        else if (r.type === 'keluar') gKeluar += r.jumlah_siswa;
    });
    const gTotal = gLanjut + gKeluar;
    const gRate = gTotal > 0 ? (gLanjut / gTotal * 100) : 0;

    // ---- Trend (all periods, all jenjang) ----
    const yearly = getYearlyStats(allRecords);
    let trendWord = 'stabil', trendDelta = 0, trendIcon = 'trending_flat', trendClass = 'neutral';
    if (yearly.length >= 2) {
        const first = yearly[0], last = yearly[yearly.length - 1];
        trendDelta = last.retention - first.retention;
        if (trendDelta > 1)  { trendWord = 'meningkat'; trendIcon = 'trending_up';   trendClass = 'positive'; }
        if (trendDelta < -1) { trendWord = 'menurun';   trendIcon = 'trending_down'; trendClass = 'negative'; }
    }

    // ---- Jenjang stats ----
    const jStats = jenjangList.map(j => {
        let lj = 0, kj = 0;
        allRecords.forEach(r => {
            if (r.jenjang !== j) return;
            if (r.type === 'lanjut') lj += r.jumlah_siswa;
            else if (r.type === 'keluar') kj += r.jumlah_siswa;
        });
        const tj = lj + kj;
        return { j, lanjut: lj, keluar: kj, total: tj, retention: tj > 0 ? (lj / tj * 100) : 0 };
    }).filter(s => s.total > 0).sort((a, b) => b.retention - a.retention);

    const bestJ = jStats[0];
    const worstJ = jStats[jStats.length - 1];

    // ---- Schools below threshold ----
    const orgMap = {};
    allRecords.forEach(r => {
        const key = r.organization_code;
        if (!orgMap[key]) orgMap[key] = { lanjut: 0, keluar: 0, name: getOrgName(r.organization_code), jenjang: new Set() };
        if (r.type === 'lanjut') orgMap[key].lanjut += r.jumlah_siswa;
        else if (r.type === 'keluar') orgMap[key].keluar += r.jumlah_siswa;
        orgMap[key].jenjang.add(r.jenjang);
    });
    const orgArr = Object.values(orgMap).map(o => {
        const t = o.lanjut + o.keluar;
        return { ...o, total: t, retention: t > 0 ? (o.lanjut / t * 100) : 0 };
    }).filter(o => o.total > 0);
    const avgOrgRetention = orgArr.reduce((s, o) => s + o.retention, 0) / (orgArr.length || 1);
    const atRiskOrgs = orgArr.filter(o => o.retention < avgOrgRetention - 3).sort((a, b) => a.retention - b.retention).slice(0, 3);
    const highPerfOrgs = orgArr.filter(o => o.retention > avgOrgRetention + 3).sort((a, b) => b.retention - a.retention).slice(0, 3);

    // ---- Tren jenjang ----
    const jTrend = {};
    jenjangList.forEach(j => {
        const jRec = allRecords.filter(r => r.jenjang === j);
        const jYearly = getYearlyStats(jRec);
        if (jYearly.length >= 2) {
            const d = jYearly[jYearly.length - 1].retention - jYearly[0].retention;
            jTrend[j] = d;
        } else {
            jTrend[j] = 0;
        }
    });

    // ---- Survey data ----
    const alasanKeluar  = (state.survey && state.survey.alasan_keluar)  ? state.survey.alasan_keluar  : [];
    const alasanLanjut  = (state.survey && state.survey.alasan_mendaftar) ? state.survey.alasan_mendaftar : [];
    const sumberInfo    = (state.survey && state.survey.sumber_info)    ? state.survey.sumber_info    : [];

    const topKeluar = alasanKeluar.filter(d => {
        const lbl = (d.label || d.alasan || '').toLowerCase();
        return !lbl.includes('tidak ada') && !lbl.includes('semua sudah baik') && !lbl.includes('sudah bagus');
    }).slice(0, 3);

    const topLanjut  = alasanLanjut.slice(0, 2);
    const topSumber  = sumberInfo.slice(0, 1);

    // ---- Text mining ----
    const tmSentiment = state.textMining && state.textMining.sentiment ? state.textMining.sentiment : null;
    const tmTopics    = state.textMining && state.textMining.topics    ? state.textMining.topics    : null;

    // ================================================================
    // POPULATE DOM
    // ================================================================

    // Header badges
    const badgePeriod  = document.getElementById('conclusionBadgePeriod');
    const badgeSekolah = document.getElementById('conclusionBadgeSekolah');
    if (badgePeriod)  badgePeriod.textContent  = `${periods.length} Tahun Ajaran Dianalisis`;
    if (badgeSekolah) badgeSekolah.textContent = `${orgArr.length} Cabang Sekolah`;

    // ---- KPI Snapshot ----
    const elRate = document.getElementById('cncRetentionRate');
    if (elRate) elRate.textContent = `${pct(gRate)}%`;

    const elRateTrend = document.getElementById('cncRetentionTrend');
    if (elRateTrend) {
        elRateTrend.className = `kpi-trend ${trendClass}`;
        const trendText = trendWord === 'stabil'
            ? `Stabil selama ${periods.length} periode`
            : `${trendDelta > 0 ? '+' : ''}${pct(trendDelta)} poin dari ${periods[0] || ''} s/d ${periods[periods.length - 1] || ''}`;
        elRateTrend.innerHTML = `<span class="material-icons-round trend-icon">${trendIcon}</span><span class="trend-text">${trendText}</span>`;
    }

    const elTotal = document.getElementById('cncTotalSiswa');
    if (elTotal) elTotal.textContent = fmt(gTotal);

    const elPeriode = document.getElementById('cncPeriodeCount');
    if (elPeriode) {
        elPeriode.innerHTML = `<span class="material-icons-round trend-icon">calendar_today</span><span class="trend-text">${periods.length} tahun ajaran (${periods[0] || ''} — ${periods[periods.length - 1] || ''})</span>`;
    }

    if (bestJ) {
        const el = document.getElementById('cncBestJenjang');
        const elS = document.getElementById('cncBestJenjangRate');
        if (el) el.textContent = bestJ.j;
        if (elS) elS.innerHTML = `<span class="material-icons-round trend-icon">workspace_premium</span><span class="trend-text">${pct(bestJ.retention)}% retention rate</span>`;
    }
    if (worstJ && jStats.length > 1) {
        const el = document.getElementById('cncWorstJenjang');
        const elS = document.getElementById('cncWorstJenjangRate');
        if (el) el.textContent = worstJ.j;
        if (elS) elS.innerHTML = `<span class="material-icons-round trend-icon">warning_amber</span><span class="trend-text">${pct(worstJ.retention)}% retention rate</span>`;
    }

    // ================================================================
    // AREA PERHATIAN (Danger card)
    // ================================================================
    const dangerItems = [];

    // 1. Tren global turun
    if (trendDelta < -2) {
        dangerItems.push(`Retention rate global menunjukkan tren <strong>penurunan ${pct(Math.abs(trendDelta))} poin</strong> selama ${periods.length} periode terakhir — perlu investigasi penyebab struktural.`);
    }

    // 2. Jenjang dengan tren negatif
    jenjangList.forEach(j => {
        if (jTrend[j] < -3) {
            dangerItems.push(`Jenjang <strong>${j}</strong> mengalami penurunan retention rate sebesar <strong>${pct(Math.abs(jTrend[j]))} poin</strong> selama periode analisis.`);
        }
    });

    // 3. Jenjang terlemah jauh di bawah rata-rata
    if (worstJ && jStats.length > 1) {
        const diff = bestJ.retention - worstJ.retention;
        if (diff > 5) {
            dangerItems.push(`Kesenjangan retention rate antara jenjang terbaik (${bestJ.j}: ${pct(bestJ.retention)}%) dan terendah (${worstJ.j}: ${pct(worstJ.retention)}%) mencapai <strong>${pct(diff)} poin</strong>.`);
        }
    }

    // 4. Sekolah berisiko
    if (atRiskOrgs.length > 0) {
        const names = atRiskOrgs.map(o => `${o.name} (${pct(o.retention)}%)`).join(', ');
        dangerItems.push(`${atRiskOrgs.length} cabang berada di bawah rata-rata retention: <strong>${names}</strong> — perlu perhatian prioritas.`);
    }

    // 5. Keluhan terbanyak dari survei
    if (topKeluar.length > 0) {
        const top = topKeluar[0];
        const label = top.label || top.alasan;
        const count = top.count || top.jumlah;
        dangerItems.push(`Keluhan terbanyak dari responden survei: "<strong>${label}</strong>" (<strong>${fmt(count)}</strong> responden) — merupakan area perbaikan prioritas.`);
    }

    const dangerEl = document.getElementById('conclusionDangerList');
    if (dangerEl) {
        if (dangerItems.length > 0) {
            dangerEl.innerHTML = dangerItems.map(txt =>
                `<div class="conclusion-finding-item"><div class="fi-dot"></div><div>${txt}</div></div>`
            ).join('');
        } else {
            dangerEl.innerHTML = `<div class="conclusion-empty"><span class="material-icons-round">check_circle</span>Tidak ada area perhatian kritis yang terdeteksi.</div>`;
        }
    }

    // ================================================================
    // KEKUATAN UTAMA (Success card)
    // ================================================================
    const successItems = [];

    // 1. Global rate tinggi
    if (gRate >= 90) {
        successItems.push(`Retention rate global mencapai <strong>${pct(gRate)}%</strong> — tergolong <strong>sangat baik</strong> dan mencerminkan loyalitas tinggi orang tua terhadap sekolah Petra.`);
    } else if (gRate >= 85) {
        successItems.push(`Retention rate global <strong>${pct(gRate)}%</strong> menunjukkan tingkat loyalitas orang tua yang <strong>baik</strong> secara keseluruhan.`);
    }

    // 2. Jenjang terbaik
    if (bestJ && bestJ.retention >= 90) {
        successItems.push(`Jenjang <strong>${bestJ.j}</strong> memiliki retention rate tertinggi (<strong>${pct(bestJ.retention)}%</strong>), menjadi tolok ukur keberhasilan yang dapat direplikasi jenjang lain.`);
    }

    // 3. Sekolah dengan performa tinggi
    if (highPerfOrgs.length > 0) {
        const names = highPerfOrgs.map(o => `${o.name} (${pct(o.retention)}%)`).join(', ');
        successItems.push(`${highPerfOrgs.length} cabang menunjukkan performa di atas rata-rata: <strong>${names}</strong> — praktik terbaik di cabang ini layak dijadikan referensi.`);
    }

    // 4. Alasan mendaftar positif
    if (topLanjut.length > 0) {
        const top = topLanjut[0];
        const label = top.label || top.alasan;
        const count = top.count || top.jumlah;
        successItems.push(`Alasan pendaftaran terpopuler: "<strong>${label}</strong>" (<strong>${fmt(count)}</strong> responden) — menunjukkan nilai khas yang menjadi daya tarik utama Petra.`);
    }

    // 5. Tren naik
    if (trendDelta > 2) {
        successItems.push(`Tren retention rate secara keseluruhan <strong>meningkat ${pct(trendDelta)} poin</strong> selama ${periods.length} periode — sinyal positif arah perbaikan yang konsisten.`);
    }

    const successEl = document.getElementById('conclusionSuccessList');
    if (successEl) {
        if (successItems.length > 0) {
            successEl.innerHTML = successItems.map(txt =>
                `<div class="conclusion-finding-item"><div class="fi-dot"></div><div>${txt}</div></div>`
            ).join('');
        } else {
            successEl.innerHTML = `<div class="conclusion-empty"><span class="material-icons-round">info</span>Data belum cukup untuk mengidentifikasi kekuatan utama.</div>`;
        }
    }

    // ================================================================
    // SUARA ORANG TUA (Voice card)
    // ================================================================
    const voiceItems = [];

    // Sentiment summary
    if (tmSentiment && tmSentiment.summary) {
        const total = tmSentiment.total || tmSentiment.summary.reduce((s, x) => s + x.count, 0);
        const positif   = tmSentiment.summary.find(s => s.label === 'Positif');
        const perbaikan = tmSentiment.summary.find(s => s.label === 'Saran Perbaikan');
        const netral    = tmSentiment.summary.find(s => s.label === 'Netral');

        if (positif && perbaikan) {
            const pPct = positif.percentage || pct(positif.count / total * 100);
            const kPct = perbaikan.percentage || pct(perbaikan.count / total * 100);
            voiceItems.push(
                `Dari <strong>${fmt(total)}</strong> saran yang dianalisis: <strong>${pPct}%</strong> bernada positif, <strong>${kPct}%</strong> berupa saran perbaikan yang dapat ditindaklanjuti.` +
                `<div class="conclusion-sentiment-bar" style="margin-top:8px">` +
                `<div style="width:${pPct}%;background:#059669"></div>` +
                `<div style="width:${kPct}%;background:#02C5BE"></div>` +
                `<div style="width:${netral ? (netral.percentage || '0') : '0'}%;background:#94a3b8"></div>` +
                `</div>`
            );
        }
    } else if (topKeluar.length === 0 && topLanjut.length === 0) {
        voiceItems.push('Data survei sedang dimuat...');
    }

    // Top topik
    if (tmTopics && tmTopics.topics && tmTopics.topics.length > 0) {
        const tops = tmTopics.topics.slice(0, 2);
        const topicStr = tops.map(t => `"${t.topic}" (${t.percentage}%)`).join(' dan ');
        voiceItems.push(`Topik paling banyak dibahas dalam saran: <strong>${topicStr}</strong>.`);
    }

    // Sumber info terpopuler
    if (topSumber.length > 0) {
        const s = topSumber[0];
        voiceItems.push(`Orang tua paling banyak mendapatkan informasi PSB melalui <strong>${s.label}</strong> — kanal ini perlu dioptimalkan sebagai sarana komunikasi utama.`);
    }

    // Sample positive quote from sentiment
    if (tmSentiment && tmSentiment.all_comments) {
        const positifSamples = tmSentiment.all_comments.filter(c => c.sentiment === 'Positif' && c.saran && c.saran.length > 30 && c.saran.length < 160);
        if (positifSamples.length > 0) {
            const sample = positifSamples[Math.floor(Math.random() * Math.min(10, positifSamples.length))];
            voiceItems.push(`<div class="conclusion-quote">${sample.saran}</div>`);
        }
    }

    const voiceEl = document.getElementById('conclusionVoiceList');
    if (voiceEl) {
        if (voiceItems.length > 0) {
            voiceEl.innerHTML = voiceItems.map((txt, i) =>
                i === voiceItems.length - 1 && txt.startsWith('<div')
                    ? txt  // raw HTML (quote)
                    : `<div class="conclusion-finding-item"><div class="fi-dot"></div><div>${txt}</div></div>`
            ).join('');
        } else {
            voiceEl.innerHTML = `<div class="conclusion-empty"><span class="material-icons-round">info</span>Data survei belum tersedia.</div>`;
        }
    }

    // ================================================================
    // REKOMENDASI
    // ================================================================
    const recos = [];

    // From tren turun
    if (trendDelta < -2) {
        recos.push(`Lakukan analisis mendalam terhadap faktor-faktor penyebab <strong>penurunan retention rate global ${pct(Math.abs(trendDelta))} poin</strong> selama ${periods.length} periode. Pertimbangkan review kebijakan akademik dan komunikasi dengan orang tua.`);
    }

    // From jenjang lemah
    if (worstJ && jStats.length > 1 && (bestJ.retention - worstJ.retention) > 5) {
        recos.push(`Fokuskan program retensi khusus untuk jenjang <strong>${worstJ.j}</strong> (retention ${pct(worstJ.retention)}%). Identifikasi perbedaan pengalaman orang tua di jenjang ini dibanding jenjang lain.`);
    }

    // From jenjang tren negatif
    jenjangList.forEach(j => {
        if (jTrend[j] < -3) {
            recos.push(`Investigasi penyebab penurunan retention jenjang <strong>${j}</strong> (turun ${pct(Math.abs(jTrend[j]))} poin). Wawancara orang tua yang tidak melanjutkan dapat memberikan insight berharga.`);
        }
    });

    // From at-risk schools
    if (atRiskOrgs.length > 0) {
        const names = atRiskOrgs.slice(0, 2).map(o => o.name).join(' dan ');
        recos.push(`Prioritaskan dukungan manajemen untuk cabang <strong>${names}</strong>. Review program unggulan dari cabang berperforma tinggi dan replikasikan praktik terbaik tersebut.`);
    }

    // From top keluhan
    if (topKeluar.length > 0) {
        const top = topKeluar[0];
        const label = top.label || top.alasan;
        const count = top.count || top.jumlah;
        recos.push(`Tangani keluhan utama "<strong>${label}</strong>" yang disampaikan oleh <strong>${fmt(count)}</strong> responden. Pertimbangkan komunikasi proaktif dan transparansi informasi terkait hal ini.`);
    }
    if (topKeluar.length > 1) {
        const sec = topKeluar[1];
        const label2 = sec.label || sec.alasan;
        recos.push(`Tindak lanjuti keluhan "<strong>${label2}</strong>" sebagai prioritas kedua. Bentuk tim task force atau program perbaikan terstruktur untuk isu ini.`);
    }

    // From high perf
    if (highPerfOrgs.length > 0) {
        recos.push(`Dokumentasikan dan sebarluaskan praktik terbaik dari cabang berperforma tinggi (<strong>${highPerfOrgs.map(o=>o.name).join(', ')}</strong>) ke seluruh jaringan sekolah Petra sebagai benchmark internal.`);
    }

    // From sumber info
    if (topSumber.length > 0) {
        recos.push(`Optimalkan <strong>${topSumber[0].label}</strong> sebagai kanal komunikasi PSB utama — perkuat konten dan konsistensi informasi di platform ini untuk meningkatkan jangkauan.`);
    }

    // Always add monitoring reco
    recos.push(`Laksanakan survei kepuasan dan monitoring retention secara berkala setiap akhir tahun ajaran untuk memantau efektivitas program yang dijalankan.`);

    const recoEl = document.getElementById('conclusionRecoList');
    const recoCount = document.getElementById('conclusionRecoCount');
    if (recoCount) recoCount.textContent = recos.length;
    if (recoEl) {
        recoEl.innerHTML = recos.map((txt, i) =>
            `<div class="conclusion-reco-item">
                <div class="conclusion-reco-num">${i + 1}</div>
                <div class="conclusion-reco-text">${txt}</div>
            </div>`
        ).join('');
    }
}

// ============================================================
// TEXT MINING: Saran & Masukan Rendering
// ============================================================

async function loadAndRenderTextMining() {
    try {
        const [wordFreqRes, sentimentRes, topicRes] = await Promise.allSettled([
            fetch('data/survey_data/word_frequency.json').then(r => r.json()),
            fetch('data/survey_data/sentimen_saran.json').then(r => r.json()),
            fetch('data/survey_data/topik_saran.json').then(r => r.json())
        ]);

        if (wordFreqRes.status === 'fulfilled') {
            state.textMining = state.textMining || {};
            state.textMining.wordFreq = wordFreqRes.value;
            renderWordCloud(wordFreqRes.value);
        }

        if (sentimentRes.status === 'fulfilled') {
            state.textMining = state.textMining || {};
            state.textMining.sentiment = sentimentRes.value;
            renderSentimentDonut(sentimentRes.value);
            renderSentimentSamples(sentimentRes.value);
            populateSaranOrgFilter();
            // Update total saran count
            const tmTotal = document.getElementById('tmTotalSaran');
            if (tmTotal) tmTotal.textContent = sentimentRes.value.total.toLocaleString('id-ID');
            
            // Update sentiment explorer tab badges dynamically
            updateSaranExplorerBadges(sentimentRes.value);
        }

        if (topicRes.status === 'fulfilled') {
            state.textMining = state.textMining || {};
            state.textMining.topics = topicRes.value;
            renderTopicBarChart(topicRes.value);
            renderTopicAccordion(topicRes.value);
        }
        
        // Generate text mining insights after all data is loaded
        generateTextMiningInsights();
        // Regenerate conclusion now that text mining data is available
        generateConclusion();
    } catch (e) {
        console.warn('Text mining data not available:', e);
    }
}

function updateSaranExplorerBadges(sentimentData) {
    const allComments = sentimentData.all_comments || [];
    const countAll = allComments.length;
    const countPositif = allComments.filter(c => c.sentiment === 'Positif').length;
    const countPerbaikan = allComments.filter(c => c.sentiment === 'Saran Perbaikan').length;
    const countNetral = allComments.filter(c => c.sentiment === 'Netral').length;

    const elAll = document.getElementById('countAllSaran');
    const elPositif = document.getElementById('countPositifSaran');
    const elPerbaikan = document.getElementById('countPerbaikanSaran');
    const elNetral = document.getElementById('countNetralSaran');

    if (elAll) elAll.textContent = countAll.toLocaleString('id-ID');
    if (elPositif) elPositif.textContent = countPositif.toLocaleString('id-ID');
    if (elPerbaikan) elPerbaikan.textContent = countPerbaikan.toLocaleString('id-ID');
    if (elNetral) elNetral.textContent = countNetral.toLocaleString('id-ID');
}

function renderWordCloud(data) {
    const wrapper = document.getElementById('wordCloudWrapper');
    let canvas = document.getElementById('wordCloudCanvas');
    if (!wrapper || !data.top_words || data.top_words.length === 0) return;

    if (!canvas) {
        wrapper.innerHTML = '<canvas id="wordCloudCanvas" width="900" height="340" style="width: 100%; height: 340px; cursor: pointer;"></canvas>';
        canvas = document.getElementById('wordCloudCanvas');
    }

    const words = data.top_words.slice(0, 55);
    if (words.length === 0) return;

    const width = wrapper.clientWidth || 900;
    const height = 340;
    canvas.width = width;
    canvas.height = height;

    const maxCount = Math.max(...words.map(w => w.count));
    const minCount = Math.min(...words.map(w => w.count));

    const colorPalette = [
        '#02C5BE', '#00897B', '#0d9488', '#f59e0b', '#ff9800',
        '#0f766e', '#3b82f6', '#475569', '#10b981', '#14b8a6'
    ];

    if (typeof WordCloud === 'function') {
        const list = words.map(w => {
            const ratio = maxCount === minCount ? 0.5 : (w.count - minCount) / (maxCount - minCount);
            const size = Math.round(16 + Math.pow(ratio, 0.65) * 44);
            return [w.word, size, w.count];
        });

        try {
            WordCloud(canvas, {
                list: list,
                gridSize: Math.max(4, Math.round(12 * width / 1024)),
                weightFactor: 1,
                fontFamily: "'Outfit', 'Inter', 'Segoe UI', sans-serif",
                fontWeight: 'bold',
                color: function(word, weight, fontSize, distance, theta, idx) {
                    return colorPalette[idx % colorPalette.length];
                },
                rotateRatio: 0.25,
                rotationSteps: 2,
                backgroundColor: 'transparent',
                shuffle: true,
                drawOutOfBound: false,
                click: function(item) {
                    if (item && item[0]) {
                        openSaranExplorer('ALL', 'ALL', item[0], 'ALL');
                    }
                },
                hover: function(item) {
                    canvas.style.cursor = item ? 'pointer' : 'default';
                }
            });
            return;
        } catch (e) {
            console.warn('WordCloud2 canvas render error, using fallback:', e);
        }
    }

    // Fallback if WordCloud CDN fails to load
    let html = `<div class="word-cloud-container" style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 12px; padding: 20px;">`;
    words.forEach((w, idx) => {
        const ratio = maxCount === minCount ? 0.5 : (w.count - minCount) / (maxCount - minCount);
        const fontSize = Math.round(15 + Math.pow(ratio, 0.7) * 29);
        const fontWeight = ratio > 0.6 ? '800' : (ratio > 0.3 ? '700' : '600');
        const color = colorPalette[idx % colorPalette.length];
        const opacity = ratio > 0.5 ? '1' : (ratio > 0.2 ? '0.95' : '0.85');

        html += `<span class="word-cloud-tag" 
            title="Frekuensi: ${w.count} kali dalam saran & masukan — Klik untuk filter komentar" 
            onclick="openSaranExplorer('ALL', 'ALL', '${w.word}')" 
            style="font-size: ${fontSize}px; font-weight: ${fontWeight}; color: ${color}; opacity: ${opacity}; margin: 6px 12px; cursor: pointer;">
            ${w.word}
        </span>`;
    });
    html += `</div>`;
    wrapper.innerHTML = html;
}

function renderWordCloudFallback(container, data) {
    renderWordCloud(data);
}

function renderSentimentDonut(data) {
    destroyChart('sentimentDonutChart');
    const el = document.getElementById('sentimentDonutChart');
    if (!el || !data.summary) return;

    const paletteMap = {
        'Positif': '#02C5BE',
        'Saran Perbaikan': '#ff9800',
        'Netral': '#64748b'
    };

    const bgColors = data.summary.map(s => paletteMap[s.label] || s.color || '#94a3b8');

    state.charts['sentimentDonutChart'] = new Chart(el, {
        type: 'doughnut',
        data: {
            labels: data.summary.map(s => s.label),
            datasets: [{
                data: data.summary.map(s => s.count),
                backgroundColor: bgColors,
                borderWidth: 0,
                cutout: '75%',
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const item = data.summary[ctx.dataIndex];
                            return `${item.label}: ${item.count} (${item.percentage}%)`;
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 13 },
                    formatter: function(val, ctx) {
                        const pct = data.summary[ctx.dataIndex].percentage;
                        return pct >= 10 ? `${pct}%` : '';
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });

    // Render legend
    const legend = document.getElementById('sentimentLegend');
    if (legend) {
        legend.innerHTML = data.summary.map((s, idx) => 
            `<div class="sentiment-legend-item">
                <div class="sentiment-legend-dot" style="background:${bgColors[idx]}"></div>
                <span>${s.label}: <strong>${s.count}</strong> (${s.percentage}%)</span>
            </div>`
        ).join('');
    }
}

function renderSentimentSamples(data) {
    const container = document.getElementById('sentimentSamples');
    if (!container || !data.samples) return;

    const sentimentConfig = {
        'Positif': { icon: 'sentiment_satisfied', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
        'Saran Perbaikan': { icon: 'sentiment_dissatisfied', color: '#02C5BE', bg: 'rgba(2,197,190,0.12)' },
        'Netral': { icon: 'sentiment_neutral', color: '#64748b', bg: 'rgba(100,116,139,0.12)' }
    };

    let html = '<div class="topic-accordion">';
    for (const [label, samples] of Object.entries(data.samples)) {
        const cfg = sentimentConfig[label] || sentimentConfig['Netral'];
        html += `
            <div class="topic-item">
                <div class="topic-item-header" onclick="this.parentElement.classList.toggle('open')">
                    <div class="topic-item-left">
                        <div class="topic-item-icon" style="background:${cfg.bg}; color:${cfg.color}">
                            <span class="material-icons-round">${cfg.icon}</span>
                        </div>
                        <span class="topic-item-name">${label}</span>
                    </div>
                    <div class="topic-item-right">
                        <span class="topic-item-badge">${Math.min(5, samples.length)} contoh</span>
                        <span class="material-icons-round topic-item-arrow">expand_more</span>
                    </div>
                </div>
                <div class="topic-item-body">
                    <div class="topic-saran-list">
                        ${samples.slice(0, 5).map(s => `
                            <div class="topic-saran-item">
                                <span class="material-icons-round">format_quote</span>
                                <span>${s}</span>
                            </div>`).join('')}
                        <div class="topic-saran-item explore-more-btn" onclick="openSaranExplorer('${label}', 'ALL'); event.stopPropagation();">
                            <span class="material-icons-round">open_in_new</span>
                            <span>Lihat Seluruh Komentar "${label}" →</span>
                        </div>
                    </div>
                </div>
            </div>`;
    }
    html += `
        <div style="margin-top: 14px;">
            <button class="btn btn-outline" style="width: 100%; justify-content: center; border-color: var(--green-primary); color: var(--green-dark); padding: 10px;" onclick="openSaranExplorer('ALL', 'ALL')">
                <span class="material-icons-round">forum</span>
                <span>Eksplorasi Semua ${data.total} Saran & Masukan →</span>
            </button>
        </div>`;
    html += '</div>';
    container.innerHTML = html;
}

function renderTopicBarChart(data) {
    destroyChart('topicBarChart');
    const el = document.getElementById('topicBarChart');
    if (!el || !data.topics) return;

    const topicIcons = {
        'Aplikasi & Teknologi PSB': '#02C5BE',
        'Pembayaran & Biaya': '#00897B',
        'Pelayanan & Responsivitas': '#10b981',
        'Fasilitas & Infrastruktur': '#0d9488',
        'Kurikulum & Akademik': '#059669',
        'Karakter & Kedisiplinan': '#14b8a6',
        'Lainnya': '#64748b'
    };

    const topics = data.topics;
    const colors = topics.map(t => topicIcons[t.topic] || '#94a3b8');

    state.charts['topicBarChart'] = new Chart(el, {
        type: 'bar',
        data: {
            labels: topics.map(t => t.topic),
            datasets: [{
                label: 'Jumlah Saran',
                data: topics.map(t => t.count),
                backgroundColor: colors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    color: function(ctx) { return colors[ctx.dataIndex]; },
                    font: { weight: 'bold', size: 12 },
                    formatter: function(val, ctx) {
                        return `${val} (${topics[ctx.dataIndex].percentage}%)`;
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { 
                        font: { size: 12, weight: 600, family: "'Inter', sans-serif" },
                        color: '#475569',
                        padding: 12,
                        autoSkip: false
                    },
                    border: { display: false }
                }
            },
            layout: {
                padding: { left: 16, right: 75 }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function renderTopicAccordion(data) {
    const container = document.getElementById('topicAccordion');
    if (!container || !data.topics) return;

    const topicConfig = {
        'Aplikasi & Teknologi PSB': { icon: 'devices', color: '#02C5BE', bg: 'rgba(2,197,190,0.12)' },
        'Pembayaran & Biaya': { icon: 'payments', color: '#00897B', bg: 'rgba(0,137,123,0.12)' },
        'Pelayanan & Responsivitas': { icon: 'support_agent', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
        'Fasilitas & Infrastruktur': { icon: 'apartment', color: '#0d9488', bg: 'rgba(13,148,136,0.12)' },
        'Kurikulum & Akademik': { icon: 'school', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
        'Karakter & Kedisiplinan': { icon: 'psychology', color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
        'Lainnya': { icon: 'more_horiz', color: '#64748b', bg: 'rgba(100,116,139,0.12)' }
    };

    container.innerHTML = data.topics.map(t => {
        const cfg = topicConfig[t.topic] || topicConfig['Lainnya'];
        const samplesHTML = t.samples.map(s => 
            `<div class="topic-saran-item">
                <span class="material-icons-round">format_quote</span>
                <span>${s}</span>
            </div>`
        ).join('') + `
            <div class="topic-saran-item explore-more-btn" onclick="openSaranExplorer('ALL', '${t.topic.replace(/'/g, "\\'")}'); event.stopPropagation();">
                <span class="material-icons-round">open_in_new</span>
                <span>Lihat Semua ${t.count} Komentar Topik "${t.topic}" →</span>
            </div>`;

        return `
            <div class="topic-item">
                <div class="topic-item-header" onclick="this.parentElement.classList.toggle('open')">
                    <div class="topic-item-left">
                        <div class="topic-item-icon" style="background:${cfg.bg}; color:${cfg.color}">
                            <span class="material-icons-round">${cfg.icon}</span>
                        </div>
                        <span class="topic-item-name">${t.topic}</span>
                    </div>
                    <div class="topic-item-right">
                        <span class="topic-item-badge">${t.count} saran (${t.percentage}%)</span>
                        <span class="material-icons-round topic-item-arrow">expand_more</span>
                    </div>
                </div>
                <div class="topic-item-body">
                    <div class="topic-saran-list">${samplesHTML}</div>
                </div>
            </div>`;
    }).join('');
}

// ============================================================
// EKSPLORASI SEMUA SARAN & MASUKAN (903 KOMENTAR)
// ============================================================
let saranExplorerState = {
    sentiment: 'ALL',
    topic: 'ALL',
    jenjang: 'ALL',
    sekolah: 'ALL',
    search: '',
    currentPage: 1,
    pageSize: 15
};

function updateSaranDropdownUI(groupId, value, defaultText) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const selectedEl = group.querySelector('.dropdown-selected');
    const options = group.querySelectorAll('.dropdown-option');
    let matchedText = defaultText;
    options.forEach(o => {
        const isMatch = o.dataset.value === value;
        o.classList.toggle('selected', isMatch);
        if (isMatch) matchedText = o.textContent;
    });
    if (selectedEl) selectedEl.textContent = matchedText;
}

function setupSaranCustomDropdown(groupId, stateKey, defaultText, onChange) {
    const groupEl = document.getElementById(groupId);
    if (!groupEl) return;
    const dropdownOptions = groupEl.querySelector('.dropdown-options');
    const selectedText = groupEl.querySelector('.dropdown-selected');
    
    groupEl.addEventListener('click', (e) => {
        document.querySelectorAll('.saran-filter-row .filter-group').forEach(el => {
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
            saranExplorerState[stateKey] = val;
            
            dropdownOptions.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            
            groupEl.classList.remove('active');
            if (onChange) onChange(val);
        }
    });
}

function populateSaranOrgFilter() {
    const orgContainer = document.getElementById('saranOrgOptions');
    if (!orgContainer || !state.textMining || !state.textMining.sentiment || !state.textMining.sentiment.all_comments) return;

    const uniqueCodes = [...new Set(state.textMining.sentiment.all_comments.map(c => c.sekolah).filter(Boolean))].sort();
    let html = `<div class="dropdown-option ${saranExplorerState.sekolah === 'ALL' ? 'selected' : ''}" data-value="ALL">Semua Sekolah</div>`;
    uniqueCodes.forEach(code => {
        const name = getOrgName(code);
        const display = code === name ? code : `${code} - ${name}`;
        html += `<div class="dropdown-option ${saranExplorerState.sekolah === code ? 'selected' : ''}" data-value="${code}">${display}</div>`;
    });
    orgContainer.innerHTML = html;
}

function resetSaranFilters() {
    saranExplorerState.sentiment = 'ALL';
    saranExplorerState.topic = 'ALL';
    saranExplorerState.jenjang = 'ALL';
    saranExplorerState.sekolah = 'ALL';
    saranExplorerState.search = '';
    saranExplorerState.currentPage = 1;

    updateSaranDropdownUI('saranFilterGroupTopic', 'ALL', 'Semua Topik');
    updateSaranDropdownUI('saranFilterGroupJenjang', 'ALL', 'Semua Jenjang');
    updateSaranDropdownUI('saranFilterGroupOrg', 'ALL', 'Semua Sekolah');

    const searchInput = document.getElementById('saranSearchInput');
    if (searchInput) searchInput.value = '';

    document.querySelectorAll('.saran-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.sentiment === 'ALL');
    });

    renderSaranExplorerTable();
}

function switchDashboardSection(sectionId) {
    document.querySelectorAll('.dashboard-section').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
        target.style.display = '';
    }
    
    const titles = {
        'section-overview': {t: 'Overview', s: 'Ringkasan transisi dan retensi siswa'},
        'section-trends': {t: 'Analisis Tren', s: 'Tren pertumbuhan siswa (Lanjut vs Keluar)'},
        'section-details': {t: 'Detail Sekolah', s: 'Analisis retensi tingkat kelas dan trend per unit sekolah'},
        'section-survey': {t: 'Analisis Survei & Saran', s: 'Daftar masukan/saran dan unduh data'},
        'section-saran-detail': {t: 'Eksplorasi Semua Saran & Masukan', s: 'Filter, cari kata kunci, dan telusuri seluruh komentar survei per sekolah'},
        'section-conclusion': {t: 'Kesimpulan & Rekomendasi', s: 'Sintesis temuan utama dan rekomendasi tindakan lanjut'}
    };

    const h = document.getElementById('pageTitle');
    const sub = document.getElementById('pageSubtitle');
    if (h && titles[sectionId]) h.textContent = titles[sectionId].t;
    if (sub && titles[sectionId]) sub.textContent = titles[sectionId].s;
    
    const isSurvey = (sectionId === 'section-survey' || sectionId === 'section-saran-detail');
    const isConclusion = (sectionId === 'section-conclusion');
    const globalFiltersEl = document.getElementById('globalFiltersBar');
    const surveyActionsEl = document.getElementById('surveyTopbarActions');
    if (globalFiltersEl) globalFiltersEl.style.display = (isSurvey || isConclusion) ? 'none' : 'flex';
    if (surveyActionsEl) surveyActionsEl.style.display = isSurvey ? 'flex' : 'none';

    // Opsi 1: Sembunyikan Jenjang dan Sekolah filter di tab Detail Sekolah
    const jenjangFilter = document.getElementById('filterGroupJenjang');
    const orgFilter = document.getElementById('filterGroupOrg');
    if (jenjangFilter && orgFilter) {
        if (sectionId === 'section-details') {
            jenjangFilter.style.display = 'none';
            orgFilter.style.display = 'none';
        } else {
            jenjangFilter.style.display = '';
            orgFilter.style.display = '';
        }
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.target === sectionId) {
            item.classList.add('active');
        } else if (sectionId === 'section-saran-detail' && item.dataset.target === 'section-survey') {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    if (sectionId === 'section-survey' && state.textMining && state.textMining.wordFreq) {
        setTimeout(() => {
            renderWordCloud(state.textMining.wordFreq);
        }, 50);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSaranExplorer(sentimentVal = 'ALL', topicVal = 'ALL', searchVal = '', sekolahVal = 'ALL') {
    saranExplorerState.sentiment = sentimentVal;
    saranExplorerState.topic = topicVal;
    saranExplorerState.jenjang = 'ALL';
    saranExplorerState.sekolah = sekolahVal || 'ALL';
    saranExplorerState.search = searchVal || '';
    saranExplorerState.currentPage = 1;

    updateSaranDropdownUI('saranFilterGroupTopic', topicVal, 'Semua Topik');
    updateSaranDropdownUI('saranFilterGroupJenjang', 'ALL', 'Semua Jenjang');
    updateSaranDropdownUI('saranFilterGroupOrg', sekolahVal || 'ALL', 'Semua Sekolah');

    const searchInput = document.getElementById('saranSearchInput');
    if (searchInput) searchInput.value = searchVal || '';

    // Highlight sentiment tab
    document.querySelectorAll('.saran-tab').forEach(tab => {
        if (tab.dataset.sentiment === sentimentVal) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    switchDashboardSection('section-saran-detail');
    renderSaranExplorerTable();
}

function filterSaranBySentiment(sentimentVal) {
    saranExplorerState.sentiment = sentimentVal;
    saranExplorerState.currentPage = 1;
    document.querySelectorAll('.saran-tab').forEach(tab => {
        if (tab.dataset.sentiment === sentimentVal) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    renderSaranExplorerTable();
}

function filterSaranByTopic(topicVal) {
    saranExplorerState.topic = topicVal;
    saranExplorerState.currentPage = 1;
    renderSaranExplorerTable();
}

function filterSaranByJenjang(jenjangVal) {
    saranExplorerState.jenjang = jenjangVal;
    saranExplorerState.currentPage = 1;
    renderSaranExplorerTable();
}

function filterSaranBySekolah(sekolahVal) {
    saranExplorerState.sekolah = sekolahVal;
    saranExplorerState.currentPage = 1;
    renderSaranExplorerTable();
}

function filterSaranBySearch(searchVal) {
    saranExplorerState.search = searchVal;
    saranExplorerState.currentPage = 1;
    renderSaranExplorerTable();
}

function changeSaranPageSize(newSize) {
    saranExplorerState.pageSize = parseInt(newSize, 10);
    saranExplorerState.currentPage = 1;
    renderSaranExplorerTable();
}

function changeSaranPage(delta) {
    const allItems = getFilteredSaranItems();
    const totalPages = Math.ceil(allItems.length / saranExplorerState.pageSize) || 1;
    const newPage = saranExplorerState.currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        saranExplorerState.currentPage = newPage;
        renderSaranExplorerTable();
    }
}

function getFilteredSaranItems() {
    if (!state.textMining || !state.textMining.sentiment || !state.textMining.sentiment.all_comments) {
        return [];
    }
    const all = state.textMining.sentiment.all_comments;
    return all.filter(item => {
        // Sentiment filter
        if (saranExplorerState.sentiment !== 'ALL' && item.sentiment !== saranExplorerState.sentiment) {
            return false;
        }
        // Topic filter
        if (saranExplorerState.topic !== 'ALL' && item.topic !== saranExplorerState.topic) {
            return false;
        }
        // Jenjang filter (flexible prefix/substring match so KB matches KB-A, KB-B, etc.)
        if (saranExplorerState.jenjang !== 'ALL') {
            const jenVal = String(item.jenjang || '').toUpperCase();
            const filterVal = saranExplorerState.jenjang.toUpperCase();
            if (!jenVal.startsWith(filterVal) && !jenVal.includes(filterVal)) {
                return false;
            }
        }
        // Sekolah / Organization Code filter
        if (saranExplorerState.sekolah !== 'ALL') {
            if (item.sekolah !== saranExplorerState.sekolah) {
                return false;
            }
        }
        // Search filter
        if (saranExplorerState.search.trim() !== '') {
            const query = saranExplorerState.search.trim().toLowerCase();
            const textMatch = (item.text || '').toLowerCase().includes(query);
            const topicMatch = (item.topic || '').toLowerCase().includes(query);
            const sekolahMatch = (item.sekolah || '').toLowerCase().includes(query);
            if (!textMatch && !topicMatch && !sekolahMatch) return false;
        }
        return true;
    });
}

function renderSaranExplorerTable() {
    const tbody = document.getElementById('saranExplorerTableBody');
    if (!tbody) return;

    const filtered = getFilteredSaranItems();
    const allTotal = state.textMining?.sentiment?.all_comments?.length || 0;
    
    // Update count title
    const tableTitleEl = document.getElementById('saranTableTitle');
    if (tableTitleEl) {
        tableTitleEl.textContent = `Daftar Saran & Masukan (${filtered.length} dari ${allTotal})`;
    }

    const pageSize = saranExplorerState.pageSize;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const page = Math.min(saranExplorerState.currentPage, totalPages);
    saranExplorerState.currentPage = page;

    const startIdx = (page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, filtered.length);
    const pageItems = filtered.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
                <span class="material-icons-round" style="font-size: 36px; display: block; margin-bottom: 8px; opacity: 0.5;">search_off</span>
                Tidak ada komentar yang cocok dengan filter yang dipilih.
            </td>
        </tr>`;
    } else {
        tbody.innerHTML = pageItems.map((item, idx) => {
            const rowNo = startIdx + idx + 1;
            const sentimenClass = item.sentiment === 'Positif' ? 'positif' : (item.sentiment === 'Saran Perbaikan' ? 'perbaikan' : 'netral');
            const sentimenIcon = item.sentiment === 'Positif' ? 'sentiment_satisfied' : (item.sentiment === 'Saran Perbaikan' ? 'sentiment_dissatisfied' : 'sentiment_neutral');
            
            return `<tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${rowNo}</td>
                <td style="line-height: 1.5; color: var(--text-primary);">
                    <div style="display: flex; gap: 8px; align-items: flex-start;">
                        <span class="material-icons-round" style="font-size: 16px; color: var(--green-primary); margin-top: 2px;">format_quote</span>
                        <span>${item.text}</span>
                    </div>
                </td>
                <td>
                    <span class="saran-badge-sentimen ${sentimenClass}">
                        <span class="material-icons-round" style="font-size: 14px;">${sentimenIcon}</span>
                        <span>${item.sentiment}</span>
                    </span>
                </td>
                <td>
                    <span class="saran-badge-topic">
                        <span class="material-icons-round" style="font-size: 14px; color: var(--green-primary);">label</span>
                        <span>${item.topic || 'Lainnya'}</span>
                    </span>
                </td>
                <td style="text-align: center;">
                    <span class="saran-badge-jenjang" title="${item.sekolah ? getOrgName(item.sekolah) : ''}">${(item.sekolah ? getOrgName(item.sekolah) : '') + (item.jenjang ? ' (' + item.jenjang + ')' : '') || '-'}</span>
                </td>
            </tr>`;
        }).join('');
    }

    // Update pagination info
    const infoEl = document.getElementById('saranTableInfo');
    const indicatorEl = document.getElementById('saranPageIndicator');
    const prevBtn = document.getElementById('saranPrevBtn');
    const nextBtn = document.getElementById('saranNextBtn');

    if (infoEl) {
        infoEl.textContent = filtered.length === 0 ? 'Menampilkan 0 komentar' : `Menampilkan ${startIdx + 1}-${endIdx} dari ${filtered.length} komentar`;
    }
    if (indicatorEl) {
        indicatorEl.textContent = `Halaman ${page} dari ${totalPages}`;
    }
    if (prevBtn) {
        prevBtn.disabled = page <= 1;
        prevBtn.style.opacity = page <= 1 ? '0.4' : '1';
    }
    if (nextBtn) {
        nextBtn.disabled = page >= totalPages;
        nextBtn.style.opacity = page >= totalPages ? '0.4' : '1';
    }
}

function exportAllCommentsExcel() {
    const filtered = getFilteredSaranItems();
    if (!filtered || filtered.length === 0) {
        alert('Tidak ada data saran & masukan yang dapat diunduh');
        return;
    }
    const headers = ['No', 'Isi Saran & Masukan', 'Sentimen', 'Topik', 'Jenjang', 'Sekolah'];
    const rows = filtered.map((item, idx) => [
        idx + 1,
        `"${String(item.text || '').replace(/"/g, '""')}"`,
        `"${item.sentiment || ''}"`,
        `"${item.topic || ''}"`,
        `"${item.jenjang || ''}"`,
        `"${item.sekolah || ''}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Saran_Masukan_PSB_Lengkap_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

            // Sheet 5: Sentimen Saran (Text Mining)
            if (state.textMining && state.textMining.sentiment) {
                const sentRows = state.textMining.sentiment.summary.map((s, i) => ({
                    'No': i + 1,
                    'Klasifikasi Sentimen': s.label,
                    'Jumlah Responden': s.count,
                    'Persentase (%)': s.percentage
                }));
                const ws5 = XLSX.utils.json_to_sheet(sentRows);
                XLSX.utils.book_append_sheet(wb, ws5, 'Sentimen Saran');
            }

            // Sheet 6: Topik Saran (Text Mining)
            if (state.textMining && state.textMining.topics) {
                const topikRows = state.textMining.topics.topics.map((t, i) => ({
                    'No': i + 1,
                    'Topik': t.topic,
                    'Jumlah Saran': t.count,
                    'Persentase (%)': t.percentage
                }));
                const ws6 = XLSX.utils.json_to_sheet(topikRows);
                XLSX.utils.book_append_sheet(wb, ws6, 'Topik Saran');
            }

            // Sheet 7: Frekuensi Kata (Text Mining)
            if (state.textMining && state.textMining.wordFreq) {
                const wordRows = state.textMining.wordFreq.top_words.slice(0, 50).map((w, i) => ({
                    'No': i + 1,
                    'Kata': w.word,
                    'Frekuensi': w.count
                }));
                const ws7 = XLSX.utils.json_to_sheet(wordRows);
                XLSX.utils.book_append_sheet(wb, ws7, 'Frekuensi Kata');
            }

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

// --- Survey Topbar Download Menu Handlers ---
function toggleSurveyDownloadMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('surveyDownloadMenu');
    if (!menu) return;
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
}

function hideSurveyDownloadMenu() {
    const menu = document.getElementById('surveyDownloadMenu');
    if (menu) menu.style.display = 'none';
}

document.addEventListener('click', function(e) {
    const actionsContainer = document.getElementById('surveyTopbarActions');
    if (actionsContainer && !actionsContainer.contains(e.target)) {
        hideSurveyDownloadMenu();
    }
});

// Start
document.addEventListener('DOMContentLoaded', init);
