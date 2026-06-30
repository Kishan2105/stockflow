// ── STATE ──
let currentUser = null;
let allInventory = {};
let allMovements = {};
let allNotifs = [];
let allFlags = {};
let allLocations = {};
let allMonthlyReports = {};  // ← ADD THIS
let charts = {};

// ── ADMIN CREDENTIALS ──
const ADMIN_EMAIL = 'admin@company.com';
const ADMIN_PASS  = 'admin123';

// ── APP INIT ──

// js/app.js - Make sure this part is correct

async function initApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-avatar').textContent = currentUser.name[0].toUpperCase();
    document.getElementById('sidebar-role').textContent = 'Administrator';
    buildNav();

    try {
        const [invSnap, mvSnap, flagSnap, locSnap, reportSnap] = await Promise.all([
            db.ref('inventory').once('value'),
            db.ref('stock_movements').once('value'),
            db.ref('inventory_flags').once('value'),
            db.ref('locations').once('value'),
            db.ref('monthly_reports').once('value')  // ← ADD THIS
        ]);
        
        allInventory = invSnap.val() || {};
        allMovements = mvSnap.val() || {};
        allFlags = flagSnap.val() || {};
        allLocations = locSnap.val() || {};
        allMonthlyReports = reportSnap.val() || {};  // ← ADD THIS
        
        console.log('✅ Monthly reports loaded:', Object.keys(allMonthlyReports).length);
        
        if (!Object.keys(allInventory).length) {
            await seedDemoData();
            const newInvSnap = await db.ref('inventory').once('value');
            allInventory = newInvSnap.val() || {};
        }
    } catch(e) { 
        console.error('Error loading data:', e);
        toast('Error loading data from Firebase.', 'error');
    }

    subscribeData();
    navigate('dashboard');
}

function subscribeData() {
    // Real-time updates for inventory
    db.ref('inventory').on('value', snap => { 
        allInventory = snap.val() || {}; 
        refreshDashboardIfActive(); 
        if (document.getElementById('page-inventory').classList.contains('active')) renderInventory(); 
    });
    
    // Real-time updates for stock movements
    db.ref('stock_movements').on('value', snap => { 
        allMovements = snap.val() || {}; 
        refreshDashboardIfActive(); 
        if (document.getElementById('page-movements').classList.contains('active')) renderMovements(); 
    });
    
    // Real-time updates for flags
    db.ref('inventory_flags').on('value', snap => {
        allFlags = snap.val() || {};
        if (document.getElementById('page-inventory').classList.contains('active')) renderInventory();
        if (document.getElementById('page-reports').classList.contains('active')) renderReports();
    });
    
    // Real-time updates for locations
    db.ref('locations').on('value', snap => { 
        allLocations = snap.val() || {}; 
    });
    
    // Real-time updates for notifications
    db.ref('notifications/admin').on('value', snap => {
        allNotifs = snap.val() ? Object.values(snap.val()) : [];
        updateNotifBadge();
    });
}

function buildNav() {
    const navItems = [
        { section:'Overview' },
        { id:'dashboard', label:'Dashboard' },
        { section:'Inventory' },
        { id:'inventory', label:'Inventory' },
        { id:'movements', label:'Stock Movements' },
        { section:'Reports' },
        { id:'reports', label:'Audit' },
        { id:'predictions', label:'Predictions' },
        { section:'Planning' },
        { id:'route-planner', label:'Route Planner' },
    ];
    const nav = document.getElementById('main-nav');
    nav.innerHTML = navItems.map(i => {
        if (i.section) return `<div class="nav-section">${i.section}</div>`;
        return `<div class="nav-item" data-page="${i.id}" onclick="navigate('${i.id}')"><span>${i.label}</span></div>`;
    }).join('');
}

function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    const titles = { 
        dashboard:'Dashboard', 
        inventory:'Inventory', 
        movements:'Stock Movements', 
        reports:'Reports & Audit', 
        predictions:'Predictions', 
        'route-planner':'Route Planner' 
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    
    if (page === 'dashboard') renderDashboard();
    if (page === 'inventory') renderInventory();
    if (page === 'movements') renderMovements();
    if (page === 'reports') renderReports();
    if (page === 'predictions') renderPredictions();
    if (page === 'route-planner') rpInit();
    
    if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.remove("open");
    }
}

function subscribeData() {
    db.ref('inventory').on('value', snap => { 
        allInventory = snap.val() || {}; 
        refreshDashboardIfActive(); 
        if (document.getElementById('page-inventory').classList.contains('active')) renderInventory(); 
    });
    
    db.ref('stock_movements').on('value', snap => { 
        allMovements = snap.val() || {}; 
        refreshDashboardIfActive(); 
        if (document.getElementById('page-movements').classList.contains('active')) renderMovements(); 
    });
    
    db.ref('inventory_flags').on('value', snap => {
        allFlags = snap.val() || {};
        if (document.getElementById('page-inventory').classList.contains('active')) renderInventory();
    });
    
    db.ref('locations').on('value', snap => { 
        allLocations = snap.val() || {}; 
    });
    
    db.ref('notifications/admin').on('value', snap => {
        allNotifs = snap.val() ? Object.values(snap.val()) : [];
        updateNotifBadge();
    });
}

function refreshDashboardIfActive() {
    if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}


async function seedDemoData() {
    const items = {
        'itm-001': { 
            id:'itm-001', code:'CBL-48F', name:'48F cable', category:'Cable', 
            unit:'m', qty:208498, minLevel:5000, cost:28.09, 
            supplier:'CableCo', dateAdded: now(), lastUpdated: now() 
        },
        'itm-002': { 
            id:'itm-002', code:'CBL-12F', name:'12F cable', category:'Cable', 
            unit:'m', qty:145067, minLevel:3000, cost:9.43, 
            supplier:'CableCo', dateAdded: now(), lastUpdated: now() 
        },
        'itm-003': { 
            id:'itm-003', code:'CLP-SUS', name:'Suspension clamp', category:'Clamp', 
            unit:'unit', qty:3876, minLevel:200, cost:237.52, 
            supplier:'ClampPro', dateAdded: now(), lastUpdated: now() 
        },
        'itm-004': { 
            id:'itm-004', code:'CLP-A48', name:'Anchor clamp - 48F cable', category:'Clamp', 
            unit:'unit', qty:800, minLevel:100, cost:145.57, 
            supplier:'ClampPro', dateAdded: now(), lastUpdated: now() 
        },
        'itm-005': { 
            id:'itm-005', code:'CLP-A12', name:'Anchor clamp - 12F cable', category:'Clamp', 
            unit:'unit', qty:5700, minLevel:200, cost:68.65, 
            supplier:'ClampPro', dateAdded: now(), lastUpdated: now() 
        },
        'itm-006': { 
            id:'itm-006', code:'BKT-UPB', name:'Universal Pole Bracket', category:'Bracket', 
            unit:'unit', qty:7200, minLevel:300, cost:72.16, 
            supplier:'MetalWorks', dateAdded: now(), lastUpdated: now() 
        },
        'itm-007': { 
            id:'itm-007', code:'BND-TSP', name:'TespaBand', category:'Band', 
            unit:'unit', qty:223, minLevel:50, cost:1675.00, 
            supplier:'BandCo', dateAdded: now(), lastUpdated: now() 
        },
        'itm-008': { 
            id:'itm-008', code:'BCK-STD', name:'Buckles', category:'Fastener', 
            unit:'unit', qty:7200, minLevel:500, cost:6.90, 
            supplier:'BandCo', dateAdded: now(), lastUpdated: now() 
        }
    };
    
    await db.ref('inventory').set(items);
    
    // Add some sample movements
    const movements = {
        'mv-001': { 
            id:'mv-001', date: now(), itemId:'itm-001', itemName:'48F cable', 
            qty:500, unit:'m', type:'Stock Out', 
            user:'Admin User', remarks:'Project A', ref:'PO-123' 
        },
        'mv-002': { 
            id:'mv-002', date: new Date(Date.now() - 86400000).toISOString(), 
            itemId:'itm-002', itemName:'12F cable', 
            qty:300, unit:'m', type:'Stock Out', 
            user:'Admin User', remarks:'Project B', ref:'PO-124' 
        }
    };
    await db.ref('stock_movements').set(movements);
    
    logAudit('System', 'Seed', 'Demo data seeded');
    toast('Demo data loaded!', 'success');
}

// ── AUDIT LOG ──

async function logAudit(user, action, details) {
    const id = 'log-' + tsId();
    await db.ref('audit_logs/' + id).set({ id, time:now(), user, action, details });
}

function subscribeData() {
    db.ref('inventory').on('value', snap => { 
        allInventory = snap.val() || {}; 
        refreshDashboardIfActive(); 
        if (document.getElementById('page-inventory').classList.contains('active')) renderInventory(); 
    });
    
    db.ref('stock_movements').on('value', snap => { 
        allMovements = snap.val() || {}; 
        refreshDashboardIfActive(); 
        if (document.getElementById('page-movements').classList.contains('active')) renderMovements(); 
    });
    
    db.ref('inventory_flags').on('value', snap => {
        allFlags = snap.val() || {};
        if (document.getElementById('page-inventory').classList.contains('active')) renderInventory();
    });
    
    db.ref('locations').on('value', snap => { 
        allLocations = snap.val() || {}; 
    });
    
    db.ref('notifications/admin').on('value', snap => {
        allNotifs = snap.val() ? Object.values(snap.val()) : [];
        updateNotifBadge();
    });
    
    // ── ADD THIS ──
    db.ref('monthly_reports').on('value', snap => {
        allMonthlyReports = snap.val() || {};
        // Refresh reports page if active
        if (document.getElementById('page-reports').classList.contains('active')) {
            renderContractorReports();
        }
    });
}