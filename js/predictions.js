// ─────────────────────────────────────────
// STOCKFLOW - PROFESSIONAL PREDICTION ENGINE
// ─────────────────────────────────────────

function renderPredictions() {
    const items = allInventory || {};
    const movements = allMovements || {};

    const usage = buildUsageByItem(movements);

    let totalStock = 0;
    const results = [];

    Object.keys(items).forEach(itemId => {
        const item = items[itemId];

        const history = usage[itemId] || [];
        const stock = item.qty || 0;

        totalStock += stock;

        // --- Forecast (Holt smoothing)
        const forecast = holtSmoothing(history, 3);

        const avgMonthly = average(history);
        const dailyUsage = avgMonthly / 30;

        const daysLeft = dailyUsage > 0 ? stock / dailyUsage : Infinity;

        const safetyStock = dailyUsage * 7 * 1.65;
        const reorderPoint = (dailyUsage * 14) + safetyStock;

        const risk =
            daysLeft < 30 ? "critical" :
            daysLeft < 90 ? "warning" : "safe";

        results.push({
            name: item.name,
            stock,
            forecast,
            avgMonthly,
            dailyUsage,
            daysLeft,
            reorderPoint,
            safetyStock,
            risk,
            confidence: getConfidence(history.length)
        });
    });

    // sort most critical first
    results.sort((a, b) => a.daysLeft - b.daysLeft);

    renderCards(results, totalStock);
    renderTable(results);
    renderChart(results);
}

// ─────────────────────────────
// BUILD ITEM USAGE
// ─────────────────────────────

function buildUsageByItem(movements) {
    const map = {};

    Object.values(movements)
        .filter(m => m.type === "Stock Out")
        .forEach(m => {
            const d = new Date(m.date);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;

            if (!map[m.itemId]) map[m.itemId] = {};
            map[m.itemId][key] =
                (map[m.itemId][key] || 0) + Math.abs(m.qty);
        });

    const result = {};
    Object.keys(map).forEach(id => {
        result[id] = Object.values(map[id]);
    });

    return result;
}

// ─────────────────────────────
// HOLT SMOOTHING (ACCURATE TREND MODEL)
// ─────────────────────────────

function holtSmoothing(data, steps = 3, alpha = 0.7, beta = 0.3) {
    if (!data || data.length === 0)
        return Array(steps).fill(0);

    let level = data[0];
    let trend = data.length > 1 ? data[1] - data[0] : 0;

    for (let i = 1; i < data.length; i++) {
        const value = data[i];
        const prev = level;

        level = alpha * value + (1 - alpha) * (level + trend);
        trend = beta * (level - prev) + (1 - beta) * trend;
    }

    const out = [];
    for (let i = 1; i <= steps; i++) {
        out.push(Math.max(0, level + i * trend));
    }

    return out;
}

// ─────────────────────────────
// METRICS
// ─────────────────────────────

function average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getConfidence(n) {
    if (n >= 12) return "High";
    if (n >= 6) return "Medium";
    if (n >= 3) return "Low";
    return "Very Low";
}

// ─────────────────────────────
// DASHBOARD CARDS
// ─────────────────────────────

function renderCards(results, totalStock) {
    const el = document.getElementById("pred-insight-cards");
    if (!el) return;

    const critical = results.filter(r => r.risk === "critical").length;
    const warning = results.filter(r => r.risk === "warning").length;

    const top = results[0];

    el.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Total Stock</div>
            <div class="stat-value">${fmtNum(totalStock)}</div>
            <div class="stat-sub">All inventory items</div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Critical Items</div>
            <div class="stat-value">${critical}</div>
            <div class="stat-sub">Require immediate action</div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Fastest Depletion</div>
            <div class="stat-value">${top?.name || "-"}</div>
            <div class="stat-sub">${Math.round(top?.daysLeft || 0)} days left</div>
        </div>
    `;
}

// ─────────────────────────────
// TABLE (PROFESSIONAL VIEW)
// ─────────────────────────────

function renderTable(results) {
    const tbody = document.getElementById("pred-tbody");
    if (!tbody) return;

    tbody.innerHTML = results.map(r => {

        const pill =
            r.risk === "critical"
                ? "red"
                : r.risk === "warning"
                ? "yellow"
                : "green";

        const label =
            r.risk === "critical"
                ? "Critical"
                : r.risk === "warning"
                ? "Warning"
                : "Stable";

        return `
        <tr>
            <td>${r.name}</td>

            <td class="td-mono">
                ${fmtNum(Math.round(r.forecast[0] || 0))}
            </td>

            <td class="td-mono">
                ${fmtNum(Math.max(0, r.stock - (r.forecast[0] || 0)))}
            </td>

            <td>${r.confidence}</td>

            <td>
                <span class="pill ${pill}">
                    ${label}
                </span>
            </td>
        </tr>`;
    }).join("");
}

function renderChart(results) {
    if (charts.prediction) {
        try { charts.prediction.destroy(); } catch(e) {}
    }

    const ctx = document.getElementById("chart-prediction");
    if (!ctx) return;

    const top = results.slice(0, 10);

    charts.prediction = new Chart(ctx, {
        type: "bar",
        data: {
            labels: top.map(r => r.name),
            datasets: [{
                label: "Next Month Demand",
                data: top.map(r => r.forecast[0]),
                backgroundColor: "rgba(45,75,122,.7)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { ticks: { color: "#5a6b8a" } },
                y: { ticks: { color: "#5a6b8a" }, beginAtZero: true }
            }
        }
    });
}