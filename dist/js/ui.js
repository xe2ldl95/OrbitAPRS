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
    t = t.replace(/%RST/g, state.rstDefault || '59');
    t = t.replace(/%R/g, tloc);
    t = t.replace(/%S/g, satName);
    t = t.replace(/%N/g, seq);
    t = t.replace(/%T/g, macro.symbolTable || '/');
    t = t.replace(/%Y/g, macro.symbol || '[');
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
            '<button class="macro-symbol-btn" onclick="openSymbolPicker(' + i + ')" title="Select APRS symbol: ' + (m.symbolTable || '/') + (m.symbol || '[') + '">' + escapeHTML((m.symbolTable || '/') + (m.symbol || '[')) + '</button>' +
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
    state.macros.push({ id, name: 'New', icon: '🔘', template: 'Hello World', logQSO: false, symbolTable: '/', symbol: '[' });
    renderMacroEditor();
    renderQuickActions();
}

function removeMacro(idx) {
    if (state.macros.length <= 1) {     showToast(t('toast.need_macro'), true); return; }
    state.macros.splice(idx, 1);
    renderMacroEditor();
    renderQuickActions();
}

var _symbolPickerIdx = -1;

function jsEsc(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function openSymbolPicker(idx) {
    _symbolPickerIdx = idx;
    var m = state.macros[idx];
    if (!m) return;
    renderSymbolPicker(m.symbolTable || '/', m.symbol || '[');
    toggleModal('symbolPickerModal', true);
}

function selectSymbol(table, sym) {
    var m = state.macros[_symbolPickerIdx];
    if (!m) return;
    m.symbolTable = table;
    m.symbol = sym;
    renderMacroEditor();
    renderQuickActions();
    toggleModal('symbolPickerModal', false);
}

function renderSymbolPicker(activeTable, activeSymbol) {
    var el = document.getElementById('symbolPickerContent');
    if (!el) return;
    var tables = ['/', '\\'];
    var tableNames = { '/': 'Primary (/)', '\\': 'Alternate (\\)' };
    var html = '<div class="symbol-table-toggle">';
    var escSymbol = jsEsc(activeSymbol);
    tables.forEach(function(t) {
        var active = t === activeTable ? 'btn-primary' : 'btn-outline';
        html += '<button class="btn btn-sm ' + active + '" onclick="renderSymbolPicker(\'' + jsEsc(t) + '\',\'' + escSymbol + '\')">' + tableNames[t] + '</button>';
    });
    html += '</div>';
    html += '<div class="symbol-picker-grid">';
    var syms = APRS_SYMBOLS[tables.indexOf(activeTable) === 0 ? 'primary' : 'alternate'];
    var escTable = jsEsc(activeTable);
    for (var code = 33; code <= 126; code++) {
        var ch = String.fromCharCode(code);
        var name = syms[ch] || 'Unknown';
        var selected = ch === activeSymbol ? ' selected' : '';
        html += '<div class="symbol-picker-cell' + selected + '" onclick="selectSymbol(\'' + escTable + '\',\'' + jsEsc(ch) + '\')" title="' + escapeHTML(name) + '">' + escapeHTML(ch) + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
}

function resetMacros() {
    state.macros = DEFAULT_MACROS.map(m => ({...m}));
    renderMacroEditor();
    renderQuickActions();
    showToast(t('toast.macros_reset'));
}

function sendQuickAction(action) {
    const target = document.getElementById('packetTarget').value.trim().toUpperCase();
    if (state.myCall === 'N0CALL') { showToast(t('toast.set_callsign'), true); return; }
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
    const isSat = isSatMode();
    const destCall = info[0] === ':'
        ? (isSat ? state.tocallMsgSat : state.tocallMsgTer)
        : (isSat ? state.tocallPosSat : state.tocallPosTer);
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
            if (macro.logQSO && target && target.length >= 3 && isSat) {
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
                        addTerminalLine('system', t('terminal.qso_pending') + tc.toUpperCase());
                    }
                }
            }
        } catch (e) {
            showToast(t('toast.tx_error') + ' ' + e.message, true);
        }
    } else {
        addTerminalLine('system', t('toast.tnc_packet_logged'));
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
        '<div class="line system"><span class="timestamp">[CLEAR]</span> ' + t('terminal.cleared') + '</div>';
}

function handleClear() {
    var panel = document.querySelector('.terminal-panel');
    if (panel.classList.contains('chat-active')) {
        toggleModal('chatClearModal', true);
    } else {
        clearTerminal();
    }
}

function deleteChatCurrent() {
    var call = state.chatActive;
    if (!call) return;
    if (!confirm(t('toast.conversation_delete') + ' ' + call + '?')) return;
    delete _chatMessages[call];
    state.chatList = state.chatList.filter(function(c) { return (c.baseCall || c.call) !== call; });
    state.chatActive = null;
    saveChatMessages();
    persistSettings();
    renderChatList();
    document.getElementById('chatMessages').innerHTML = '<div class="chat-empty">' + t('chat.empty_state') + '</div>';
    document.getElementById('packetTarget').value = '';
    toggleModal('chatClearModal', false);
    showToast(t('toast.chat_deleted'));
}

function deleteAllChats() {
    if (!confirm(t('toast.all_conversations_delete'))) return;
    _chatMessages = {};
    state.chatList = [];
    state.chatActive = null;
    saveChatMessages();
    persistSettings();
    renderChatList();
    document.getElementById('chatMessages').innerHTML = '<div class="chat-empty">' + t('chat.empty_state') + '</div>';
    document.getElementById('packetTarget').value = '';
    toggleModal('chatClearModal', false);
    showToast(t('toast.all_chats_deleted'));
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
            populateFreqOverrides();
            renderSatListManage();
            switchSettingsTab('station');
        } else if (id === 'satModal') {
            renderSatModal();
        } else if (id === 'beaconModal') {
            document.getElementById('beaconInterval').value = state.beaconInterval;
            document.getElementById('beaconShareLocation').checked = state.beaconShareLocation;
            document.getElementById('beaconMessage').value = state.beaconMessage;
            document.getElementById('beaconToggle').checked = state.beaconEnabled;
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
        def.textContent = t('label.default_freq') + ' -- MHz';
        return;
    }
    var sat = satelliteDB.find(function(s) { return s.id === satId; });
    def.textContent = t('label.default_freq') + (sat ? sat.freq.toFixed(3) : '--') + ' MHz';
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
        updateDisplays();
    }
    onFreqOverrideSatChange();
    showToast(t('toast.override_reset') + ' ' + satId);
}

function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.settings-tabs .tab-btn[data-tab="' + tabName + '"]').classList.add('active');
    document.querySelectorAll('.modal .tab-content').forEach(t => t.style.display = 'none');
    document.getElementById('tab-' + tabName).style.display = '';
    if (tabName === 'macros') renderMacroEditor();
    if (tabName === 'sat') { populateFreqOverrides(); renderSatListManage(); }
    if (tabName === 'general') {
        if (document.getElementById('setLang')) {
            document.getElementById('setLang').value = state.lang || 'es';
        }
    }
}

document.getElementById('settingsModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('settingsModal', false);
});
document.getElementById('satModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('satModal', false);
});
document.getElementById('beaconModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('beaconModal', false);
});
document.querySelector('.header .logo').addEventListener('click', () => {
    toggleModal('settingsModal', true);
    requestCompassPermission();
});

function tncConnect() {
    const type = document.getElementById('setTncType').value;
    let port = '';
    let host = '';
    const baud = parseInt(document.getElementById('setTncBaud').value);
    
    if (type === 'tcp') {
        host = document.getElementById('setTncHost').value.trim();
        port = document.getElementById('setTncPort').value.trim();
        if (!host) { showToast(t('toast.tcp_host_required'), true); return; }
        if (!port) { showToast(t('toast.tcp_port_required'), true); return; }
        port = parseInt(port);
    }
    
    if (!state.tnc) state.tnc = new TNC();
    state.tnc.onPacket = (pkt) => {
        const isOwn = pkt.source.toUpperCase() === state.myCall.toUpperCase();
        const isRpt = isOwn && pkt.digiRepeated && pkt.digiRepeated.some(r => r);
        const lineType = isOwn ? (isRpt ? 'rx-rpt' : 'rx-echo') : 'rx';
        const label = isOwn ? (isRpt ? 'RPT ' : 'ECHO ') : '';
        addTerminalLine(lineType, pkt.source + ' > ' + pkt.dest + ' : ' + pkt.info);
        document.getElementById('tncStatusDot').className = 'status-dot active';
        logPacketFromTNC(pkt);
        const aprsFromPkt = extractAPRSData(pkt.info);
        const existing = state.heardStations.find(s => s.call === pkt.source);
        if (existing) {
            existing.lastHeard = Date.now();
            existing.count++;
            if (aprsFromPkt.grid) existing.grid = aprsFromPkt.grid;
            if (aprsFromPkt.lat !== null && aprsFromPkt.lat !== undefined) existing.lat = aprsFromPkt.lat;
            if (aprsFromPkt.lon !== null && aprsFromPkt.lon !== undefined) existing.lon = aprsFromPkt.lon;
        } else {
            state.heardStations.unshift({
                call: pkt.source,
                lastHeard: Date.now(),
                count: 1,
                grid: aprsFromPkt.grid || null,
                lat: aprsFromPkt.lat ?? null,
                lon: aprsFromPkt.lon ?? null,
            });
            if (state.heardStations.length > state.heardStationsLimit) state.heardStations.pop();
        }
        requestHeardRender();
        // Chat: store received messages directed to us (terrestrial only)
        if (pkt.info && pkt.info[0] === ':' && !isSatMode()) {
            var msgBody = extractMessageBody(pkt.info);
            if (msgBody && msgDestIsForUs(pkt.info)) {
                addChatMessage(pkt.source, msgBody, 'received');
            }
        }
        // Chat: handle third-party packets (}SOURCE>DEST:info)
        if (pkt.info && pkt.info[0] === '}' && !isSatMode()) {
            var tp = parseThirdPartyPacket(pkt.info);
            if (tp && tp.info[0] === ':') {
                var msgBody = extractMessageBody(tp.info);
                if (msgBody && msgDestIsForUs(tp.info)) {
                    addChatMessage(tp.source, msgBody, 'received');
                }
            }
        }
    };
    state.tnc.onStatus = (msg, isError) => {
        showToast(msg, isError);
        document.getElementById('tncStatusText').textContent = 'TNC: ' + msg;
        if (!isError) {
            document.getElementById('tncStatusDot').className = 'status-dot active';
            setTimeout(function() {
                if (state.tncType !== 'tcp') {
                    readTXGain();
                    state.tnc.sendCommand(0x06, new Uint8Array([0x0D]));
                }
            }, 1000);
        } else {
            document.getElementById('tncStatusDot').className = 'status-dot warning';
        }
    };
    state.tnc.onHardwareResponse = (resp) => {
        if (resp.subcmd === 0x05 || resp.subcmd === 0x04) {
            var level = resp.data.length >= 2
                ? (resp.data[0] << 8) | resp.data[1]
                : resp.data[0] || 0;
            var maxVal = resp.data.length >= 2 ? 65535 : 255;
            var pct = Math.min(100, Math.max(0, (level / maxVal) * 100));
            var dbVal = (level || 1) / maxVal;
            var db = 20 * Math.log10(dbVal);
            document.getElementById('inputLevelBar').value = pct;
            var dbEl = document.getElementById('inputLevelDb');
            dbEl.textContent = db.toFixed(1) + ' dBFS';
            dbEl.style.color = db > -10 ? '#e74c3c' : db > -20 ? '#f0a030' : '#2ecc71';
            var statusEl = document.getElementById('inputLevelStatus');
            if (db > -3) {
                statusEl.textContent = '⚠ ' + t('status.high');
                statusEl.style.color = '#e74c3c';
            } else if (db > -6) {
                statusEl.textContent = '✓ ' + t('status.optimal');
                statusEl.style.color = '#2ecc71';
            } else if (db > -15) {
                statusEl.textContent = '∼ ' + t('status.acceptable');
                statusEl.style.color = '#f0a030';
            } else {
                statusEl.textContent = '▼ ' + t('status.low');
                statusEl.style.color = '#e74c3c';
            }
        } else if (resp.subcmd === 0x21) {
            var val = (resp.data[0] || 0) * 10;
            document.getElementById('setTxDelay').value = val;
        } else if (resp.subcmd === 0x22) {
            var val = resp.data[0] || 0;
            document.getElementById('setPersistence').value = val;
        } else if (resp.subcmd === 0x23) {
            var val = (resp.data[0] || 0) * 10;
            document.getElementById('setSlotTime').value = val;
        } else if (resp.subcmd === 0x24) {
            var val = (resp.data[0] || 0) * 10;
            document.getElementById('setTxTail').value = val;
        } else if (resp.subcmd === 0x0C) {
            var gain = resp.data.length >= 2 ? (resp.data[0] | (resp.data[1] << 8)) : (resp.data[0] || 0);
            var pct = Math.round(gain / 255 * 100);
            document.getElementById('setTXGain').value = pct;
            document.getElementById('txGainVal').textContent = pct + '%';
        } else if (resp.subcmd === 0x0D) {
            var gain = resp.data.length >= 2 ? (resp.data[0] | (resp.data[1] << 8)) : (resp.data[0] || 0);
            document.getElementById('inputGainDisplay').textContent = gain;
        }
    };
    
    if (type === 'tcp') {
        state.tnc.connect(type, host, port);
    } else {
        state.tnc.connect(type, port, baud);
    }
}

let _heardRenderPending = false;
function requestHeardRender() {
    if (_heardRenderPending) return;
    _heardRenderPending = true;
    requestAnimationFrame(function() {
        _heardRenderPending = false;
        renderHeardList();
    });
}

function clearHeardList() {
    state.heardStations = [];
    renderHeardList();
    showToast(t('toast.heard_cleared'));
}

function renderHeardList() {
    const heard = document.getElementById('heardList');
    if (!heard) return;
    if (state.heardStations.length === 0) {
        heard.innerHTML = '<div style="text-align:center;color:#555;padding:20px;font-size:0.85em;">' + t('terminal.no_stations') + '</div>';
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
    const targetPos = gridToLatLon(targetGrid);
    const dist = targetPos ? haversine(state.myLat, state.myLon, targetPos.lat, targetPos.lon) : null;
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
    showToast(t('toast.qso_logged') + ' ' + qso.call + ' (' + qso.status + ')');
}

function renderQSOs() {
    const tbody = document.getElementById('qsoBody');
    if (state.qsoLog.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#555;padding:20px;">' + t('terminal.no_qsos') + '</td></tr>';
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
    if (!confirm(t('toast.qso_all_delete'))) return;
    state.qsoLog = [];
    persistSettings();
    renderQSOs();
    showToast(t('toast.qso_cleared'));
}

function exportQSOLog() {
    if (state.qsoLog.length === 0) {
        showToast(t('toast.no_qso_export'), true);
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
    showToast(t('toast.qso_exported'));
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
    var chatEl = document.getElementById('chatContainer');
    terminal.style.display = tab === 'terminal' ? '' : 'none';
    mapEl.style.display = tab === 'map' ? '' : 'none';
    navEl.style.display = tab === 'nav' ? '' : 'none';
    chatEl.style.display = tab === 'chat' ? '' : 'none';
    var panel = document.querySelector('.terminal-panel');
    panel.classList.toggle('map-active', tab === 'map');
    panel.classList.toggle('nav-active', tab === 'nav');
    panel.classList.toggle('chat-active', tab === 'chat');
    var followBtn = document.getElementById('mapFollowBtn');
    followBtn.style.display = tab === 'map' ? '' : 'none';
    var tileBtn = document.getElementById('mapTileToggle');
    if (tileBtn) {
        tileBtn.style.display = tab === 'map' ? '' : 'none';
        if (tab === 'map' && typeof updateTileToggleBtn === 'function') updateTileToggleBtn();
    }
    var clearBtn = document.getElementById('clearBtn');
    if (clearBtn) clearBtn.style.display = (tab === 'terminal' || tab === 'chat') ? '' : 'none';
    if (tab === 'nav' && typeof navView !== 'undefined') {
        setTimeout(function() { navView.resize(); }, 50);
    }
    if (tab === 'map' && typeof mapView !== 'undefined') {
        setTimeout(function() { if (mapView.getMap()) mapView.getMap().invalidateSize(); }, 50);
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
        toggleModal('beaconModal', false);
    }
});

function updateDigipathOptions(isTerrestrial) {
    const sel = document.getElementById('setPath');
    var html;
    if (isTerrestrial) {
        html = '<option>WIDE1-1</option><option>WIDE1-1,WIDE2-1</option><option>WIDE2-2</option><option>WIDE2-1</option><option>CQ</option><option>DIRECT</option>';
    } else {
        html = '<option>ARISS</option><option>WIDE1-1,WIDE2-1</option><option>WIDE1-1</option><option>WIDE2-2</option><option>DIRECT</option>';
    }
    if (state.customPaths && state.customPaths.length) {
        for (var i = 0; i < state.customPaths.length; i++) {
            var p = state.customPaths[i];
            if (p && ALL_STANDARD_PATHS.indexOf(p) < 0) {
                html += '<option>' + escapeHTML(p) + '</option>';
            }
        }
    }
    sel.innerHTML = html;
}

function sendFreeTextPacket() {
    const target = document.getElementById('packetTarget').value.trim().toUpperCase();
    const raw = document.getElementById('freeTextPacket').value.trim();
    if (!target) { showToast(t('toast.enter_target'), true); return; }
    if (!raw) { showToast(t('toast.enter_message'), true); return; }
    if (state.myCall === 'N0CALL') { showToast(t('toast.set_callsign'), true); return; }

    const seq = String(state.msgIdCounter).padStart(2, '0');
    state.msgIdCounter = (state.msgIdCounter % 99) + 1;
    persistSettings();

    const call = target.split(' ')[0];
    const info = formatAPRSMessage(call, raw, seq);

    const sourceCall = state.myCall;
    const destCall = isSatMode() ? state.tocallMsgSat : state.tocallMsgTer;
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
            showToast(t('toast.tx_error') + ' ' + e.message, true);
        }
    } else {
        addTerminalLine('system', t('toast.tnc_packet_logged'));
    }
    document.getElementById('freeTextPacket').value = '';
    // Chat: store sent messages
    if (!isSatMode()) {
        addChatMessage(call, raw, 'sent');
    }
}

// ── Tone calibration via KISS SetHardware ──
function toggleCalTone() {
    if (!state.tnc || !state.tnc.connected) {
        showToast(t('toast.tnc_not_connected'), true);
        document.getElementById('setToneEnable').checked = false;
        return;
    }
    var enabled = document.getElementById('setToneEnable').checked;
    if (enabled) {
        var freq = parseInt(document.getElementById('setToneFreq').value) || 1200;
        var subcmd = freq >= 2000 ? 0x08 : 0x07;
        state.tnc.sendCommand(0x06, new Uint8Array([subcmd]));
        showToast(t('toast.cal_tone') + ' ' + freq + ' Hz');
    } else {
        state.tnc.sendCommand(0x06, new Uint8Array([0x0A]));
        showToast(t('toast.cal_tone_stopped'));
    }
}

function updateCalToneFreq() {
    if (!document.getElementById('setToneEnable').checked) return;
    if (!state.tnc || !state.tnc.connected) return;
    var freq = parseInt(document.getElementById('setToneFreq').value) || 1200;
    var subcmd = freq >= 2000 ? 0x08 : 0x07;
    state.tnc.sendCommand(0x06, new Uint8Array([0x0A]));
    state.tnc.sendCommand(0x06, new Uint8Array([subcmd]));
}

// ── Audio level monitor (KISS streaming) ──
var _streamingLevel = false;

function toggleAudioMonitor() {
    if (!state.tnc || !state.tnc.connected) {
        showToast(t('toast.tnc_not_connected'), true);
        return;
    }
    var btn = document.getElementById('btnAudioMonitor');
    if (_streamingLevel) {
        state.tnc.sendCommand(0x06, new Uint8Array([0x04]));
        _streamingLevel = false;
        btn.setAttribute('data-i18n', 'btn.start_monitor');
        btn.textContent = t('btn.start_monitor');
        document.getElementById('inputLevelBar').value = 0;
        document.getElementById('inputLevelDb').textContent = '-- dB';
    } else {
        state.tnc.sendCommand(0x06, new Uint8Array([0x05]));
        _streamingLevel = true;
        btn.setAttribute('data-i18n', 'btn.stop_monitor');
        btn.textContent = t('btn.stop_monitor');
    }
}

// ── KISS apply from UI ──
function applyKISSFromUI() {
    if (!state.tnc || !state.tnc.connected) {
        showToast(t('toast.tnc_not_connected'), true);
        return;
    }
    var params = {
        txDelay: parseInt(document.getElementById('setTxDelay').value) || 300,
        persistence: parseInt(document.getElementById('setPersistence').value) || 63,
        slotTime: parseInt(document.getElementById('setSlotTime').value) || 100,
        txTail: parseInt(document.getElementById('setTxTail').value) || 20,
    };
    try {
        state.tnc.applyKISSParams(params);
        showToast(t('toast.kiss_applied'));
    } catch (e) {
        showToast(t('toast.error') + ' ' + e.message, true);
    }
}

// ── KISS read from TNC ──
function readKISSFromTNC() {
    if (!state.tnc || !state.tnc.connected) {
        showToast(t('toast.tnc_not_connected'), true);
        return;
    }
    state.tnc.sendCommand(0x06, new Uint8Array([0x21]));
    state.tnc.sendCommand(0x06, new Uint8Array([0x22]));
    state.tnc.sendCommand(0x06, new Uint8Array([0x23]));
    state.tnc.sendCommand(0x06, new Uint8Array([0x24]));
    showToast(t('toast.kiss_reading'));
}

// ── Digipath custom ──
function onDigipathChange() {
    var sel = document.getElementById('setPath');
    var cust = document.getElementById('setPathCustom');
    updateAddDelBtn();
}

function onDigipathCustomInput() {
    var cust = document.getElementById('setPathCustom');
    cust.value = cust.value.toUpperCase().replace(/[^A-Z0-9\-,*]/g, '');
    updateAddDelBtn();
}

function updateAddDelBtn() {
    var btn = document.getElementById('btnAddDelPath');
    var cust = document.getElementById('setPathCustom').value.trim().toUpperCase();
    if (!cust) {
        btn.disabled = true;
        btn.textContent = t('btn.add');
        return;
    }
    if (ALL_STANDARD_PATHS.indexOf(cust) >= 0) {
        btn.disabled = true;
        btn.textContent = t('btn.add');
        return;
    }
    if (state.customPaths && state.customPaths.indexOf(cust) >= 0) {
        btn.textContent = t('btn.del');
        btn.disabled = false;
    } else {
        btn.textContent = t('btn.add');
        btn.disabled = false;
    }
}

function onAddDelPath() {
    var cust = document.getElementById('setPathCustom').value.trim().toUpperCase();
    if (!cust || ALL_STANDARD_PATHS.indexOf(cust) >= 0) return;
    if (!state.customPaths) state.customPaths = [];
    var idx = state.customPaths.indexOf(cust);
    if (idx >= 0) {
        state.customPaths.splice(idx, 1);
    } else {
        state.customPaths.push(cust);
    }
    var oldVal = document.getElementById('setPath').value;
    updateDigipathOptions(!isSatMode());
    var sel = document.getElementById('setPath');
    if (Array.prototype.slice.call(sel.options).some(function(o) { return o.value === oldVal; })) {
        sel.value = oldVal;
    }
    state.digipath = sel.value;
    document.getElementById('pathDisplay').textContent = state.digipath;
    persistSettings();
    updateAddDelBtn();
}

// ── TX Gain ──
function updateTXGain() {
    var pct = parseInt(document.getElementById('setTXGain').value) || 50;
    document.getElementById('txGainVal').textContent = pct + '%';
    if (state.tnc && state.tnc.connected) {
        var gain = Math.round(pct / 100 * 255);
        state.tnc.sendCommand(0x06, new Uint8Array([0x01, gain & 0xFF, (gain >> 8) & 0xFF]));
    }
}

function readTXGain() {
    if (!state.tnc || !state.tnc.connected) {
        showToast(t('toast.tnc_not_connected'), true);
        return;
    }
    state.tnc.sendCommand(0x06, new Uint8Array([0x0C]));
}

// ── RX input auto-adjust ──
function adjustInputLevels() {
    if (!state.tnc || !state.tnc.connected) {
        showToast(t('toast.tnc_not_connected'), true);
        return;
    }
    state.tnc.sendCommand(0x06, new Uint8Array([0x2B]));
    showToast(t('toast.rx_adjusting'));
}

// ── Chat ──
var _chatMessages = {};

function loadChatMessages() {
    try {
        var saved = localStorage.getItem('orbitaprs_chatmessages');
        if (saved) _chatMessages = JSON.parse(saved);
    } catch (e) {}
    if (typeof _chatMessages !== 'object') _chatMessages = {};
}

function saveChatMessages() {
    try {
        localStorage.setItem('orbitaprs_chatmessages', JSON.stringify(_chatMessages));
    } catch (e) {}
}

function extractMessageBody(info) {
    if (!info || info[0] !== ':') return null;
    var secondColon = info.indexOf(':', 1);
    if (secondColon < 0) return null;
    var body = info.slice(secondColon + 1);
    var seqIdx = body.indexOf('{');
    if (seqIdx >= 0) body = body.slice(0, seqIdx);
    return body.trim() || null;
}

function parseThirdPartyPacket(info) {
    if (!info || info[0] !== '}') return null;
    var inner = info.slice(1);
    var gtIdx = inner.indexOf('>');
    var colonIdx = inner.indexOf(':', gtIdx);
    if (gtIdx < 0 || colonIdx < 0) return null;
    return {
        source: inner.slice(0, gtIdx),
        info: inner.slice(colonIdx + 1)
    };
}

function addChatMessage(call, text, type) {
    if (!call || !text) return;
    var fullCall = call.toUpperCase();
    var key = fullCall.split('-')[0];
    if (!_chatMessages[key]) _chatMessages[key] = [];
    _chatMessages[key].push({
        type: type,
        text: text,
        time: getUTCShort(),
        ts: Date.now()
    });
    if (_chatMessages[key].length > 200) _chatMessages[key].shift();
    saveChatMessages();

    var existing = state.chatList.findIndex(function(c) { return (c.baseCall || c.call) === key; });
    if (existing >= 0) {
        var ch = state.chatList[existing];
        ch.lastMessage = text;
        ch.lastTime = Date.now();
        ch.callFull = fullCall;
        if (key !== state.chatActive) ch.unread = (ch.unread || 0) + 1;
        state.chatList.splice(existing, 1);
        state.chatList.unshift(ch);
    } else {
        state.chatList.unshift({
            call: key,
            baseCall: key,
            callFull: fullCall,
            lastMessage: text,
            lastTime: Date.now(),
            unread: type === 'received' ? 1 : 0
        });
    }
    if (state.chatList.length > 50) state.chatList.pop();
    persistSettings();
    renderChatList();
    if (key === state.chatActive) renderChatMessages(key);
}

function selectChat(call) {
    var baseCall = call.split('-')[0];
    state.chatActive = baseCall;
    if (state.chatList.length) {
        var found = state.chatList.find(function(c) { return (c.baseCall || c.call) === baseCall; });
        if (found) {
            found.unread = 0;
            document.getElementById('packetTarget').value = found.callFull || found.call;
        } else {
            document.getElementById('packetTarget').value = call;
        }
    } else {
        document.getElementById('packetTarget').value = call;
    }
    persistSettings();
    renderChatList();
    renderChatMessages(baseCall);
}

function renderChatView() {
    renderChatList();
    if (state.chatActive && _chatMessages[state.chatActive]) {
        renderChatMessages(state.chatActive);
    } else {
        var msgs = document.getElementById('chatMessages');
        msgs.innerHTML = '<div class="chat-empty">Select a chat to start</div>';
    }
}

function renderChatList() {
    var el = document.getElementById('chatList');
    if (!el) return;
    if (!state.chatList.length) {
        el.innerHTML = '<div style="padding:10px;color:#444;font-size:0.75em;text-align:center;">' + t('chat.no_chats') + '</div>';
        return;
    }
    el.innerHTML = state.chatList.map(function(c) {
        var displayCall = c.callFull || c.call;
        var active = (c.baseCall || c.call) === state.chatActive ? ' active' : '';
        var unreadBadge = c.unread ? '<span class="chat-list-unread">' + c.unread + '</span>' : '';
        var ago = '';
        if (c.lastTime) {
            var secs = Math.round((Date.now() - c.lastTime) / 1000);
            ago = secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'm';
        }
        return '<div class="chat-list-item' + active + '" onclick="selectChat(\'' + displayCall + '\')">' +
            '<div class="chat-list-top"><span class="chat-list-call">' + displayCall + '</span>' + unreadBadge + '<span class="chat-list-time">' + ago + '</span></div>' +
            '<div class="chat-list-preview">' + escapeHTML((c.lastMessage || '').slice(0, 40)) + '</div>' +
            '</div>';
    }).join('');
}

function renderChatMessages(call) {
    var el = document.getElementById('chatMessages');
    if (!el) return;
    var msgs = _chatMessages[call];
    if (!msgs || !msgs.length) {
        el.innerHTML = '<div class="chat-empty">' + t('chat.no_messages') + '</div>';
        return;
    }
    el.innerHTML = msgs.map(function(m) {
        var cls = m.type === 'sent' ? 'sent' : 'received';
        return '<div class="chat-bubble ' + cls + '">' +
            escapeHTML(m.text) +
            '<div class="chat-bubble-time">' + m.time + '</div>' +
            '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
}

// ── Terrestrial Beacon ──
var _beaconTimer = null;

function saveBeaconConfig() {
    state.beaconInterval = parseInt(document.getElementById('beaconInterval').value) || 300;
    state.beaconShareLocation = document.getElementById('beaconShareLocation').checked;
    state.beaconMessage = document.getElementById('beaconMessage').value.trim();
    state.beaconEnabled = document.getElementById('beaconToggle').checked;
    persistSettings();
    toggleModal('beaconModal', false);
    updateBeaconState();
    showToast(t('toast.beacon_saved'));
}

function updateBeaconState() {
    var dot = document.getElementById('beaconStatusDot');
    if (!dot) return;
    var isActive = state.beaconEnabled && state.selectedSat === 'terrestrial';
    dot.className = 'status-dot ' + (isActive ? 'active' : 'idle');
    if (isActive) {
        startBeaconTimer();
    } else {
        stopBeaconTimer();
    }
}

function startBeaconTimer() {
    stopBeaconTimer();
    if (!state.beaconEnabled || state.selectedSat !== 'terrestrial') return;
    _beaconTimer = setInterval(sendBeaconPacket, state.beaconInterval * 1000);
}

function stopBeaconTimer() {
    if (_beaconTimer) {
        clearInterval(_beaconTimer);
        _beaconTimer = null;
    }
}

function sendBeaconPacket() {
    if (state.myCall === 'N0CALL') return;
    var lat = state.beaconShareLocation ? state.myLat : 0;
    var lon = state.beaconShareLocation ? state.myLon : 0;
    var aprsLat = latToAPRS(lat);
    var aprsLon = lonToAPRS(lon);
    var symbolTable = '/';
    var symbol = '[';
    var info = '=' + aprsLat + symbolTable + aprsLon + symbol;
    if (state.beaconMessage) {
        info += ' ' + state.beaconMessage;
    }
    var fullPacket = formatAPRSFrame(state.myCall, state.tocallPosTer, state.digipath, info);
    addTerminalLine('tx', fullPacket);
    if (state.tnc && state.tnc.connected) {
        try {
            var packet = {
                infoField: info,
                sourceCall: state.myCall,
                destCall: state.tocallPosTer,
                digipath: state.digipath,
                fullPacket: fullPacket,
            };
            var ax25 = buildAX25Frame(packet);
            state.tnc.send(ax25);
        } catch (e) {
            showToast(t('toast.beacon_tx_error') + ' ' + e.message, true);
        }
    }
}

function sendToSW(msg) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage(msg);
}

function clearTileCache() {
    sendToSW({ type: 'CLEAR_TILE_CACHE' });
    showToast(t('toast.tile_cache_cleared'));
}
