// ── STOCK MOVEMENTS ──

function renderMovements() {
    const tbody = document.getElementById('mv-tbody');
    if (!tbody) return;
    const activeItemIds = new Set(Object.keys(allInventory));
    let mvs = Object.values(allMovements).filter(m => activeItemIds.has(m.itemId));

    const from = (document.getElementById('mv-from')||{}).value || '';
    const to   = (document.getElementById('mv-to')||{}).value || '';
    const sort = (document.getElementById('mv-sort')||{}).value || 'date-desc';

    mvs = mvs.filter(m => {
        const d = (m.date||'').slice(0,10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
    });

    mvs.sort((a,b) => {
        if (sort === 'date-asc') return new Date(a.date)-new Date(b.date);
        if (sort === 'item-asc') return (a.itemName||'').localeCompare(b.itemName||'');
        return new Date(b.date)-new Date(a.date);
    });

    if (!mvs.length) { 
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No movements match the current filters.</td></tr>'; 
        return; 
    }
    tbody.innerHTML = mvs.map(m => {
        const typeColor = m.type==='Stock In'?'green':m.type==='Stock Out'?'red':'blue';
        return `<tr>
            <td>${fmtDate(m.date)}</td>
            <td>${m.itemName||''}</td>
            <td class="td-mono">${Math.abs(m.qty)}</td>
            <td><span class="pill ${typeColor}">${m.type}</span></td>
            <td>${m.user||''}</td>
            <td class="td-mono">${m.ref||''}</td>
        </tr>`;
    }).join('');
}