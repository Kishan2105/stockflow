// ── STOCK MOVEMENTS ──

function renderMovements() {
    const tbody = document.getElementById('mv-tbody');
    if (!tbody) return;
    
    // Get all movements from Firebase
    let mvs = Object.values(allMovements || {});
    
    // DON'T filter by activeItemIds - show ALL movements
    // This ensures contractor movements appear even if item was deleted
    
    const from = (document.getElementById('mv-from')||{}).value || '';
    const to   = (document.getElementById('mv-to')||{}).value || '';
    const sort = (document.getElementById('mv-sort')||{}).value || 'date-desc';

    // Apply date filters
    mvs = mvs.filter(m => {
        const d = (m.date||'').slice(0,10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
    });

    // Sort
    mvs.sort((a,b) => {
        if (sort === 'date-asc') return new Date(a.date)-new Date(b.date);
        if (sort === 'item-asc') return (a.itemName||'').localeCompare(b.itemName||'');
        return new Date(b.date)-new Date(a.date);
    });

    if (!mvs.length) { 
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No movements found.</td></tr>'; 
        return; 
    }
    
    tbody.innerHTML = mvs.map(m => {
        const typeColor = m.type==='Stock In'?'green':m.type==='Stock Out'?'red':'blue';
        // Show contractor name if present
        const userDisplay = m.contractorName || m.user || 'System';
        return `<tr>
            <td>${fmtDate(m.date)}</td>
            <td>${m.itemName||''}</td>
            <td class="td-mono">${Math.abs(m.qty || 0)}</td>
            <td><span class="pill ${typeColor}">${m.type || 'Unknown'}</span></td>
            <td>${userDisplay}</td>
            <td class="td-mono">${m.ref||''}</td>
        </tr>`;
    }).join('');
}