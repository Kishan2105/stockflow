// ── NOTIFICATIONS ──

async function addNotif(icon, title, msg) {
    const id = 'notif-' + tsId();
    await db.ref('notifications/admin/' + id).set({ id, icon, title, msg, time:now(), read:false });
}

function updateNotifBadge() {
    const unread = allNotifs.filter(n=>!n.read).length;
    document.getElementById('notif-count').textContent = unread;
    const list = document.getElementById('notif-list');
    if (!list) return;
    list.innerHTML = allNotifs.length 
        ? allNotifs.slice(-10).reverse().map(n => 
            `<div class="notif-item">
                <div class="notif-icon">${n.icon||''}</div>
                <div class="notif-msg"><strong>${n.title||''}</strong>${n.msg||''}</div>
            </div>`
          ).join('') 
        : '<div style="padding:14px;text-align:center;font-size:13px;color:var(--text2);">No notifications</div>';
}

function toggleNotifs(el) {
    const panel = document.getElementById('notif-panel');
    panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}

function clearNotifs(e) {
    e.stopPropagation();
    db.ref('notifications/admin').remove();
    document.getElementById('notif-panel').style.display = 'none';
}

document.addEventListener('click', e => {
    if (!e.target.closest('.notif-badge')) {
        const p = document.getElementById('notif-panel');
        if (p) p.style.display = 'none';
    }
});