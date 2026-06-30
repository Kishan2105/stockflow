// ── DASHBOARD ──

function renderDashboard() {
    const inv = Object.values(allInventory);
    const totalItems = inv.length;
    const lowStock = inv.filter(i => i.qty <= i.minLevel && i.qty > 0).length;
    const outOfStock = inv.filter(i => i.qty <= 0).length;
    const totalValue = inv.reduce((s, i) => s + (i.qty * i.cost), 0);

    document.getElementById('dash-stats').innerHTML = `
        <div class="stat-card"><div class="stat-label">Total Items</div><div class="stat-value">${totalItems}</div><div class="stat-sub">in inventory</div></div>
        <div class="stat-card"><div class="stat-label">Low Stock</div><div class="stat-value">${lowStock}</div><div class="stat-sub">below min level</div></div>
        <div class="stat-card"><div class="stat-label">Out of Stock</div><div class="stat-value">${outOfStock}</div><div class="stat-sub">need restocking</div></div>
        <div class="stat-card"><div class="stat-label">Total Stock Value</div><div class="stat-value">Rs ${fmtNum(totalValue)}</div><div class="stat-sub">across ${totalItems} items</div></div>
    `;

    renderCharts();
    renderActivity();
}

function renderCharts() {
    destroyCharts();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const chartOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color:'#5a6b8a', font:{size:10} } } },
        scales: {
            x: { ticks:{ color:'#5a6b8a' }, grid:{ color:'rgba(0,0,0,.04)' } },
            y: { ticks:{ color:'#5a6b8a' }, grid:{ color:'rgba(0,0,0,.04)' } }
        }
    };

    // Stock Movement Chart
    document.getElementById('chart1-title').textContent = 'Stock Movement (Monthly)';
    const mvs = Object.values(allMovements);
    const inData = new Array(12).fill(0);
    const outData = new Array(12).fill(0);
    mvs.forEach(m => {
        const mo = new Date(m.date).getMonth();
        if (m.type === 'Stock In') inData[mo] += Math.abs(m.qty);
        else if (m.type === 'Stock Out') outData[mo] += Math.abs(m.qty);
    });
    const ctx1 = document.getElementById('chart-movement');
    if (ctx1) {
        charts.movement = new Chart(ctx1, {
            type:'bar',
            data:{ labels:months, datasets:[
                { label:'Stock In',  data:inData,  backgroundColor:'rgba(45,75,122,.5)', borderRadius:4 },
                { label:'Stock Out', data:outData, backgroundColor:'rgba(187,51,51,.4)', borderRadius:4 }
            ]},
            options: chartOpts
        });
    }

    // Stock Value by Category Chart
    document.getElementById('chart2-title').textContent = 'Stock Value by Category';
    const categories = {};
    Object.values(allInventory).forEach(i => {
        const cat = i.category || 'Uncategorized';
        categories[cat] = (categories[cat] || 0) + (i.qty * i.cost);
    });
    const catLabels = Object.keys(categories);
    const catData = Object.values(categories);
    const ctx2 = document.getElementById('chart-contractor');
    if (ctx2) {
        charts.contractor = new Chart(ctx2, {
            type:'doughnut',
            data:{ labels: catLabels.length ? catLabels : ['No data'], datasets:[{
                data: catData.length && catData.some(v=>v>0) ? catData : [1],
                backgroundColor:['#2d4b7a','#3a7b6b','#c44a4a','#c49b3a','#8a9bb8','#5a6b8a'],
                borderWidth:0
            }]},
            options:{ 
                responsive:true, maintainAspectRatio:false, 
                plugins:{ legend:{ position:'right', labels:{ color:'#5a6b8a', font:{size:10}, padding:10 } }}
            }
        });
    }
}

function renderActivity() {
    const acts = [];
    Object.values(allMovements).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10).forEach(m =>
        acts.push({ 
            color: m.type==='Stock In'?'#3a7b6b':'#c44a4a', 
            text:`${m.type}: <strong>${m.itemName}</strong> — ${Math.abs(m.qty)} ${m.unit||''}`, 
            time: fmtDate(m.date) 
        })
    );
    Object.values(allFlags).sort((a,b)=>new Date(b.flaggedAt)-new Date(a.flaggedAt)).slice(0,3).forEach(f =>
        acts.push({ 
            color:'#c49b3a', 
            text:`Discrepancy flagged for <strong>${f.itemName}</strong> — ${f.variance>0?'+':''}${fmtNum(f.variance)} variance`, 
            time: fmtDate(f.flaggedAt) 
        })
    );

    const ra = document.getElementById('recent-activity');
    if (!ra) return;
    ra.innerHTML = acts.length
        ? acts.slice(0,12).map(a => 
            `<div class="activity-item">
                <div class="activity-dot" style="background:${a.color}"></div>
                <div class="activity-text">${a.text}</div>
                <div class="activity-time">${a.time}</div>
            </div>`
          ).join('')
        : '<div style="padding:24px;text-align:center;color:var(--text2);font-size:13px;">No recent activity.</div>';
}

function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
    charts = {};
}