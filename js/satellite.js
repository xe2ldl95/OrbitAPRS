const MIN_PER_DAY = 1440.0;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const C = 299792.458;
const RE = 6378.137;

let satelliteDB = [{
    id: 'terrestrial', noradId: null,
    name: 'TERRESTRIAL',
    freq: 144.390, freqRX: 144.390, type: 'terrestrial',
    color: '#aaaaaa',
}, {
    id: 'iss', noradId: 25544,
    name: 'ISS (ZARYA)',
    freq: 145.825, freqRX: 145.825, type: 'digipeater',
    tle1: '1 25544U 98067A   26147.48616587  .00011670  00000+0  21638-3 0  9992',
    tle2: '2 25544  51.6335  42.5815 0007385 103.6638 256.5173 15.49418251568547',
    color: '#f0a030',
}, {
    id: 'no44', noradId: 26931,
    name: 'NO-44 (PCSAT)',
    freq: 145.825, freqRX: 145.825, type: 'digipeater',
    tle1: '1 26931U 01043C   26113.27924769  .00000012  00000+0  12345-4 0  9991',
    tle2: '2 26931  67.0510  234.5678 0005678 123.4567 236.5432 14.56789012345678',
    color: '#e74c3c',
}, {
    id: 'io86', noradId: 40931,
    name: 'IO-86 (LAPAN-A2)',
    freq: 145.825, freqRX: 145.825, type: 'digipeater',
    tle1: '1 40931U 00000    26113.27924769  .00000000  00000-0 -12415-2 0    05',
    tle2: '2 40931   5.9991 202.7929 0013599 303.9407 277.3096 14.79194073 25596',
    color: '#1abc9c',
}, {
    id: 'sonate2', noradId: 59112,
    name: 'SONATE-2',
    freq: 145.825, freqRX: 145.825, type: 'digipeater',
    tle1: '1 59112U 24043Q   26133.37741957  .00025296  00000-0  36180-3 0  9994',
    tle2: '2 59112  97.5493 281.7198 0005913 330.7378  29.3544 15.56195234122476',
    color: '#3b9fd4',
}];

const _satrecCache = new Map();

function getJulianDate(date) {
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
    const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    let Y = y, M = m;
    if (M <= 2) { Y--; M += 12; }
    const A = Math.floor(Y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + h / 24 + B - 1524.5;
}

function dayOfYearToJD(year, doy, frac) {
    const y = year - 1;
    const days = 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
    return 1721425.5 + days + doy - 1 + frac;
}

function initSGP4(sat) {
    const key = sat.id + sat.tle1.slice(18, 32);
    if (_satrecCache.has(key)) return _satrecCache.get(key);
    const satrec = window.satellite.twoline2satrec(sat.tle1, sat.tle2);
    const epochStr = sat.tle1.substring(18, 32).trim();
    const epochYear = parseInt(epochStr.slice(0, 2), 10) + (parseInt(epochStr.slice(0, 2), 10) < 57 ? 2000 : 1900);
    const epochDay = parseFloat(epochStr.slice(2));
    const epochJD = dayOfYearToJD(epochYear, Math.floor(epochDay), epochDay - Math.floor(epochDay));
    const ctx = { satrec, epochJD, sat };
    _satrecCache.set(key, ctx);
    return ctx;
}

function propagateSGP4(ctx, tsince) {
    const result = window.satellite.sgp4(ctx.satrec, tsince);
    if (!result || !result.position || result.position.x === null || isNaN(result.position.x)) {
        return null;
    }
    return {
        eciPos: [result.position.x, result.position.y, result.position.z],
        eciVel: [result.velocity.x, result.velocity.y, result.velocity.z],
        jdProp: ctx.epochJD + tsince / MIN_PER_DAY,
    };
}

function eciToGeodetic(pos, jd) {
    const gmst = window.satellite.gstime(jd);
    const { latitude, longitude, height } = window.satellite.eciToGeodetic(
        { x: pos[0], y: pos[1], z: pos[2] }, gmst
    );
    return { lat: latitude * RAD, lon: longitude * RAD, alt: height };
}

function eciToObserverECI(obsLat, obsLon, obsAlt, jd) {
    const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) * DEG;
    const lat = obsLat * DEG;
    const lon = obsLon * DEG;
    const theta = gmst + lon;
    const e2 = 0.00669437999014;
    const sinlat = Math.sin(lat);
    const N = RE / Math.sqrt(1 - e2 * sinlat * sinlat);
    const r = (N + obsAlt / 1000) * Math.cos(lat);
    const z = (N * (1 - e2) + obsAlt / 1000) * sinlat;
    return [
        r * Math.cos(theta),
        r * Math.sin(theta),
        z,
    ];
}

function calculateElevation(satPos, obsECI) {
    const dx = satPos[0] - obsECI[0];
    const dy = satPos[1] - obsECI[1];
    const dz = satPos[2] - obsECI[2];
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const obsDist = Math.sqrt(obsECI[0] * obsECI[0] + obsECI[1] * obsECI[1] + obsECI[2] * obsECI[2]);
    const satDist = Math.sqrt(satPos[0] * satPos[0] + satPos[1] * satPos[1] + satPos[2] * satPos[2]);
    const cosZenith = (dx * obsECI[0] + dy * obsECI[1] + dz * obsECI[2]) / (range * obsDist);
    const elevation = 90 - Math.acos(cosZenith) * RAD;
    return elevation;
}

function estimateNextPass(sat, jd, lat, lon, alt) {
    alt = alt || 0;
    const ctx = initSGP4(sat);
    const tsince = (jd - ctx.epochJD) * MIN_PER_DAY;
    const prop = propagateSGP4(ctx, tsince);
    if (!prop) return { inPass: false, minutesToNext: 9999, elevation: -90 };

    const obsECI = eciToObserverECI(lat, lon, alt, jd);
    const el = calculateElevation(prop.eciPos, obsECI);
    const inPass = el > 0;

    let minToNext = 9999;
    if (!inPass) {
        // Phase 1: coarse scan (2-minute steps, up to 10 hours)
        let coarseMin = 9999;
        for (let m = 1; m < 600; m += 2) {
            const t = tsince + m;
            if (t < -180) continue;
            const p = propagateSGP4(ctx, t);
            if (!p) continue;
            const e = calculateElevation(p.eciPos, eciToObserverECI(lat, lon, alt, p.jdProp));
            if (e > 0) { coarseMin = m; break; }
        }
        // Phase 2: fine scan (10-second steps around coarse hit)
        if (coarseMin < 9999) {
            const fineStart = Math.max(0, (coarseMin - 2) * 60);
            const fineEnd = (coarseMin + 2) * 60;
            for (let s = fineStart; s <= fineEnd; s += 10) {
                const t = tsince + s / 60;
                if (t < -180) continue;
                const p = propagateSGP4(ctx, t);
                if (!p) continue;
                const e = calculateElevation(p.eciPos, eciToObserverECI(lat, lon, alt, p.jdProp));
                if (e > 0) { minToNext = s / 60; break; }
            }
        }
    }
    return { inPass, minutesToNext: Math.min(minToNext, 9999), elevation: el };
}

function refreshSatPasses() {
    if (state.selectedSat) {
        const selSat = satelliteDB.find(s => s.id === state.selectedSat);
        if (selSat) {
            if (selSat.type === 'terrestrial') {
                const dot = document.getElementById('satStatusDot');
                dot.className = 'status-dot active';
                document.getElementById('satNameDisplay').textContent = 'TERRESTRIAL';
                return;
            }
            const info = estimateNextPass(selSat, getJulianDate(new Date()),
                state.myLat, state.myLon, state.myAlt);
            const dot = document.getElementById('satStatusDot');
            dot.className = 'status-dot ' + (info.inPass ? 'active' :
                (info.minutesToNext < 30 ? 'active' : 'warning'));

            const shortName = selSat.name.split(' ')[0];
            let passText;
            if (info.inPass) {
                passText = shortName + ' \u2191' + info.elevation.toFixed(1) + '\u00b0';
            } else if (info.minutesToNext < 600) {
                const h = Math.floor(info.minutesToNext / 60);
                const m = Math.round(info.minutesToNext % 60);
                passText = shortName + ' ~' + h + 'h ' + m + 'm';
            } else {
                passText = shortName + ' --';
            }
            document.getElementById('satNameDisplay').textContent = passText;
        }
    }
}

function calculateFootprintRadius(altitudeKm) {
    const h = Math.max(altitudeKm, 0);
    const angle = Math.acos(RE / (RE + h));
    return RE * angle; // km
}

function geodesicLine(lat1, lon1, lat2, lon2, numPoints) {
    // Shift lon2 to keep the path within a continuous longitude range
    while (lon2 - lon1 > 180) lon2 -= 360;
    while (lon2 - lon1 < -180) lon2 += 360;

    var pts = [];
    var φ1 = lat1 * DEG, λ1 = lon1 * DEG;
    var φ2 = lat2 * DEG, λ2 = lon2 * DEG;
    var x1 = Math.cos(φ1) * Math.cos(λ1);
    var y1 = Math.cos(φ1) * Math.sin(λ1);
    var z1 = Math.sin(φ1);
    var x2 = Math.cos(φ2) * Math.cos(λ2);
    var y2 = Math.cos(φ2) * Math.sin(λ2);
    var z2 = Math.sin(φ2);
    var dot = x1 * x2 + y1 * y2 + z1 * z2;
    var d = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (d < 0.001) return [[lat1, lon1], [lat2, lon2]];
    var prevLon = lon1;
    var unwrap = 0;
    for (var i = 0; i <= numPoints; i++) {
        var f = i / numPoints;
        var A = Math.sin((1 - f) * d) / Math.sin(d);
        var B = Math.sin(f * d) / Math.sin(d);
        var x = A * x1 + B * x2;
        var y = A * y1 + B * y2;
        var z = A * z1 + B * z2;
        var rawLon = Math.atan2(y, x) * RAD;
        if (i > 0 && rawLon - prevLon > 180) unwrap -= 360;
        else if (i > 0 && rawLon - prevLon < -180) unwrap += 360;
        pts.push([Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD, rawLon + unwrap]);
        prevLon = rawLon;
    }
    return pts;
}

function calculateDoppler(freqMHz, satPos, satVel, obsECI) {
    const dx = satPos[0] - obsECI[0];
    const dy = satPos[1] - obsECI[1];
    const dz = satPos[2] - obsECI[2];
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const vrel = (dx * satVel[0] + dy * satVel[1] + dz * satVel[2]) / range;
    const dopplerHz = -freqMHz * 1e6 * vrel / C;
    return { dopplerHz, range };
}

function calculateAzimuth(satPos, obsECI, obsLat, obsLon, jd) {
    const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) * DEG;
    const lon = obsLon * DEG;
    const sinG = Math.sin(gmst), cosG = Math.cos(gmst);
    const ecfX = cosG * (satPos[0] - obsECI[0]) + sinG * (satPos[1] - obsECI[1]);
    const ecfY = -sinG * (satPos[0] - obsECI[0]) + cosG * (satPos[1] - obsECI[1]);
    const ecfZ = satPos[2] - obsECI[2];
    const lat = obsLat * DEG;
    const sinL = Math.sin(lat), cosL = Math.cos(lat);
    const sinLo = Math.sin(lon), cosLo = Math.cos(lon);
    const e = -sinLo * ecfX + cosLo * ecfY;
    const n = -sinL * cosLo * ecfX - sinL * sinLo * ecfY + cosL * ecfZ;
    return (Math.atan2(e, n) * RAD + 360) % 360;
}

function saveTLECache() {
    try {
        var cache = {};
        satelliteDB.forEach(function(s) { cache[s.id] = { tle1: s.tle1, tle2: s.tle2 }; });
        localStorage.setItem('orbitaprs_tle', JSON.stringify(cache));
    } catch (e) {}
}

function loadTLECache() {
    try {
        var raw = localStorage.getItem('orbitaprs_tle');
        if (!raw) return;
        var cache = JSON.parse(raw);
        var changed = false;
        satelliteDB.forEach(function(s) {
            if (cache[s.id]) {
                s.tle1 = cache[s.id].tle1;
                s.tle2 = cache[s.id].tle2;
                changed = true;
            }
        });
        if (changed) _satrecCache.clear();
    } catch (e) {}
}

async function fetchTLEUpdate() {
    const urls = [
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle',
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle&BORDER=',
        'https://amsat.org/tle/bulletin.dat',
    ];
    showToast('Fetching TLE data...');
    for (const url of urls) {
        try {
            const resp = await fetch(url, {
                headers: { 'Accept': 'text/plain, */*' }
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const text = await resp.text();
            if (!text.includes('1 ') || !text.includes('2 ')) throw new Error('Invalid TLE data');
            const lines = text.split('\n').filter(l => l.trim() !== '');
            const tleMap = new Map();
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('1 ') && i + 1 < lines.length && lines[i + 1].trim().startsWith('2 ')) {
                    const tle1 = line;
                    const tle2 = lines[i + 1].trim();
                    const noradId = parseInt(tle1.split(/\s+/)[1], 10);
                    // Get name from previous line(s)
                    let name = 'Unknown';
                    if (i > 0) {
                        const prev = lines[i - 1].trim();
                        if (!prev.startsWith('1 ') && !prev.startsWith('2 ') && prev.length > 0) {
                            name = prev;
                        }
                    }
                    if (!isNaN(noradId)) tleMap.set(noradId, { name, tle1, tle2 });
                }
            }
            if (tleMap.size === 0) throw new Error('No valid TLEs parsed');
            let updated = 0;
            satelliteDB.forEach(sat => {
                if (sat.noradId && tleMap.has(sat.noradId)) {
                    const tle = tleMap.get(sat.noradId);
                    sat.tle1 = tle.tle1;
                    sat.tle2 = tle.tle2;
                    if (tle.name !== 'Unknown') sat.name = tle.name;
                    updated++;
                }
            });
            _satrecCache.clear();
            state.lastTLEUpdate = getUTCNow();
            persistSettings();
            saveTLECache();
            refreshSatPasses();
            showToast('TLE updated for ' + updated + ' satellites');
            renderSatModal();
            return;
        } catch (err) { continue; }
    }
    showToast('TLE update failed — using cached data', true);
}

function renderSatModal() {
    const container = document.getElementById('satModalList');
    if (!container) return;
    // Update TLE status display
    const tleStatus = document.getElementById('tleStatus');
    if (tleStatus) {
        tleStatus.textContent = state.lastTLEUpdate
            ? 'TLE: last updated ' + state.lastTLEUpdate
            : 'TLE: using embedded data (not updated yet)';
    }
    container.innerHTML = '';
    satelliteDB.forEach(sat => {
        const div = document.createElement('div');
        div.className = 'sat-modal-item' + (state.selectedSat === sat.id ? ' selected' : '');
        let statusText, statusClass;
        if (sat.type === 'terrestrial') {
            statusText = 'MODE';
            statusClass = 'in-range';
        } else {
            const info = estimateNextPass(sat, getJulianDate(new Date()), state.myLat, state.myLon, state.myAlt);
            if (info.inPass) {
                statusText = 'EL ' + info.elevation.toFixed(1) + '°';
                statusClass = 'in-range';
            } else {
                const h = Math.floor(info.minutesToNext / 60);
                const m = Math.round(info.minutesToNext % 60);
                statusText = '~' + h + 'h ' + m + 'min';
                statusClass = info.minutesToNext < 30 ? 'soon' : 'out-range';
            }
        }
        div.onclick = () => {
            selectSatellite(sat.id);
            toggleModal('satModal', false);
        };
        div.innerHTML =
            '<div><div class="sat-name">' + sat.name + '</div><div class="sat-freq">TX ' + sat.freq.toFixed(3) + ' | RX ' + sat.freqRX.toFixed(3) + '</div></div>' +
            '<div><span class="sat-status ' + statusClass + '">' + statusText + '</span></div>';
        container.appendChild(div);
    });
}

function selectSatellite(satId) {
    state.selectedSat = satId;
    const sat = satelliteDB.find(s => s.id === satId);
    if (sat) {
        state.txFreq = (state.satFreqOverrides && state.satFreqOverrides[satId]) || sat.freq;
        if (sat.type === 'terrestrial') {
            state.digipath = 'WIDE1-1';
        } else {
            state.digipath = 'ARISS';
        }
        updateDisplays();
        document.getElementById('satStatusDot').className = 'status-dot active';
        refreshSatPasses();
        updateDigipathOptions(sat.type === 'terrestrial');
    }
}
