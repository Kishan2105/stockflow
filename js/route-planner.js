// ── ROUTE PLANNER ──

const RP_API = "http://127.0.0.1:5000";

let rpStations = [];
let rpRouteStationNames = [];
let rpRoadGeometry = [];
let rpRouteTotalM = 0;
let rpUgSegments = [];
let rpUgDrawMode = false;
let rpUgClickPt1 = null;
let rpRouteMarkers = [];
let rpRoutePolyline = null;
let rpUgPolylines = [];
let rpStationMarkers = {};
let rpMap = null;
let rpInitialized = false;

function rpInit() {
    if (!rpInitialized) {
        rpMap = L.map("rp-map", { zoomControl: true }).setView([-20.25, 57.55], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors", maxZoom: 18
        }).addTo(rpMap);
        rpBindEvents();
        rpLoadStations();
        rpInitialized = true;
    }
    setTimeout(() => rpMap && rpMap.invalidateSize(), 50);
}

function rpStatus(id, msg, cls = "") {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = "rp-status " + cls;
}

async function rpLoadStations() {
    try {
        const r = await fetch(RP_API + "/api/stations");
        rpStations = await r.json();
        rpRenderStations();
    } catch (err) {
        console.error("Failed to load stations:", err);
        rpStatus("rp-upload-status", "Failed to load stations. Make sure Flask server is running.", "err");
    }
}

function rpRenderStations() {
    const list = document.getElementById("rp-station-list");
    list.innerHTML = "";
    document.getElementById("rp-station-count").textContent = rpStations.length;
    rpStations.forEach(s => {
        const div = document.createElement("div");
        div.className = "rp-station-item";
        div.innerHTML = `<span class="rp-station-dot"></span>${s.name} <span style="color:var(--text3);font-size:10px;margin-left:auto">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</span>`;
        div.addEventListener("click", () => rpAddToRoute(s.name));
        list.appendChild(div);

        if (!rpStationMarkers[s.name]) {
            const m = L.circleMarker([s.lat, s.lon], {
                radius: 7, fillColor: "#2d4b7a", color: "#fff", weight: 2, fillOpacity: 1
            }).addTo(rpMap).bindTooltip(s.name, { permanent: false });
            m.on("click", () => rpAddToRoute(s.name));
            rpStationMarkers[s.name] = m;
        }
    });
}

function rpRenderRouteChain() {
    const el = document.getElementById("rp-route-chain");
    el.innerHTML = "";
    rpRouteStationNames.forEach((n, i) => {
        if (i > 0) {
            const arr = document.createElement("span");
            arr.className = "rp-chain-arrow";
            arr.textContent = "→";
            el.appendChild(arr);
        }
        const tag = document.createElement("span");
        tag.className = "rp-chain-tag";
        tag.textContent = n;
        el.appendChild(tag);
    });
}

function rpAddToRoute(name) {
    rpRouteStationNames.push(name);
    rpRenderRouteChain();
    if (rpRouteStationNames.length >= 2) rpComputeRoute();
}

function rpClearRoute() {
    rpRouteStationNames = [];
    rpRenderRouteChain();
    rpClearRouteLayer();
    rpClearUGSegments();
    rpStatus("rp-route-result", "");
    document.getElementById("rp-summary-panel").style.display = "none";
    document.getElementById("rp-ai-status").textContent = "";
}

function rpClearRouteLayer() {
    if (rpRoutePolyline) { rpMap.removeLayer(rpRoutePolyline); rpRoutePolyline = null; }
    rpRouteMarkers.forEach(m => rpMap.removeLayer(m));
    rpRouteMarkers = [];
    rpUgPolylines.forEach(p => rpMap.removeLayer(p));
    rpUgPolylines = [];
    rpRoadGeometry = [];
    rpRouteTotalM = 0;
    document.getElementById("rp-bar-wrap").style.display = "none";
    document.getElementById("rp-bar-labels").style.display = "none";
}

async function rpComputeRoute() {
    rpClearRouteLayer();
    try {
        const r = await fetch(RP_API + "/api/route", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ station_names: rpRouteStationNames })
        });
        const d = await r.json();
        if (d.error) { rpStatus("rp-route-result", d.error, "err"); return; }

        const lines = [];
        d.legs.forEach(l => lines.push(`${l.from} → ${l.to}: ${l.road_km ?? l.displacement_km} km`));
        let msg = lines.join(" | ");
        if (d.total_road_km) msg += `\nTotal: ${d.total_road_km} km (road)`;
        rpStatus("rp-route-result", msg, "ok");

        if (d.road_geometry && d.road_geometry.length) {
            rpRoadGeometry = d.road_geometry;
            rpRouteTotalM = (d.total_road_km || d.total_displacement_km) * 1000;

            rpRoutePolyline = L.polyline(rpRoadGeometry, { color: "#ff1e00", weight: 4, opacity: .8 }).addTo(rpMap);
            rpMap.fitBounds(rpRoutePolyline.getBounds(), { padding: [30, 30] });

            rpBuildRouteClickTargets();
            rpUpdateSummary();
        }
        if (d.road_error) rpStatus("rp-route-result", "Road routing failed: " + d.road_error, "warn");
    } catch (err) {
        rpStatus("rp-route-result", "Error computing route: " + err.message, "err");
    }
}

function rpBuildRouteClickTargets() {
    rpRouteMarkers.forEach(m => rpMap.removeLayer(m));
    rpRouteMarkers = [];

    const cum = rpBuildCum();
    rpRouteTotalM = cum[cum.length - 1];

    const step = 100;
    for (let dist = 0; dist <= rpRouteTotalM; dist += step) {
        const pt = rpInterpolatePt(cum, dist);
        const pct = (dist / rpRouteTotalM) * 100;
        const m = L.circleMarker(pt, {
            radius: 5, fillColor: "#c49b3a", color: "#fff", weight: 1.5,
            fillOpacity: 0, opacity: 0
        }).addTo(rpMap);
        m._routePct = pct;
        m._routeM   = dist;
        m.on("click", e => {
            L.DomEvent.stopPropagation(e);
            rpHandleRouteClick(pct, dist);
        });
        rpRouteMarkers.push(m);
    }

    rpRoutePolyline.on("click", e => {
        if (!rpUgDrawMode) return;
        const pt = [e.latlng.lat, e.latlng.lng];
        let best = 0, bestD = Infinity;
        for (let i = 0; i < rpRoadGeometry.length; i++) {
            const d = rpHaversineM(pt, rpRoadGeometry[i]);
            if (d < bestD) { bestD = d; best = i; }
        }
        const m = cum[best];
        const pct = (m / rpRouteTotalM) * 100;
        rpHandleRouteClick(pct, m);
    });
}

function rpBuildCum() {
    const cum = [0];
    for (let i = 1; i < rpRoadGeometry.length; i++) {
        cum.push(cum[i-1] + rpHaversineM(rpRoadGeometry[i-1], rpRoadGeometry[i]));
    }
    return cum;
}

function rpInterpolatePt(cum, targetM) {
    const geom = rpRoadGeometry;
    for (let i = 0; i < cum.length - 1; i++) {
        if (cum[i + 1] >= targetM) {
            const frac = (targetM - cum[i]) / (cum[i+1] - cum[i]);
            const lat = geom[i][0] + frac * (geom[i+1][0] - geom[i][0]);
            const lon = geom[i][1] + frac * (geom[i+1][1] - geom[i][1]);
            return [lat, lon];
        }
    }
    return geom[geom.length - 1];
}

function rpHaversineM(p1, p2) {
    const R = 6371000;
    const dLat = (p2[0] - p1[0]) * Math.PI / 180;
    const dLon = (p2[1] - p1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(p1[0]*Math.PI/180)*Math.cos(p2[0]*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function rpExitUGDraw() {
    rpUgDrawMode = false;
    rpUgClickPt1 = null;
    const btn = document.getElementById("rp-ug-draw-btn");
    btn.textContent = "Draw UG Section";
    btn.style.background = "rgba(196,155,58,.1)"; btn.style.color = "var(--warning)"; btn.style.border = "1px solid rgba(196,155,58,.3)";
    document.getElementById("rp-ug-banner").style.display = "none";
    rpRouteMarkers.forEach(m => m.setStyle({ fillOpacity: 0, opacity: 0 }));
}

function rpHandleRouteClick(pct, m) {
    if (!rpUgDrawMode) return;
    const banner = document.getElementById("rp-ug-banner");
    if (!rpUgClickPt1) {
        rpUgClickPt1 = { pct, m };
        banner.textContent = `Start: ${pct.toFixed(1)}% (${(m/1000).toFixed(2)} km) — now click end point`;
        rpRouteMarkers.forEach(mk => {
            if (Math.abs(mk._routePct - pct) < 0.5) mk.setStyle({ fillColor: "#2d4b7a", radius: 8 });
        });
    } else {
        const start = Math.min(rpUgClickPt1.pct, pct);
        const end   = Math.max(rpUgClickPt1.pct, pct);
        if (end - start < 0.5) { banner.textContent = "Too short — pick a wider range"; rpUgClickPt1 = null; return; }
        rpAddUGSegment(start, end);
        rpExitUGDraw();
    }
}

function rpAddUGSegment(start_pct, end_pct) {
    rpUgSegments.push({ start_pct, end_pct });
    rpUgSegments = rpMergeSegments(rpUgSegments);
    rpRenderUGSegments();
    rpUpdateSummary();
}

function rpMergeSegments(segs) {
    if (!segs.length) return [];
    segs = segs.slice().sort((a, b) => a.start_pct - b.start_pct);
    const merged = [segs[0]];
    for (let i = 1; i < segs.length; i++) {
        const last = merged[merged.length - 1];
        if (segs[i].start_pct <= last.end_pct) last.end_pct = Math.max(last.end_pct, segs[i].end_pct);
        else merged.push(segs[i]);
    }
    return merged;
}

function rpClearUGSegments() {
    rpUgSegments = [];
    rpUgPolylines.forEach(p => rpMap.removeLayer(p));
    rpUgPolylines = [];
    document.getElementById("rp-ug-list").innerHTML = "";
    document.getElementById("rp-bar-wrap").style.display = "none";
    document.getElementById("rp-bar-labels").style.display = "none";
}

function rpRenderUGSegments() {
    rpUgPolylines.forEach(p => rpMap.removeLayer(p));
    rpUgPolylines = [];

    const cum = rpBuildCum();
    rpUgSegments.forEach(seg => {
        const startM = seg.start_pct / 100 * rpRouteTotalM;
        const endM   = seg.end_pct   / 100 * rpRouteTotalM;
        const pts = rpExtractSegmentPts(cum, startM, endM);
        if (pts.length > 1) rpUgPolylines.push(L.polyline(pts, { color: "#2b7a4b", weight: 6, opacity: .9 }).addTo(rpMap));
    });

    const list = document.getElementById("rp-ug-list");
    list.innerHTML = "";
    rpUgSegments.forEach((seg, i) => {
        const startM = seg.start_pct / 100 * rpRouteTotalM;
        const endM   = seg.end_pct   / 100 * rpRouteTotalM;
        const lenM   = endM - startM;
        const div = document.createElement("div");
        div.className = "rp-ug-item";
        div.innerHTML = `<div><span class="rp-ug-label">UG ${i+1}</span>${seg.start_pct.toFixed(1)}% – ${seg.end_pct.toFixed(1)}% (${(lenM/1000).toFixed(2)} km)</div><button class="rp-ug-remove" data-i="${i}" title="Remove">✕</button>`;
        list.appendChild(div);
    });
    list.querySelectorAll(".rp-ug-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            rpUgSegments.splice(parseInt(btn.dataset.i), 1);
            rpRenderUGSegments();
            rpUpdateSummary();
        });
    });

    if (rpUgSegments.length) {
        const barWrap = document.getElementById("rp-bar-wrap");
        const barInner = document.getElementById("rp-bar-inner");
        barInner.innerHTML = "";
        rpUgSegments.forEach(seg => {
            const div = document.createElement("div");
            div.className = "rp-bar-ug";
            div.style.left  = seg.start_pct + "%";
            div.style.width = (seg.end_pct - seg.start_pct) + "%";
            barInner.appendChild(div);
        });
        barWrap.style.display = "block";
        document.getElementById("rp-bar-labels").style.display = "flex";
    } else {
        document.getElementById("rp-bar-wrap").style.display = "none";
        document.getElementById("rp-bar-labels").style.display = "none";
    }
}

function rpExtractSegmentPts(cum, startM, endM) {
    const pts = [];
    for (let i = 0; i < rpRoadGeometry.length; i++) {
        if (cum[i] >= startM && cum[i] <= endM) pts.push(rpRoadGeometry[i]);
    }
    const s = rpInterpolatePt(cum, startM);
    const e = rpInterpolatePt(cum, endM);
    if (!pts.length || rpHaversineM(pts[0], s) > 1) pts.unshift(s);
    if (!pts.length || rpHaversineM(pts[pts.length-1], e) > 1) pts.push(e);
    return pts;
}

function rpUpdateSummary() {
    if (!rpRoadGeometry.length || rpRouteTotalM === 0) {
        document.getElementById("rp-summary-panel").style.display = "none";
        return;
    }

    const cum = rpBuildCum();
    let totalOh = 0, totalUg = 0;
    for (let i = 0; i < cum.length - 1; i++) {
        const segLen = cum[i+1] - cum[i];
        const midPct = ((cum[i] / rpRouteTotalM) * 100 + (cum[i+1] / rpRouteTotalM) * 100) / 2;
        let isUg = false;
        for (const seg of rpUgSegments) {
            if (seg.start_pct <= midPct && midPct <= seg.end_pct) { isUg = true; break; }
        }
        if (isUg) totalUg += segLen; else totalOh += segLen;
    }

    const poleCount = Math.floor(totalOh / 50);
    const cable48f = rpRouteTotalM * 1.05;
    const cable12f = rpRouteTotalM * 0.15;
    const conduitUnits = totalUg > 0 ? Math.floor(totalUg / 6) + 1 : 0;
    const jointBoxes = rpUgSegments.length * 2;

    const poleCost = poleCount * 8500;
    const cable48fCost = cable48f * 850;
    const cable12fCost = cable12f * 450;
    const suspClampCost = (poleCount * 2) * 1200;
    const anchor48fCost = poleCount * 1800;
    const anchor12fCost = (poleCount * 0.5) * 1500;
    const bracketCost = poleCount * 800;
    const tespaCost = Math.max(1, Math.floor(poleCount / 10) + 1) * 3500;
    const buckleCost = (poleCount * 2) * 250;
    const conduitCost = conduitUnits * 1200;
    const jointBoxCost = jointBoxes * 3500;
    const laborCost = (totalOh * 150) + (totalUg * 450);

    const totalCost = poleCost + cable48fCost + cable12fCost + suspClampCost +
                      anchor48fCost + anchor12fCost + bracketCost + tespaCost +
                      buckleCost + conduitCost + jointBoxCost + laborCost;

    document.getElementById("rp-summary-panel").style.display = "block";
    document.getElementById("rp-summary-grid").innerHTML = `
        <span class="label">Total Distance</span><span class="value">${(rpRouteTotalM/1000).toFixed(2)} km</span>
        <span class="label">Overhead</span><span class="value amber">${(totalOh/1000).toFixed(2)} km</span>
        <span class="label">Underground</span><span class="value green">${(totalUg/1000).toFixed(2)} km</span>
        <span class="label">Poles (50m)</span><span class="value">${poleCount}</span>
        <span class="label">48F Cable</span><span class="value">${(cable48f/1000).toFixed(2)} km</span>
        <span class="label">12F Cable</span><span class="value">${(cable12f/1000).toFixed(2)} km</span>
        <span class="label">Conduit Units</span><span class="value">${conduitUnits}</span>
        <span class="label">Joint Boxes</span><span class="value">${jointBoxes}</span>
        <span class="label" style="font-weight:700;color:var(--accent)">Total Cost</span>
        <span class="value" style="font-size:13px;color:var(--accent);font-weight:700">MUR ${totalCost.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
    `;

    const equipmentItems = [
        { name: "48F Cable", qty: (cable48f/1000).toFixed(2), unit: "km" },
        { name: "12F Cable", qty: (cable12f/1000).toFixed(2), unit: "km" },
        { name: "Suspension Clamps", qty: poleCount * 2, unit: "units" },
        { name: "Anchor Clamps 48F", qty: poleCount, unit: "units" },
        { name: "Anchor Clamps 12F", qty: Math.round(poleCount * 0.5), unit: "units" },
        { name: "Universal Brackets", qty: poleCount, unit: "units" },
        { name: "TespaBand", qty: Math.max(1, Math.floor(poleCount / 10) + 1), unit: "rolls" },
        { name: "Buckles", qty: poleCount * 2, unit: "sets" },
    ];

    document.getElementById("rp-equipment-preview").innerHTML = equipmentItems
        .filter(item => item.qty > 0)
        .map(item => `<div class="rp-eq-item"><span>${item.name}</span><span>${item.qty} ${item.unit}</span></div>`)
        .join("");
}

function rpBindEvents() {
    document.getElementById("rp-upload-form").addEventListener("submit", async e => {
        e.preventDefault();
        const file = document.getElementById("rp-excel-file").files[0];
        if (!file) { rpStatus("rp-upload-status", "Choose a file first.", "err"); return; }
        const fd = new FormData();
        fd.append("file", file);
        try {
            const r = await fetch(RP_API + "/api/stations/upload", { method: "POST", body: fd });
            const d = await r.json();
            if (d.error) { rpStatus("rp-upload-status", d.error, "err"); return; }
            rpStations = d.stations;
            rpRenderStations();
            rpStatus("rp-upload-status", `Added ${d.added} station(s).`, "ok");
        } catch (err) {
            rpStatus("rp-upload-status", "Upload failed: " + err.message, "err");
        }
    });

    document.getElementById("rp-manual-form").addEventListener("submit", async e => {
        e.preventDefault();
        const body = {
            name: document.getElementById("rp-station-name").value,
            lat:  document.getElementById("rp-station-lat").value,
            lon:  document.getElementById("rp-station-lon").value,
        };
        try {
            const r = await fetch(RP_API + "/api/stations/manual", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
            const d = await r.json();
            if (d.error) { rpStatus("rp-upload-status", d.error, "err"); return; }
            rpStations = d;
            rpRenderStations();
            rpMap.setView([parseFloat(body.lat), parseFloat(body.lon)], Math.max(rpMap.getZoom(), 13));
            rpStatus("rp-upload-status", `Station "${body.name}" added.`, "ok");
        } catch (err) {
            rpStatus("rp-upload-status", "Failed to add station: " + err.message, "err");
        }
    });

    document.getElementById("rp-clear-stations").addEventListener("click", async () => {
        try {
            await fetch(RP_API + "/api/stations/clear", { method: "POST" });
            rpStations = [];
            Object.values(rpStationMarkers).forEach(m => rpMap.removeLayer(m));
            rpStationMarkers = {};
            rpClearRoute();
            rpRenderStations();
            rpStatus("rp-upload-status", "All stations cleared.", "ok");
        } catch (err) {
            rpStatus("rp-upload-status", "Failed to clear stations: " + err.message, "err");
        }
    });

    document.getElementById("rp-undo-station").addEventListener("click", () => {
        rpRouteStationNames.pop();
        rpRenderRouteChain();
        if (rpRouteStationNames.length >= 2) rpComputeRoute(); else rpClearRouteLayer();
    });

    document.getElementById("rp-clear-route").addEventListener("click", rpClearRoute);
    document.getElementById("rp-ug-clear").addEventListener("click", rpClearUGSegments);

    const ugDrawBtn = document.getElementById("rp-ug-draw-btn");
    ugDrawBtn.addEventListener("click", () => {
        if (!rpRoadGeometry.length) { rpStatus("rp-download-status", "Plot a route first.", "err"); return; }
        rpUgDrawMode = !rpUgDrawMode;
        const banner = document.getElementById("rp-ug-banner");
        if (rpUgDrawMode) {
            ugDrawBtn.textContent = "Cancel Draw";
            ugDrawBtn.style.background = "rgba(187,51,51,.08)"; ugDrawBtn.style.color = "var(--danger)"; ugDrawBtn.style.border = "1px solid rgba(187,51,51,.2)";
            banner.style.display = "block";
            banner.textContent = "UG Draw Mode — click first point on route";
            rpUgClickPt1 = null;
            rpRouteMarkers.forEach(m => m.setStyle({ fillOpacity: .9, opacity: 1, fillColor: "#c49b3a" }));
        } else {
            rpExitUGDraw();
        }
    });

    document.getElementById("rp-download-xlsx").addEventListener("click", async () => {
        if (!rpRoadGeometry.length || rpRouteStationNames.length < 2) {
            rpStatus("rp-download-status", "Plot a route first.", "err"); return;
        }
        rpStatus("rp-download-status", "Generating spreadsheet…", "");
        const body = {
            station_names: rpRouteStationNames,
            road_geometry: rpRoadGeometry,
            ug_segments: rpUgSegments.map(s => ({ start_pct: s.start_pct, end_pct: s.end_pct })),
        };
        try {
            const r = await fetch(RP_API + "/api/download-xlsx", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
            if (!r.ok) { const e = await r.json(); rpStatus("rp-download-status", e.error, "err"); return; }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `route_materials_${rpRouteStationNames[0]}_${rpRouteStationNames[rpRouteStationNames.length-1]}.xlsx`.replace(/\s+/g,"_");
            a.click();
            URL.revokeObjectURL(url);
            rpStatus("rp-download-status", "Download started!", "ok");
        } catch (err) {
            rpStatus("rp-download-status", "Error: " + err.message, "err");
        }
    });

    // AI Process button
    document.getElementById("rp-ai-process").addEventListener("click", rpProcessWithAI);
    
    // AI Download button
    document.getElementById("rp-download-ai").addEventListener("click", downloadAIReport);
}

// ── AI PROCESSING ──

async function rpProcessWithAI() {
    if (!rpRoadGeometry.length || rpRouteStationNames.length < 2) {
        rpStatus("rp-ai-status", "Please plot a route first.", "err");
        return;
    }
    
    rpStatus("rp-ai-status", "🤖 AI is analyzing your route... This may take a moment.", "ok");
    
    const body = {
        station_names: rpRouteStationNames,
        road_geometry: rpRoadGeometry,
        ug_segments: rpUgSegments.map(s => ({ start_pct: s.start_pct, end_pct: s.end_pct })),
    };
    
    try {
        const r = await fetch(RP_API + "/api/ai-process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        if (!r.ok) {
            const err = await r.json();
            rpStatus("rp-ai-status", "AI Error: " + (err.error || "Unknown error"), "err");
            return;
        }
        
        const data = await r.json();
        
        if (data.error) {
            rpStatus("rp-ai-status", "Error: " + data.error, "err");
            return;
        }
        
        // Show success message
        rpStatus("rp-ai-status", "✅ AI analysis complete! Click 'Download AI Report' to get the full report.", "ok");
        
        // Store AI data for download
        window._aiData = {
            station_names: rpRouteStationNames,
            summary: data.summary,
            equipment: data.equipment,
            poles: data.poles,
            ug_segments: rpUgSegments.map(s => ({ start_pct: s.start_pct, end_pct: s.end_pct })),
            report: data.report
        };
        
        // Show AI report preview
        showAIPreview(data.report, data.summary);
        
    } catch (err) {
        rpStatus("rp-ai-status", "Connection error: " + err.message, "err");
    }
}

function showAIPreview(report, summary) {
    const modal = document.getElementById('modal-preview');
    const title = document.getElementById('preview-title');
    title.textContent = '🤖 AI-Generated Project Report';
    
    const content = document.getElementById('preview-content');
    content.innerHTML = `
        <div style="padding:20px;font-family:'Inter',sans-serif;max-width:800px;margin:0 auto;line-height:1.6;">
            <div style="background:#f0f7ff;padding:16px;border-radius:8px;margin-bottom:20px;border-left:4px solid #2d4b7a;">
                <h3 style="margin:0 0 8px 0;color:#2d4b7a;">📊 Quick Summary</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
                    <div><strong>Total Distance:</strong> ${summary.total_distance_km.toFixed(2)} km</div>
                    <div><strong>Overhead:</strong> ${summary.oh_distance_km.toFixed(2)} km</div>
                    <div><strong>Underground:</strong> ${summary.ug_distance_km.toFixed(2)} km</div>
                    <div><strong>Poles:</strong> ${summary.pole_count}</div>
                    <div style="grid-column:1/-1;"><strong>Total Cost:</strong> MUR ${summary.total_cost_mur.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
                </div>
            </div>
            <div style="white-space:pre-wrap;font-size:13px;background:#f8f9fa;padding:16px;border-radius:8px;">
                ${report}
            </div>
            <div style="margin-top:16px;display:flex;gap:8px;">
                <button class="btn btn-accent btn-sm" onclick="downloadAIReport()">📥 Download AI Report (Excel)</button>
                <button class="btn btn-outline btn-sm" onclick="closeModal('modal-preview')">Close</button>
            </div>
        </div>
    `;
    
    modal.classList.add('open');
}

async function downloadAIReport() {
    if (!window._aiData) {
        toast('No AI data available. Run AI analysis first.', 'error');
        return;
    }
    
    rpStatus("rp-ai-status", "📥 Generating Excel download...", "");
    
    try {
        const r = await fetch(RP_API + "/api/ai-download-excel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(window._aiData)
        });
        
        if (!r.ok) {
            toast('Failed to generate report', 'error');
            return;
        }
        
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AI_Project_Report_${window._aiData.station_names[0]}_${window._aiData.station_names[window._aiData.station_names.length-1]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        
        rpStatus("rp-ai-status", "✅ Report downloaded successfully!", "ok");
    } catch (err) {
        toast('Download failed: ' + err.message, 'error');
    }
}