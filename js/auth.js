// ── AUTH ──

async function doLogin() {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const pass  = document.getElementById('auth-pass').value.trim();
    if (!email || !pass) { 
        toast('Enter email and password', 'error'); 
        return; 
    }

    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
        currentUser = { email, name:'Admin User', uid:'admin-001', role:'admin' };
        initApp();
        return;
    }

    toast('Invalid credentials. Use admin@company.com / admin123', 'error');
}

function doLogout() {
    currentUser = null;
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-pass').value = '';
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    const sidebar = document.getElementById('sidebar');
    if (sidebar) { sidebar.classList.remove('open'); }
    destroyCharts();
    location.reload();
}