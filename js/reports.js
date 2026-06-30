// ── REPORTS ──

function renderReports() {
    const inv = Object.values(allInventory);
    const totalValue = inv.reduce((s,i)=>s+(i.qty*(i.cost||0)),0);
    document.getElementById('report-stats').innerHTML = `
        <div class="stat-card"><div class="stat-label">Total Stock Value</div><div class="stat-value">Rs ${fmtNum(totalValue)}</div></div>
        <div class="stat-card"><div class="stat-label">Total Movements</div><div class="stat-value">${Object.keys(allMovements).length}</div></div>
        <div class="stat-card"><div class="stat-label">Total Items</div><div class="stat-value">${inv.length}</div></div>
        <div class="stat-card"><div class="stat-label">Open Flags</div><div class="stat-value">${Object.values(allFlags).filter(f=>f.status==='open').length}</div></div>
    `;

    renderFlags();
    renderAuditLog();
}

function renderFlags() {
    const flagsBody = document.getElementById('flags-tbody');
    if (!flagsBody) return;
    const flags = Object.values(allFlags).sort((a,b)=>new Date(b.flaggedAt)-new Date(a.flaggedAt));
    
    if (!flags.length) {
        flagsBody.innerHTML = '<tr class="empty-row"><td colspan="8">No discrepancies flagged.</td></tr>';
        return;
    }
    
    flagsBody.innerHTML = flags.map(f => {
        const varColor = f.variance === 0 ? 'green' : f.variance > 0 ? 'teal' : 'red';
        const statusPill = f.status === 'open' ? '<span class="pill yellow">Open</span>' : '<span class="pill green">Resolved</span>';
        return `<tr>
            <td>${f.itemName}</td>
            <td class="td-mono">${fmtNum(f.systemQty)}</td>
            <td class="td-mono">${fmtNum(f.actualQty)}</td>
            <td><span class="pill ${varColor}">${f.variance>0?'+':''}${fmtNum(f.variance)}</span></td>
            <td>${f.flaggedBy}</td>
            <td>${fmtDate(f.flaggedAt)}</td>
            <td>${statusPill}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-outline btn-sm" onclick="viewFlagReport('${f.id}')">View</button>
                ${f.status === 'open' ? `<button class="btn btn-success btn-sm" onclick="resolveFlag('${f.id}')">Resolve</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function renderAuditLog() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    db.ref('audit_logs').limitToLast(50).once('value', snap => {
        const logs = snap.val() ? Object.values(snap.val()).reverse() : [];
        if (!logs.length) { 
            tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No audit logs yet.</td></tr>'; 
            return; 
        }
        tbody.innerHTML = logs.map(l => 
            `<tr>
                <td>${fmtDate(l.time)}</td>
                <td>${l.user||''}</td>
                <td><span class="pill blue">${l.action}</span></td>
                <td>${l.details||''}</td>
            </tr>`
        ).join('');
    });
}

// ── FLAG SYSTEM ──

function openFlagModal(itemId) {
    const item = allInventory[itemId];
    if (!item) return;
    const modal = document.getElementById('modal-flag');
    modal._itemId = itemId;
    document.getElementById('flag-item-info').innerHTML = 
        `Flagging <strong>${item.name}</strong> (${item.code||''}) — current system quantity: <strong>${fmtNum(item.qty)} ${item.unit||''}</strong>`;
    setF('flag-system-qty', item.qty);
    setF('flag-actual-qty', '');
    setF('flag-variance', '—');
    setF('flag-remarks', '');
    document.getElementById('flag-causes-body').innerHTML = '';
    addFlagCause();
    modal.classList.add('open');
}

function calcFlagVariance() {
    const sys = +getF('flag-system-qty')||0;
    const actual = +getF('flag-actual-qty')||0;
    const diff = actual - sys;
    const el = document.getElementById('flag-variance');
    if (getF('flag-actual-qty') === '') { el.value = '—'; return; }
    el.value = (diff > 0 ? '+' : '') + fmtNum(diff) + (diff > 0 ? ' (surplus)' : diff < 0 ? ' (shortage)' : ' (matches)');
    el.style.color = diff === 0 ? 'var(--success)' : diff > 0 ? 'var(--accent2)' : 'var(--danger)';
}

function addFlagCause() {
    const body = document.getElementById('flag-causes-body');
    const rowId = 'fc-' + Date.now();
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.innerHTML = `
        <td>
            <select style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);font-size:12px;width:100%;">
                <option>Data entry error</option>
                <option>Theft / unauthorized removal</option>
                <option>Damaged / written off, not recorded</option>
                <option>Miscount during physical stock take</option>
                <option>Item misplaced to wrong location</option>
                <option>Other</option>
            </select>
        </td>
        <td>
            <select style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);font-size:12px;width:100%;">
                <option>High</option><option>Medium</option><option>Low</option>
            </select>
        </td>
        <td><input type="text" placeholder="Notes" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);font-size:12px;"></td>
        <td><button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">Remove</button></td>
    `;
    body.appendChild(tr);
}

async function submitFlagReport() {
    const modal = document.getElementById('modal-flag');
    const itemId = modal._itemId;
    const item = allInventory[itemId];
    if (!item) { toast('Item not found', 'error'); return; }
    const sysQty = +getF('flag-system-qty')||0;
    const actualQty = getF('flag-actual-qty');
    if (actualQty === '') { toast('Enter the actual counted quantity', 'error'); return; }

    const causes = [];
    document.querySelectorAll('#flag-causes-body tr').forEach(row => {
        const sels = row.querySelectorAll('select');
        const inp = row.querySelector('input');
        causes.push({ cause: sels[0].value, likelihood: sels[1].value, notes: inp.value });
    });

    const id = 'flag-' + tsId();
    const flag = {
        id, itemId, itemName: item.name, itemCode: item.code||'',
        systemQty: sysQty, actualQty: +actualQty, variance: (+actualQty - sysQty),
        causes, remarks: getF('flag-remarks'),
        status: 'open', flaggedBy: currentUser.name, flaggedAt: now()
    };
    await db.ref('inventory_flags/' + id).set(flag);
    closeModal('modal-flag');
    renderInventory();
    logAudit(currentUser.name, 'Flag Discrepancy', `${item.name} — system ${sysQty}, actual ${actualQty}`);
    toast(`Discrepancy report filed for "${item.name}".`, 'success');
}

async function resolveFlag(flagId) {
    const f = allFlags[flagId];
    if (!f) return;
    if (!confirm(`Resolve the flag on "${f.itemName}"?`)) return;
    await db.ref('inventory_flags/' + flagId + '/status').set('resolved');
    await db.ref('inventory_flags/' + flagId + '/resolvedBy').set(currentUser.name);
    await db.ref('inventory_flags/' + flagId + '/resolvedAt').set(now());
    renderInventory();
    renderFlags();
    logAudit(currentUser.name, 'Resolve Flag', f.itemName);
    toast(`Flag on "${f.itemName}" resolved.`, 'success');
}

function viewFlagReport(flagId) {
    const f = allFlags[flagId];
    if (!f) return;
    const causesRows = (f.causes||[]).map(c => `
        <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${c.cause}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${c.likelihood}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${c.notes||'—'}</td>
        </tr>
    `).join('');
    const html = `<div class="issue-note">
        <div class="in-header">
            <div>
                <div class="in-title">DISCREPANCY REPORT</div>
                <div style="font-size:13px;color:#666;margin-top:4px;">${f.itemName} (${f.itemCode})</div>
            </div>
            <div class="in-meta"><div>FLAGGED: <strong>${fmtDate(f.flaggedAt)}</strong></div></div>
        </div>
        <div class="in-parties">
            <div class="in-party"><label>SYSTEM QTY:</label><div><strong>${fmtNum(f.systemQty)}</strong></div></div>
            <div class="in-party"><label>ACTUAL QTY:</label><div><strong>${fmtNum(f.actualQty)}</strong></div></div>
        </div>
        <div style="margin-bottom:16px;font-size:13px;">
            <strong>Variance:</strong> ${f.variance>0?'+':''}${fmtNum(f.variance)} &nbsp;|&nbsp; 
            <strong>Flagged by:</strong> ${f.flaggedBy}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
            <thead>
                <tr style="background:#000;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;">POSSIBLE CAUSE</th>
                    <th style="padding:8px 12px;text-align:left;font-size:12px;">LIKELIHOOD</th>
                    <th style="padding:8px 12px;text-align:left;font-size:12px;">NOTES</th>
                </tr>
            </thead>
            <tbody>${causesRows}</tbody>
        </table>
        <div style="font-size:13px;"><strong>Remarks:</strong> ${f.remarks||'—'}</div>
    </div>`;
    showPreviewModal('Discrepancy Report — ' + f.itemName, html);
}

// ── EXPORTS ──

function exportAuditExcel() {
    db.ref('audit_logs').once('value', snap => {
        const logs = snap.val() ? Object.values(snap.val()) : [];
        const data = [['Time','User','Action','Details']];
        logs.forEach(l => data.push([fmtDate(l.time),l.user,l.action,l.details]));
        downloadXLSX(data, 'Audit_Log');
    });
}