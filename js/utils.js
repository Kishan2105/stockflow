// ── HELPERS ──

function fmtNum(n) { 
    return Number(n||0).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:2}); 
}

function fmtDate(d) { 
    if (!d) return '—'; 
    try { 
        return new Date(d).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}); 
    } catch { 
        return d; 
    } 
}

function getF(id) { 
    const el = document.getElementById(id); 
    return el ? el.value : ''; 
}

function setF(id, val) { 
    const el = document.getElementById(id); 
    if (el) el.value = val||''; 
}

function closeModal(id) { 
    document.getElementById(id).classList.remove('open'); 
}

function toast(msg, type='') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + type;
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.className = '', 3000);
}

function now() { 
    return new Date().toISOString(); 
}

function today() { 
    return new Date().toISOString().split('T')[0]; 
}

function tsId() { 
    return Date.now().toString(36).toUpperCase(); 
}

// ── SIDEBAR TOGGLE ──

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function toggleSidebarMobile() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
    } else {
        sidebar.classList.add("open");
    }
}

// ── MODAL CLOSE ON OVERLAY ──

document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('open'); 
    });
});

// ── PREVIEW MODAL ──

function showPreviewModal(title, html) {
    document.getElementById('preview-title').textContent = title;
    document.getElementById('preview-content').innerHTML = html;
    document.getElementById('modal-preview').classList.add('open');
}

function doPrint() {
    const content = document.getElementById('preview-content').innerHTML;
    const area = document.getElementById('print-area');
    area.innerHTML = content;
    area.style.display = 'block';
    window.print();
    area.style.display = 'none';
}

// ── DOWNLOAD EXCEL ──

function downloadXLSX(data, name) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Sheet1');
    XLSX.writeFile(wb, `${name}_${today()}.xlsx`);
}