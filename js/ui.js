function resolveMacroTemplate(macro, target) {
    const parts = target ? target.trim().split(/\s+/) : [];
    const tcall = (parts[0] || '').toUpperCase();
    const tloc = (parts[1] || '').toUpperCase();
    const sat = state.selectedSat && satelliteDB.find(s => s.id === state.selectedSat);
    const satName = sat ? sat.name.toUpperCase().split(' ')[0] : 'SAT';
    const seq = String(state.msgIdCounter || 0).padStart(2, '0');
    let t = macro.template;
    // UISS percent tokens (resolve before brace tokens)
    t = t.replace(/%C/g, tcall);
    t = t.replace(/%c/g, tcall.split('-')[0]);
    t = t.replace(/%M/g, state.myCall || 'N0CALL');
    t = t.replace(/%G/g, (state.myGrid || '--').toUpperCase());
    t = t.replace(/%R/g, tloc);
    t = t.replace(/%S/g, satName);
    t = t.replace(/%N/g, seq);
    // Legacy brace tokens (backward compatibility)
    t = t.replace(/\{mycall\}/g, state.myCall || 'N0CALL');
    t = t.replace(/\{mygrid\}/g, (state.myGrid || '--').toUpperCase());
    t = t.replace(/\{lat\}/g, latToAPRS(state.myLat));
    t = t.replace(/\{lon\}/g, lonToAPRS(state.myLon));
    t = t.replace(/\{callsign\}/g, tcall);
    t = t.replace(/\{locator\}/g, tloc);
    t = t.replace(/\{satname\}/g, satName);
    return t;
}

function renderQuickActions() {
    const container = document.getElementById('quickActions');
    if (!container) return;
    container.innerHTML = state.macros.map(m =>
        '<button class="btn-quick" onclick="sendQuickAction(\'' + m.id + '\')" title="' + escapeHTML(m.template || '') + '">' + (m.icon || '🔘') + ' ' + escapeHTML(m.name || '?') + '</button>'
    ).join('');
}

function renderMacroEditor() {
    const container = document.getElementById('macroEditor');
    if (!container) return;
    container.innerHTML = state.macros.map((m, i) =>
        '<div class="macro-row" data-idx="' + i + '">' +
            '<input class="macro-name" value="' + escapeHTML(m.name || '') + '" placeholder="Name" onchange="updateMacro(' + i + ',\'name\',this.value)" maxlength="16">' +
            '<input class="macro-template" value="' + escapeHTML(m.template || '') + '" placeholder="Template" onchange="updateMacro(' + i + ',\'template\',this.value)" maxlength="200">' +
            '<label class="macro-log" title="Auto-log QSO when sent"><input type="checkbox" onchange="updateMacro(' + i + ',\'logQSO\',this.checked)"' + (m.logQSO ? ' checked' : '') + '>📝</label>' +
            '<button class="macro-del" onclick="removeMacro(' + i + ')" title="Remove">✕</button>' +
        '</div>'
    ).join('');
}

function updateMacro(idx, field, value) {
    if (idx < 0 || idx >= state.macros.length) return;
    state.macros[idx][field] = value;
    renderQuickActions();
}

function addMacro() {
    const id = 'm' + Date.now();
    state.macros.push({ id, name: 'New', icon: '🔘', template: 'Hello World', logQSO: false });
    renderMacroEditor();
    renderQuickActions();
}

function removeMacro(idx) {
    if (state.macros.length <= 1) { showToast('Need at least 1 macro', true); return; }
    state.macros.splice(idx, 1);
    renderMacroEditor();
    renderQuickActions();
}

function resetMacros() {
    state.macros = DEFAULT_MACROS.map(m => ({...m}));
    renderMacroEditor();
    renderQuickActions();
    showToast('Macros reset to defaults');
}

function sendQuickAction(action) {
    const target = document.getElementById('packetTarget').value.trim().toUpperCase();
    if (state.myCall === 'N0CALL') { showToast('Set your callsign first', true); return; }
    const macro = state.macros.find(m => m.id === action);
    if (!macro) {
        addTerminalLine('system', 'TX: macro "' + action + '" not found');
        return;
    }
    let info = resolveMacroTemplate(macro, target);
    // APRS message formatting (type ':'): pad destination to 9 chars, ensure {xx sequence
    if (info[0] === ':') {
        const secondColon = info.indexOf(':', 1);
        if (secondColon > 1 && secondColon < 12) {
            const dest = info.slice(1, secondColon);
            const body = info.slice(secondColon + 1);
            const msgIdMatch = body.match(/\{(\d{1,2})$/);
            const msgId = msgIdMatch ? msgIdMatch[1] : null;
            const msg = msgIdMatch ? body.slice(0, body.lastIndexOf('{')) : body;
            info = formatAPRSMessage(dest, msg, msgId || String(state.msgIdCounter).padStart(2, '0'));
        }
        if (!/\{\d{2}$/.test(info)) {
            const seq = String(state.msgIdCounter).padStart(2, '0');
            info += '{' + seq;
        }
        state.msgIdCounter = (state.msgIdCounter % 99) + 1;
        persistSettings();
    }
    const sourceCall = state.myCall;
    const destCall = state.tocall || 'APZ100';
    const fullPacket = formatAPRSFrame(sourceCall, destCall, state.digipath, info);
    const packet = {
        infoField: info,
        sourceCall: sourceCall,
        destCall: destCall,
        digipath: state.digipath,
        fullPacket: fullPacket,
    };
    addTerminalLine('tx', fullPacket);
    if (state.tnc && state.tnc.connected) {
        try {
            const ax25 = buildAX25Frame(packet);
            state.tnc.send(ax25);
            if (macro.logQSO && target && target.length >= 3 && state.selectedSat) {
                const pts = target.split(' ');
                const tc = pts[0], tg = pts[1] || '';
                if (tc.length >= 3) {
                    const existing = state.pendingQSOs.findIndex(p =>
                        p.call === tc.toUpperCase() && p.satId === state.selectedSat
                    );
                    if (existing < 0) {
                        state.pendingQSOs.push({
                            call: tc.toUpperCase(),
                            grid: tg.toUpperCase() || '--',
                            satId: state.selectedSat,
                            time: getUTCNow(),
                        });
                        persistSettings();
                        addTerminalLine('system', 'QSO pending with ' + tc.toUpperCase() + ' (awaiting RX confirmation)');
                    }
                }
            }
        } catch (e) {
            showToast('TX error: ' + e.message, true);
        }
    } else {
        addTerminalLine('system', 'TNC not connected. Packet logged only.');
    }
}

function buildAndSendPacket() {
    if (state.macros.length) sendQuickAction(state.macros[0].id);
}

function addTerminalLine(type, message) {
    const terminal = document.getElementById('terminal');
    const ts = getUTCShort();
    const line = document.createElement('div');
    line.className = 'line ' + type;
    var color = null;
    if (type === 'tx') color = state.termColorTx;
    else if (type === 'rx') color = state.termColorRx;
    else if (type === 'rx-echo') color = state.termColorEcho;
    else if (type === 'rx-rpt') color = state.termColorOwn;
    if (color) line.style.color = color;
    line.innerHTML = '<span class="timestamp">[' + ts + ']</span> ' + escapeHTML(message);
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
    const maxLines = state.logLines || 300;
    while (terminal.children.length > maxLines) terminal.removeChild(terminal.firstChild);
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function clearTerminal() {
    document.getElementById('terminal').innerHTML =
        '<div class="line system"><span class="timestamp">[CLEAR]</span> Terminal cleared</div>';
}

function showToast(message, isError) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + (isError ? 'error' : '') + ' show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (show) {
        modal.classList.add('active');
        if (id === 'settingsModal') {
            populateSettingsFields();
            updateDeviceInfo();
            populateFreqOverrides();
            renderSatListManage();
            switchSettingsTab('station');
        } else if (id === 'satModal') {
            renderSatModal();
        }
    } else {
        modal.classList.remove('active');
    }
}

function populateFreqOverrides() {
    var sel = document.getElementById('setFreqOverrideSat');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '<option value="">-- Select satellite --</option>';
    for (var i = 0; i < satelliteDB.length; i++) {
        var s = satelliteDB[i];
        sel.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
    }
    sel.value = prev || state.selectedSat || '';
    onFreqOverrideSatChange();
}

function onFreqOverrideSatChange() {
    var sel = document.getElementById('setFreqOverrideSat');
    var inp = document.getElementById('setFreqOverrideVal');
    var def = document.getElementById('freqOverrideDefault');
    if (!sel || !inp || !def) return;
    var satId = sel.value;
    if (!satId) {
        inp.value = '';
        def.textContent = 'Default: -- MHz';
        return;
    }
    var sat = satelliteDB.find(function(s) { return s.id === satId; });
    def.textContent = 'Default: ' + (sat ? sat.freq.toFixed(3) : '--') + ' MHz';
    inp.value = state.satFreqOverrides[satId] !== undefined ? state.satFreqOverrides[satId] : '';
}

function onFreqOverrideValChange() {
    var sel = document.getElementById('setFreqOverrideSat');
    var inp = document.getElementById('setFreqOverrideVal');
    if (!sel || !inp) return;
    var satId = sel.value;
    if (!satId) return;
    var val = inp.value.trim();
    if (val) {
        state.satFreqOverrides[satId] = parseFloat(val);
    } else {
        delete state.satFreqOverrides[satId];
    }
    var sat = satelliteDB.find(function(s) { return s.id === satId; });
    if (sat) {
        state.txFreq = (state.satFreqOverrides && state.satFreqOverrides[satId]) || sat.freq;
        var freqInput = document.getElementById('setFreq');
        if (freqInput) freqInput.value = state.txFreq;
        updateDisplays();
    }
}

function resetFreqOverride() {
    var sel = document.getElementById('setFreqOverrideSat');
    var inp = document.getElementById('setFreqOverrideVal');
    if (!sel || !inp) return;
    var satId = sel.value;
    if (!satId) return;
    delete state.satFreqOverrides[satId];
    var sat = satelliteDB.find(function(s) { return s.id === satId; });
    if (sat) {
        state.txFreq = sat.freq;
        var freqInput = document.getElementById('setFreq');
        if (freqInput) freqInput.value = state.txFreq;
        updateDisplays();
    }
    onFreqOverrideSatChange();
    showToast('Override reset for ' + satId);
}

function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.settings-tabs .tab-btn[data-tab="' + tabName + '"]').classList.add('active');
    document.querySelectorAll('.modal .tab-content').forEach(t => t.style.display = 'none');
    document.getElementById('tab-' + tabName).style.display = '';
    if (tabName === 'macros') renderMacroEditor();
    if (tabName === 'sat') { populateFreqOverrides(); renderSatListManage(); }
}

document.getElementById('settingsModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('settingsModal', false);
});
document.getElementById('satModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('satModal', false);
});
document.querySelector('.header .logo').addEventListener('click', () => {
    toggleModal('settingsModal', true);
    requestCompassPermission();
});

function tncConnect() {
    const type = document.getElementById('setTncType').value;
    const port = '';
    const baud = parseInt(document.getElementById('setTncBaud').value);
    if (!state.tnc) state.tnc = new TNC();
    state.tnc.onPacket = (pkt) => {
        const isOwn = pkt.source.toUpperCase() === state.myCall.toUpperCase();
        const isRpt = isOwn && pkt.digiRepeated && pkt.digiRepeated.some(r => r);
        const lineType = isOwn ? (isRpt ? 'rx-rpt' : 'rx-echo') : 'rx';
        const label = isOwn ? (isRpt ? 'RPT ' : 'ECHO ') : '';
        addTerminalLine(lineType, label + pkt.source + ' > ' + pkt.dest + ' : ' + pkt.info);
        document.getElementById('tncStatusDot').className = 'status-dot active';
        logPacketFromTNC(pkt);
        const aprsFromPkt = extractAPRSData(pkt.info);
        const existing = state.heardStations.find(s => s.call === pkt.source);
        if (existing) {
            existing.lastHeard = Date.now();
            existing.count++;
            if (!existing.grid) existing.grid = aprsFromPkt.grid || null;
        } else {
            state.heardStations.unshift({
                call: pkt.source,
                lastHeard: Date.now(),
                count: 1,
                grid: aprsFromPkt.grid || null,
            });
            if (state.heardStations.length > 20) state.heardStations.pop();
        }
        renderHeardList();
    };
    state.tnc.onStatus = (msg, isError) => {
        showToast(msg, isError);
        document.getElementById('tncStatusText').textContent = 'TNC: ' + msg;
        if (!isError) {
            document.getElementById('tncStatusDot').className = 'status-dot active';
        } else {
            document.getElementById('tncStatusDot').className = 'status-dot warning';
        }
    };
    state.tnc.connect(type, port, baud);
}

function renderHeardList() {
    const heard = document.getElementById('heardList');
    if (!heard) return;
    if (state.heardStations.length === 0) {
        heard.innerHTML = '<div style="text-align:center;color:#555;padding:20px;font-size:0.85em;">No stations heard yet</div>';
        if (typeof mapView !== 'undefined') mapView.updateHeard();
        return;
    }
    const target = document.getElementById('packetTarget').value.trim().toUpperCase();
    heard.innerHTML = state.heardStations.map(s => {
        const secs = Math.round((Date.now() - s.lastHeard) / 1000);
        const ago = secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'm';
        const active = s.call === target ? ' heard-active' : '';
        return '<div class="heard-item' + active + '" onclick="document.getElementById(\'packetTarget\').value=\'' + s.call + '\';renderHeardList()">' +
            '<div class="heard-call">' + s.call + '</div>' +
            '<div class="heard-meta"><span class="heard-count">' + s.count + '</span><span class="heard-time">' + ago + '</span></div>' +
            '</div>';
    }).join('');
    if (typeof mapView !== 'undefined') mapView.updateHeard();
}

function tncDisconnect() {
    if (state.tnc) {
        state.tnc.disconnect();
    }
}

function logQSO(satId, targetCall, targetGrid, rstSent, rstRcvd, status) {
    const sat = satelliteDB.find(s => s.id === satId) || { name: 'Unknown', freq: state.txFreq };
    const actualFreq = state.txFreq || sat.freq;
    const dist = calculateGridDistance(state.myGrid, targetGrid);
    const qso = {
        utc: getUTCNow(),
        utcShort: getUTCShort(),
        satellite: sat.name,
        satId: satId,
        freq: actualFreq,
        call: targetCall.toUpperCase(),
        grid: targetGrid.toUpperCase(),
        rstSent: rstSent || state.rstDefault,
        rstRcvd: rstRcvd || state.rstDefault,
        distanceKm: dist,
        myGrid: state.myGrid,
        status: status || 'heard',
        mode: 'DATA',
        qslSent: true,
        qslRcvd: status === 'confirmed',
        satMode: 'DATA',
    };
    state.qsoLog.unshift(qso);
    if (state.qsoLog.length > 200) state.qsoLog.length = 200;
    persistSettings();
    renderQSOs();
    showToast('QSO logged: ' + qso.call + ' (' + qso.status + ')');
}

function renderQSOs() {
    const tbody = document.getElementById('qsoBody');
    if (state.qsoLog.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#555;padding:20px;">No QSOs yet</td></tr>';
        return;
    }
    const statusIcon = { confirmed: '🟢', sent: '🟡', heard: '⚪' };
    tbody.innerHTML = state.qsoLog.slice(0, 50).map(function(qso, idx) {
        return '<tr onclick="showQSOOnMap(' + idx + ')" style="cursor:pointer;">' +
            '<td>' + qso.utcShort + '</td><td class="qso-sat">' + escapeHTML(qso.satellite) + '</td>' +
            '<td><b>' + escapeHTML(qso.call) + '</b></td><td>' + escapeHTML(qso.grid) + '</td>' +
            '<td>' + qso.rstSent + '/' + qso.rstRcvd + '</td>' +
            '<td>' + (qso.distanceKm ? qso.distanceKm.toFixed(0) + 'km' : '--') + '</td>' +
            '<td title="' + (qso.status || 'heard') + '">' + (statusIcon[qso.status] || '⚪') + '</td></tr>';
    }).join('');
}

function clearQSOLog() {
    if (!confirm('Delete all QSO log entries? This cannot be undone.')) return;
    state.qsoLog = [];
    persistSettings();
    renderQSOs();
    showToast('QSO log cleared');
}

function exportQSOLog() {
    if (state.qsoLog.length === 0) {
        showToast('No QSOs to export', true);
        return;
    }
    let adi = 'ADIF Export from OrbitAPRS\n<ADIF_VER:5>3.1.0\n<PROGRAMID:10>OrbitAPRS\n<EOH>\n';
    state.qsoLog.forEach(qso => {
        const date = qso.utc.slice(0, 10).replace(/-/g, '');
        const time = qso.utc.slice(11, 19).replace(/:/g, '');
        const band = qso.freq < 148 ? '2M' : '70CM';
        adi += '<CALL:' + qso.call.length + '>' + qso.call + ' ';
        adi += '<QSO_DATE:8>' + date + ' ';
        adi += '<TIME_ON:6>' + time + ' ';
        adi += '<TIME_OFF:6>' + time + ' ';
        adi += '<BAND:' + band.length + '>' + band + ' ';
        adi += '<FREQ:' + qso.freq.toFixed(3).length + '>' + qso.freq.toFixed(3) + ' ';
        adi += '<MODE:4>DATA ';
        adi += '<PROP_MODE:3>SAT ';
        const satName = qso.satellite || 'Unknown';
        adi += '<SAT_NAME:' + satName.length + '>' + satName + ' ';
        adi += '<RST_SENT:' + qso.rstSent.length + '>' + qso.rstSent + ' ';
        adi += '<RST_RCVD:' + qso.rstRcvd.length + '>' + qso.rstRcvd + ' ';
        adi += '<GRIDSQUARE:' + qso.grid.length + '>' + qso.grid + ' ';
        adi += '<MY_GRIDSQUARE:' + qso.myGrid.length + '>' + qso.myGrid + ' ';
        adi += '<QSL_RCVD:1>' + (qso.status === 'confirmed' ? 'Y' : 'N') + ' ';
        adi += '<QSL_SENT:1>Y ';
        adi += '<STATION_CALLSIGN:' + state.myCall.length + '>' + state.myCall + ' ';
        adi += '<OPERATOR_CALLSIGN:' + state.myCall.length + '>' + state.myCall + ' ';
        if (qso.distanceKm) adi += '<DISTANCE:' + Math.round(qso.distanceKm).toString().length + '>' + Math.round(qso.distanceKm) + ' ';
        adi += '<EOR>\n';
    });
    const blob = new Blob([adi], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orbitaprs_log_' + new Date().toISOString().slice(0, 10) + '.adi';
    a.click();
    URL.revokeObjectURL(url);
    showToast('ADI log exported');
}

function showQSOOnMap(qsoIdx) {
    if (typeof mapView !== 'undefined' && mapView.showQSO) {
        switchTerminalTab('map');
        mapView.showQSO(qsoIdx);
    }
}

function calculateGridDistance(g1, g2) {
    if (!g1 || !g2 || g1.length < 4 || g2.length < 4) return null;
    const p1 = gridToLatLon(g1), p2 = gridToLatLon(g2);
    if (!p1 || !p2) return null;
    return haversine(p1.lat, p1.lon, p2.lat, p2.lon);
}

function gridToLatLon(grid) {
    grid = grid.toUpperCase().trim();
    if (grid.length < 4) return null;
    const flon = grid.charCodeAt(0) - 65, flat = grid.charCodeAt(1) - 65;
    const slon = parseInt(grid[2]) || 0, slat = parseInt(grid[3]) || 0;
    let sublon = 0, sublat = 0;
    if (grid.length >= 6) { sublon = grid.charCodeAt(4) - 65; sublat = grid.charCodeAt(5) - 65; }
    const lon = (flon * 20) + (slon * 2) + (sublon * 2 / 24) - 180 + (1 / 24);
    const lat = (flat * 10) + slat + (sublat / 24) - 90 + (0.5 / 24);
    return { lat, lon };
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function switchTerminalTab(tab) {
    document.querySelectorAll('.panel-tab').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    var terminal = document.getElementById('terminal');
    var mapEl = document.getElementById('mapContainer');
    var navEl = document.getElementById('navContainer');
    var panel = document.querySelector('.terminal-panel');
    var followBtn = document.getElementById('mapFollowBtn');
    terminal.style.display = tab === 'terminal' ? '' : 'none';
    mapEl.style.display = tab === 'map' ? '' : 'none';
    navEl.style.display = tab === 'nav' ? '' : 'none';
    panel.classList.toggle('map-active', tab === 'map');
    panel.classList.toggle('nav-active', tab === 'nav');
    followBtn.style.display = tab === 'map' ? '' : 'none';
    if (tab === 'map' && typeof mapView !== 'undefined' && mapView.getMap()) {
        setTimeout(function() { mapView.getMap().invalidateSize(); }, 100);
    }
    if (tab === 'nav' && typeof navView !== 'undefined') {
        setTimeout(function() { navView.resize(); }, 50);
    }
}

document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        toggleModal('settingsModal', true);
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        toggleModal('settingsModal', false);
        toggleModal('satModal', false);
    }
});

function updateDigipathOptions(isTerrestrial) {
    const sel = document.getElementById('setPath');
    if (isTerrestrial) {
        sel.innerHTML = '<option>WIDE1-1</option><option>WIDE1-1,WIDE2-1</option><option>WIDE2-2</option><option>WIDE2-1</option><option>CQ</option><option>DIRECT</option>';
    } else {
        sel.innerHTML = '<option>ARISS</option><option>WIDE1-1,WIDE2-1</option><option>WIDE1-1</option><option>WIDE2-2</option><option>DIRECT</option>';
    }
    state.digipath = sel.value;
    document.getElementById('pathDisplay').textContent = state.digipath;
    persistSettings();
}

function sendFreeTextPacket() {
    const target = document.getElementById('packetTarget').value.trim().toUpperCase();
    const raw = document.getElementById('freeTextPacket').value.trim();
    if (!target) { showToast('Enter a target callsign first', true); return; }
    if (!raw) { showToast('Enter a message', true); return; }
    if (state.myCall === 'N0CALL') { showToast('Set your callsign first', true); return; }

    const seq = String(state.msgIdCounter).padStart(2, '0');
    state.msgIdCounter = (state.msgIdCounter % 99) + 1;
    persistSettings();

    const call = target.split(' ')[0];
    const info = formatAPRSMessage(call, raw, seq);

    const sourceCall = state.myCall;
    const destCall = state.tocall || 'APZ100';
    const fullPacket = formatAPRSFrame(sourceCall, destCall, state.digipath, info);
    const packet = {
        infoField: info,
        sourceCall: sourceCall,
        destCall: destCall,
        digipath: state.digipath,
        fullPacket: fullPacket,
    };
    addTerminalLine('tx', fullPacket);
    if (state.tnc && state.tnc.connected) {
        try {
            const ax25 = buildAX25Frame(packet);
            state.tnc.send(ax25);
        } catch (e) {
            showToast('TX error: ' + e.message, true);
        }
    } else {
        addTerminalLine('system', 'TNC not connected. Packet logged only.');
    }
    document.getElementById('freeTextPacket').value = '';
}
