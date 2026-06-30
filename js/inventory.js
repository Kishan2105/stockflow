// ── INVENTORY ──

function renderInventory() {
    const q = (document.getElementById('inv-search')?.value || '').toLowerCase();
    const items = Object.values(allInventory).filter(i => 
        !q || i.name.toLowerCase().includes(q) || (i.category||'').toLowerCase().includes(q)
    );
    const tbody = document.getElementById('inv-tbody');
    if (!tbody) return;

    // Alerts
    const alerts = document.getElementById('inv-alerts');
    if (alerts) {
        const low = items.filter(i => i.qty <= i.minLevel && i.qty > 0);
        const out = items.filter(i => i.qty <= 0);
        alerts.innerHTML = '';
        if (out.length) alerts.innerHTML += `<div class="alert alert-warn">${out.length} item(s) are out of stock.</div>`;
        if (low.length) alerts.innerHTML += `<div class="alert alert-info">${low.length} item(s) are below minimum stock level.</div>`;
    }

    if (!items.length) { 
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No items found.</td></tr>'; 
        return; 
    }

    tbody.innerHTML = items.map(i => {
        const status = i.qty <= 0 ? '<span class="pill red">Out of Stock</span>' : 
                       i.qty <= i.minLevel ? '<span class="pill yellow">Low Stock</span>' : 
                       '<span class="pill green">In Stock</span>';
        const openFlag = allFlags && Object.values(allFlags).find(f => f.itemId === i.id && f.status === 'open');
        const flagged = !!openFlag;
        const flagBtn = flagged
            ? `<button class="btn btn-sm" style="background:rgba(187,51,51,.08);color:var(--danger);border:1px solid rgba(187,51,51,.2);" onclick="resolveFlag('${openFlag.id}')">Resolve Flag</button>`
            : `<button class="btn btn-sm" style="background:rgba(196,155,58,.08);color:var(--warning);border:1px solid rgba(196,155,58,.2);" onclick="openFlagModal('${i.id}')">Flag</button>`;
        return `<tr>
            <td>${i.name}</td>
            <td>${i.location?`<span class="pill teal">${i.location}</span>`:'<span style="color:var(--text3);">—</span>'}</td>
            <td>${i.unit||''}</td>
            <td class="td-mono">${fmtNum(i.qty)}</td>
            <td class="td-mono">Rs ${fmtNum(i.cost||0)}</td>
            <td>${status}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-outline btn-sm" onclick="openItemModal('${i.id}')">Edit</button> 
                <button class="btn btn-danger btn-sm" onclick="deleteItem('${i.id}')">Del</button> 
                ${flagBtn}
            </td>
        </tr>`;
    }).join('');
}

function openItemModal(id) {
    const modal = document.getElementById('modal-item');
    document.getElementById('item-modal-title').textContent = id ? 'Edit Item' : 'Add Item';
    modal._editId = id || null;
    modal._origQty = null;

    populateLocationDropdown();
    document.getElementById('fi-location-new').style.display = 'none';
    document.getElementById('fi-location-new').value = '';

    if (id && allInventory[id]) {
        const i = allInventory[id];
        setF('fi-name', i.name); 
        setF('fi-unit', i.unit||'unit'); 
        setF('fi-qty', i.qty); 
        setF('fi-min', i.minLevel||0); 
        setF('fi-cost', i.cost||0); 
        setF('fi-supplier', i.supplier||'');
        setF('fi-location', i.location||'');
        modal._origQty = i.qty;
    } else {
        ['fi-name','fi-qty','fi-min','fi-cost','fi-supplier','fi-location'].forEach(id => setF(id,''));
    }
    modal.classList.add('open');
}

function populateLocationDropdown() {
    const sel = document.getElementById('fi-location');
    const current = sel.value;
    const base = ['Vacoas','La Tour Koenig','Ebène'];
    const custom = Object.values(allLocations).map(l => l.name).filter(n => !base.includes(n));
    let html = '<option value="">— Select Location —</option>';
    base.forEach(b => html += `<option value="${b}">${b}</option>`);
    custom.forEach(c => html += `<option value="${c}">${c}</option>`);
    html += '<option value="__add_new__">+ Add New Location…</option>';
    sel.innerHTML = html;
    if (current) sel.value = current;
}

function handleLocationChange() {
    const sel = document.getElementById('fi-location');
    const newInput = document.getElementById('fi-location-new');
    if (sel.value === '__add_new__') {
        newInput.style.display = 'block';
        newInput.focus();
    } else {
        newInput.style.display = 'none';
    }
}

async function saveItem() {
    const modal = document.getElementById('modal-item');
    const id = modal._editId || 'itm-' + tsId();
    const isEdit = !!modal._editId;

    let location = getF('fi-location');
    if (location === '__add_new__') {
        location = getF('fi-location-new').trim();
        if (!location) { toast('Please type a new location name', 'error'); return; }
        const locId = 'loc-' + tsId();
        await db.ref('locations/' + locId).set({ id:locId, name:location, addedBy:currentUser.name, createdAt:now() });
    }

    const item = { 
        id, 
        name: getF('fi-name'), 
        location, 
        unit: getF('fi-unit'), 
        qty: +getF('fi-qty'), 
        minLevel: +getF('fi-min'), 
        cost: +getF('fi-cost'), 
        supplier: getF('fi-supplier'), 
        lastUpdated: now() 
    };
    if (!item.name) { toast('Item name required', 'error'); return; }

    if (!isEdit) {
        item.dateAdded = now();
        await db.ref('inventory/' + id).set(item);
        if (item.qty > 0) {
            await recordMovement(id, item.name, item.qty, item.unit, 'Stock In', `Added by ${currentUser.name}`, '');
        }
        checkLowStock(item);
        closeModal('modal-item');
        renderInventory();
        logAudit(currentUser.name, 'Add Item', item.name);
        toast(`Item "${item.name}" added.`, 'success');
        return;
    }

    const origQty = modal._origQty;
    const qtyChanged = origQty !== null && origQty !== item.qty;

    await db.ref('inventory/' + id).set(item);
    if (qtyChanged) {
        const diff = item.qty - origQty;
        const moveType = diff > 0 ? 'Stock In' : 'Stock Out';
        await recordMovement(id, item.name, diff, item.unit, moveType, `Edited by ${currentUser.name}`, '');
    }
    checkLowStock(item);
    closeModal('modal-item');
    renderInventory();
    logAudit(currentUser.name, 'Edit Item', item.name);
    toast(`"${item.name}" updated.`, 'success');
}

async function deleteItem(id) {
    const item = allInventory[id];
    if (!item) return;
    if (!confirm(`Delete "${item.name}" and all its stock movement records? This cannot be undone.`)) return;
    await db.ref('inventory/' + id).remove();
    const mvSnap = await db.ref('stock_movements').orderByChild('itemId').equalTo(id).once('value');
    if (mvSnap.val()) {
        const updates = {};
        Object.keys(mvSnap.val()).forEach(k => { updates[k] = null; });
        await db.ref('stock_movements').update(updates);
    }
    renderInventory();
    renderMovements();
    logAudit(currentUser.name, 'Delete Item', item.name);
    toast(`"${item.name}" deleted.`, 'success');
}

// ── STOCK MOVEMENT RECORD ──

async function recordMovement(itemId, itemName, qty, unit, type, remarks, ref) {
    const id = 'mv-' + tsId();
    const mv = { 
        id, date:now(), itemId, itemName, qty, unit, type, 
        user:currentUser?.name||'System', 
        remarks:remarks||'', 
        ref:ref||'' 
    };
    await db.ref('stock_movements/' + id).set(mv);
}

// ── LOW STOCK ALERT ──

function checkLowStock(item) {
    if (item.qty <= (item.minLevel||0)) {
        addNotif('', 'Low Stock Alert', `${item.name} is at ${item.qty} ${item.unit}`);
    }
}