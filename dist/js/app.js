const DEFAULT_MACROS = [
    { id: 'm0', name: 'CQ',  icon: '📡', template: ':CQ:%G via %S{%N',              logQSO: false },
    { id: 'm1', name: 'Rpt', icon: '📻', template: ':%C:UR %RST{%N',                 logQSO: true  },
    { id: 'm2', name: '73',  icon: '💬', template: ':%C:QSL TU 73{%N',               logQSO: true  },
    { id: 'm3', name: 'Msg', icon: '✉️', template: ':CQ:via %S{%N',            logQSO: false },
    { id: 'm4', name: 'Pos', icon: '📍', template: '={lat}%T{lon}%Y OrbitAPRS',              logQSO: false },
];

function isSatMode() {
    if (!state.selectedSat || typeof satelliteDB === 'undefined') return false;
    const sat = satelliteDB.find(s => s.id === state.selectedSat);
    return sat && sat.type !== 'terrestrial';
}

var compassHeading = null;
var compassRaw = { alpha: null, beta: null, gamma: null, webkit: null };
var _compassDeviceListenerAdded = false;
var _sensorActive = false;
var ALL_STANDARD_PATHS = ['ARISS', 'WIDE1-1,WIDE2-1', 'WIDE1-1', 'WIDE2-2', 'DIRECT', 'WIDE2-1', 'CQ'];

const state = {
    myCall: 'N0CALL',
    myGrid: 'FN42',
    txFreq: 145.825,
    digipath: 'ARISS',
    myLat: 42.0,
    myLon: -71.0,
    myAlt: 50,
    selectedSat: null,
    qsoLog: [],
    pendingQSOs: [],
    tncType: 'serial',
    tncBaud: '57600',
    logLines: 300,
    autoQSO: true,
    tocallMsgSat: 'CQ',
    tocallPosSat: 'APRS',
    tocallMsgTer: 'APZ100',
    tocallPosTer: 'APZ100',
    tncHost: 'localhost',
    tncPort: '8001',
    rstDefault: '59',
    msgIdCounter: 0,
    lastTLEUpdate: null,
    heardStations: [],
    heardStationsLimit: 20,
    macros: DEFAULT_MACROS.map(m => ({...m})),
    satFreqOverrides: {},
    elevationOffset: 0,
    tnc: null,
    userSatellites: [],
    mapShowHeardSat: true,
    mapShowHeardTer: true,
    mapShowQSO: true,
    mapShowSat: true,
    mapShowGeodesic: true,
    mapColorHeardSat: '#3498db',
    mapColorHeardTer: '#f0a030',
    mapColorQSO: '#2ecc71',
    mapColorSat: '#aaaaaa',
    mapTileStyle: 'dark',
    mapTileCache: true,
    aprsSymbolSize: 24,
    termColorTx: '#f0a030',
    termColorRx: '#00e676',
    termColorEcho: '#008844',
    termColorOwn: '#3b9fd4',
    tncTxDelay: 300,
    tncPersistence: 63,
    tncSlotTime: 100,
    tncTxTail: 20,
    tncApplyOnConnect: false,
    toneFreq: 1200,
    txGain: 50,
    customPaths: [],
    chatList: [],
    chatActive: null,
    chatAck: {},
    beaconEnabled: false,
    beaconInterval: 300,
    beaconShareLocation: true,
    beaconMessage: '',
    beaconDestCall: 'GPS',
    stationSymbolTable: '/',
    stationSymbolCode: '[',
    msgRetries: 3,
    lang: 'es',
};

function computeHeading(alpha, beta, gamma) {
    var a = alpha * Math.PI / 180;
    var b = beta * Math.PI / 180;
    var g = gamma * Math.PI / 180;
    var heading = Math.atan2(
        Math.sin(a) * Math.cos(g) + Math.cos(a) * Math.sin(b) * Math.sin(g),
        Math.cos(a) * Math.cos(b)
    );
    return (heading * 180 / Math.PI + 360) % 360;
}

function startCompassListener() {
    if (_compassDeviceListenerAdded) return;
    _compassDeviceListenerAdded = true;
    window.addEventListener('deviceorientationabsolute', function(e) {
        compassRaw.alpha = e.alpha;
        compassRaw.beta = e.beta;
        compassRaw.gamma = e.gamma;
        if (e.alpha !== null && e.alpha !== undefined) {
            compassHeading = (360 - e.alpha) % 360;
            _sensorActive = true;
        }
    }, { passive: true });
    window.addEventListener('deviceorientation', function(e) {
        compassRaw.alpha = e.alpha;
        compassRaw.beta = e.beta;
        compassRaw.gamma = e.gamma;
        compassRaw.webkit = e.webkitCompassHeading;
        if (_sensorActive) return;
        if (e.alpha === null || e.alpha === undefined) return;
        if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
            compassHeading = e.webkitCompassHeading;
        } else if (e.beta !== null && e.gamma !== null) {
            compassHeading = computeHeading(e.alpha, e.beta, e.gamma);
        } else {
            compassHeading = (360 - e.alpha) % 360;
        }
    }, { passive: true });
}

function initCompass() {
    if (!window.DeviceOrientationEvent) return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') return;
    startCompassListener();
}

function requestCompassPermission() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function(state) {
            if (state === 'granted') {
                startCompassListener();
            }
        });
    }
}

function init() {
    loadSettings();
    updateDisplays();
    renderHeardList();
    renderQuickActions();
    updateUTCClock();
    loadTLECache();
    initCompass();
    setInterval(updateUTCClock, 1000);
    setInterval(refreshSatPasses, 30000);
    setInterval(renderHeardList, 10000);
    refreshSatPasses();
    if (state.selectedSat) {
        selectSatellite(state.selectedSat);
    } else {
        selectSatellite('iss');
    }
    if (typeof updateBeaconState === 'function') updateBeaconState();
    if (typeof applyLanguage === 'function') applyLanguage();
    if (typeof startAckTimer === 'function' && state.msgRetries > 0) startAckTimer();

    document.getElementById('terminal').innerHTML =
        '<div class="line system"><span class="timestamp">[READY]</span> ' + t('terminal.ready') + '</div>';
    if (location.protocol === 'file:') {
        addTerminalLine('system', t('terminal.file_warning'));
    }
    document.getElementById('setTncType').addEventListener('change', toggleBluetoothFields);
    toggleBluetoothFields();
    if (typeof loadChatMessages === 'function') loadChatMessages();
    
    document.getElementById('setTncType').addEventListener('change', function() {
        const type = document.getElementById('setTncType').value;
        if (type === 'tcp') {
            document.getElementById('setTncHost').focus();
        }
    });

    try {
        if (navigator.serial) {
            navigator.serial.addEventListener('connect', () => {
                addTerminalLine('system', t('terminal.usb_detected'));
                showToast(t('toast.tnc_detected'));
                document.getElementById('tncStatusDot').className = 'status-dot warning';
            });
            navigator.serial.addEventListener('disconnect', () => {
                addTerminalLine('system', t('terminal.usb_removed'));
            });
        }
    } catch (_) {}
}

function toggleBluetoothFields() {
    const type = document.getElementById('setTncType').value;
    const baudGroup = document.getElementById('setTncBaud').closest('.form-group');
    const tcpHostPortGroup = document.querySelectorAll('.tcp-host-port');
    
    if (type === 'bluetooth' || type === 'tcp') {
        baudGroup.style.display = 'none';
    } else {
        baudGroup.style.display = '';
    }
    
    if (type === 'tcp') {
        tcpHostPortGroup.forEach(el => el.style.display = '');
    } else {
        tcpHostPortGroup.forEach(el => el.style.display = 'none');
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('orbitaprs_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                state.myCall = s.myCall || 'N0CALL';
                state.myGrid = s.myGrid || 'FN42';
                state.txFreq = s.txFreq || 145.825;
                state.digipath = s.digipath || 'ARISS';
                state.myLat = (s.myLat !== undefined && s.myLat !== null && s.myLat !== '') ? s.myLat : 42.0;
                state.myLon = (s.myLon !== undefined && s.myLon !== null && s.myLon !== '') ? s.myLon : -71.0;
                state.myAlt = s.myAlt || 50;
                state.qsoLog = s.qsoLog || [];
                state.tncType = s.tncType || 'serial';
                state.tncHost = s.tncHost || 'localhost';
                state.tncPort = s.tncPort || '8001';
                state.tncBaud = s.tncBaud || '57600';
                state.logLines = s.logLines || 300;
                state.autoQSO = s.autoQSO !== undefined ? s.autoQSO : true;
                state.rawMonitor = s.rawMonitor || false;
                state.rstDefault = s.rstDefault || '59';
                state.tocallMsgSat = s.tocallMsgSat || s.tocall || 'CQ';
                state.tocallPosSat = s.tocallPosSat || s.tocall || 'APRS';
                state.tocallMsgTer = s.tocallMsgTer || s.tocall || 'APZ100';
                state.tocallPosTer = s.tocallPosTer || s.tocall || 'APZ100';
                state.msgIdCounter = s.msgIdCounter !== undefined ? s.msgIdCounter : 0;
                state.lastTLEUpdate = s.lastTLEUpdate || null;
                state.macros = (s.macros && s.macros.length && s.macros[0].template) ? s.macros.map(function(m) {
                    var macro = Object.assign({}, m);
                    delete macro.symbolTable;
                    delete macro.symbol;
                    if (macro.template && macro.template.charAt(0) === '=' && macro.template.indexOf('%T') === -1 && macro.template.indexOf('%Y') === -1) {
                        macro.template = macro.template.replace('{lat}', '{lat}%T').replace('{lon}', '{lon}%Y');
                    }
                    return macro;
                }) : DEFAULT_MACROS.map(function(m) { return Object.assign({}, m); });
                state.satFreqOverrides = s.satFreqOverrides || {};
                state.elevationOffset = (s.elevationOffset !== undefined && s.elevationOffset !== null) ? s.elevationOffset : 0;
                state.userSatellites = s.userSatellites || [];
                state.mapShowHeardSat = s.mapShowHeardSat !== undefined ? s.mapShowHeardSat : true;
                state.mapShowHeardTer = s.mapShowHeardTer !== undefined ? s.mapShowHeardTer : true;
                state.mapShowQSO = s.mapShowQSO !== undefined ? s.mapShowQSO : true;
                state.mapShowSat = s.mapShowSat !== undefined ? s.mapShowSat : true;
                state.mapShowGeodesic = s.mapShowGeodesic !== undefined ? s.mapShowGeodesic : true;
                state.mapColorHeardSat = s.mapColorHeardSat || '#3498db';
                state.mapColorHeardTer = s.mapColorHeardTer || '#f0a030';
                state.mapColorQSO = s.mapColorQSO || '#2ecc71';
                state.mapColorSat = s.mapColorSat || '#aaaaaa';
                state.mapTileStyle = s.mapTileStyle || 'dark';
                state.mapTileCache = s.mapTileCache !== undefined ? s.mapTileCache : true;
                state.aprsSymbolSize = s.aprsSymbolSize || 24;
                state.termColorTx = s.termColorTx || '#f0a030';
                state.termColorRx = s.termColorRx || '#00e676';
                state.termColorEcho = s.termColorEcho || '#008844';
                state.termColorOwn = s.termColorOwn || '#3b9fd4';
                state.tncTxDelay = s.tncTxDelay !== undefined ? s.tncTxDelay : 300;
                state.tncPersistence = s.tncPersistence !== undefined ? s.tncPersistence : 63;
                state.tncSlotTime = s.tncSlotTime !== undefined ? s.tncSlotTime : 100;
                state.tncTxTail = s.tncTxTail !== undefined ? s.tncTxTail : 20;
                state.tncApplyOnConnect = s.tncApplyOnConnect !== undefined ? s.tncApplyOnConnect : false;
                state.txGain = s.txGain !== undefined ? s.txGain : 50;
                state.heardStationsLimit = s.heardStationsLimit || 20;
                state.customPaths = Array.isArray(s.customPaths) ? s.customPaths : [];
                state.chatList = Array.isArray(s.chatList) ? s.chatList : [];
                state.selectedSat = s.selectedSat || null;
                state.chatActive = s.chatActive || null;
                state.chatAck = s.chatAck || {};
                state.beaconEnabled = s.beaconEnabled === true;
                state.beaconInterval = s.beaconInterval || 300;
                state.beaconShareLocation = s.beaconShareLocation !== false;
                state.beaconMessage = s.beaconMessage || '';
                state.beaconDestCall = s.beaconDestCall || 'GPS';
                state.stationSymbolTable = s.stationSymbolTable || s.beaconSymbolTable || '/';
                state.stationSymbolCode = s.stationSymbolCode || s.beaconSymbolCode || '[';
                state.msgRetries = s.msgRetries !== undefined ? s.msgRetries : 3;
                state.lang = s.lang || 'es';
            } catch (e) {}
        }
    } catch (e) {}
    populateSettingsFields();
}

function populateSettingsFields() {
    document.getElementById('setCall').value = state.myCall;
    document.getElementById('setGrid').value = state.myGrid;
    var savedDigipath = state.digipath;
    if (typeof updateDigipathOptions === 'function') updateDigipathOptions(!isSatMode());
    state.digipath = savedDigipath;
    document.getElementById('setPath').value = savedDigipath;
    document.getElementById('setPathCustom').value = '';
    if (typeof updateAddDelBtn === 'function') updateAddDelBtn();
    document.getElementById('setLat').value = state.myLat;
    document.getElementById('setLon').value = state.myLon;
    document.getElementById('setElevationOffset').value = state.elevationOffset;
    document.getElementById('setTncType').value = state.tncType;
    document.getElementById('setTncBaud').value = state.tncBaud;
    document.getElementById('setLogLines').value = state.logLines;
    document.getElementById('setAutoQSO').value = state.autoQSO ? '1' : '0';
    document.getElementById('setHeardLimit').value = state.heardStationsLimit;
    document.getElementById('setRawMonitor').checked = state.rawMonitor;
    document.getElementById('setRstDefault').value = state.rstDefault;
    updateTocallFields();
    document.getElementById('mapShowHeardSat').checked = state.mapShowHeardSat;
    document.getElementById('mapShowHeardTer').checked = state.mapShowHeardTer;
    document.getElementById('mapShowQSO').checked = state.mapShowQSO;
    document.getElementById('mapShowSat').checked = state.mapShowSat;
    document.getElementById('mapShowGeodesic').checked = state.mapShowGeodesic;
    document.getElementById('mapColorHeardSat').value = state.mapColorHeardSat;
    document.getElementById('mapColorHeardTer').value = state.mapColorHeardTer;
    document.getElementById('mapColorQSO').value = state.mapColorQSO;
    document.getElementById('mapColorSat').value = state.mapColorSat;
    document.getElementById('setMapTileStyle').value = state.mapTileStyle;
    document.getElementById('setMapTileCache').checked = state.mapTileCache;
    document.getElementById('aprsSymbolSize').value = state.aprsSymbolSize;
    var stBtn = document.getElementById('stationSymbolBtn');
    if (stBtn) {
        var tbl = state.stationSymbolTable || '/';
        var sym = state.stationSymbolCode || '[';
        var name = getSymbolName(tbl, sym);
        stBtn.innerHTML = '<img src="icons/symbols/' + (tbl === '/' ? 'primary' : 'alternate') + '/' + sym.charCodeAt(0) + '.png" width="16" height="16" style="vertical-align:middle;margin-right:4px;">' + tbl + sym + ' ' + name;
    }
    document.getElementById('termColorTx').value = state.termColorTx;
    document.getElementById('termColorRx').value = state.termColorRx;
    document.getElementById('termColorEcho').value = state.termColorEcho;
    document.getElementById('termColorOwn').value = state.termColorOwn;
    document.getElementById('setTxDelay').value = state.tncTxDelay;
    document.getElementById('setPersistence').value = state.tncPersistence;
    document.getElementById('setSlotTime').value = state.tncSlotTime;
    document.getElementById('setTxTail').value = state.tncTxTail;
    document.getElementById('setApplyOnConnect').checked = state.tncApplyOnConnect;
    document.getElementById('setToneFreq').value = String(state.toneFreq);
    document.getElementById('setTXGain').value = state.txGain;
    document.getElementById('txGainVal').textContent = state.txGain + '%';
    if (document.getElementById('setLang')) {
        document.getElementById('setLang').value = state.lang || 'es';
    }
    if (document.getElementById('setMsgRetries')) {
        document.getElementById('setMsgRetries').value = state.msgRetries;
    }
    updateTocallFields();
}

function updateTocallFields() {
    const isSat = isSatMode();
    const mode = isSat ? 'SAT' : 'TER';
    document.getElementById('labelTocallMsg').textContent = t('label.tocall_msg') + ' (' + mode + ')';
    document.getElementById('labelTocallPos').textContent = t('label.tocall_pos') + ' (' + mode + ')';
    document.getElementById('setTocallMsg').value = isSat ? state.tocallMsgSat : state.tocallMsgTer;
    document.getElementById('setTocallPos').value = isSat ? state.tocallPosSat : state.tocallPosTer;
}

function saveSettings() {
    state.myCall = document.getElementById('setCall').value.toUpperCase().trim() || 'N0CALL';
    state.myGrid = document.getElementById('setGrid').value.toUpperCase().trim() || 'FN42';
    state.digipath = document.getElementById('setPath').value || 'ARISS';
    state.myLat = parseFloat(document.getElementById('setLat').value) || 42.0;
    state.myLon = parseFloat(document.getElementById('setLon').value) || -71.0;
    state.myGrid = latLonToGrid(state.myLat, state.myLon, 4);
    document.getElementById('setGrid').value = state.myGrid;
    state.elevationOffset = parseFloat(document.getElementById('setElevationOffset').value) || 0;
    var retriesEl = document.getElementById('setMsgRetries');
    if (retriesEl) {
        var v = parseInt(retriesEl.value, 10);
        state.msgRetries = isNaN(v) ? 3 : Math.max(0, Math.min(10, v));
    }
    state.tncType = document.getElementById('setTncType').value || 'serial';
    state.tncHost = document.getElementById('setTncHost').value.trim() || 'localhost';
    state.tncPort = document.getElementById('setTncPort').value.trim() || '8001';
    state.tncBaud = document.getElementById('setTncBaud').value || '57600';
    state.logLines = parseInt(document.getElementById('setLogLines').value) || 300;
    state.autoQSO = document.getElementById('setAutoQSO').value === '1';
    state.heardStationsLimit = parseInt(document.getElementById('setHeardLimit').value) || 20;
    state.rawMonitor = document.getElementById('setRawMonitor').checked;
    state.rstDefault = document.getElementById('setRstDefault').value || '59';
    if (isSatMode()) {
        state.tocallMsgSat = document.getElementById('setTocallMsg').value.toUpperCase().trim() || 'CQ';
        state.tocallPosSat = document.getElementById('setTocallPos').value.toUpperCase().trim() || 'APRS';
    } else {
        state.tocallMsgTer = document.getElementById('setTocallMsg').value.toUpperCase().trim() || 'APZ100';
        state.tocallPosTer = document.getElementById('setTocallPos').value.toUpperCase().trim() || 'APZ100';
    }
    state.mapShowHeardSat = document.getElementById('mapShowHeardSat').checked;
    state.mapShowHeardTer = document.getElementById('mapShowHeardTer').checked;
    state.mapShowQSO = document.getElementById('mapShowQSO').checked;
    state.mapShowSat = document.getElementById('mapShowSat').checked;
    state.mapShowGeodesic = document.getElementById('mapShowGeodesic').checked;
    state.mapColorHeardSat = document.getElementById('mapColorHeardSat').value;
    state.mapColorHeardTer = document.getElementById('mapColorHeardTer').value;
    state.mapColorQSO = document.getElementById('mapColorQSO').value;
    state.mapColorSat = document.getElementById('mapColorSat').value;
    state.mapTileStyle = document.getElementById('setMapTileStyle').value || 'dark';
    state.mapTileCache = document.getElementById('setMapTileCache').checked;
    state.aprsSymbolSize = parseInt(document.getElementById('aprsSymbolSize').value) || 24;
    state.termColorTx = document.getElementById('termColorTx').value;
    state.termColorRx = document.getElementById('termColorRx').value;
    state.termColorEcho = document.getElementById('termColorEcho').value;
    state.termColorOwn = document.getElementById('termColorOwn').value;
    state.tncTxDelay = parseInt(document.getElementById('setTxDelay').value) || 300;
    state.tncPersistence = parseInt(document.getElementById('setPersistence').value) || 63;
    state.tncSlotTime = parseInt(document.getElementById('setSlotTime').value) || 100;
    state.tncTxTail = parseInt(document.getElementById('setTxTail').value) || 20;
    state.tncApplyOnConnect = document.getElementById('setApplyOnConnect').checked;
    state.toneFreq = parseInt(document.getElementById('setToneFreq').value) || 1200;
    state.txGain = parseInt(document.getElementById('setTXGain').value) || 50;
    persistSettings();
    updateDisplays();
    if (typeof mapView !== 'undefined' && mapView.updateMyStation) mapView.updateMyStation();
    if (typeof mapView !== 'undefined' && mapView.updateHeard) mapView.updateHeard();
    if (typeof mapView !== 'undefined' && mapView.setTileStyle) mapView.setTileStyle(state.mapTileStyle);
    if (typeof sendToSW === 'function') sendToSW({ type: 'SET_TILE_CACHE', enabled: state.mapTileCache });
    refreshSatPasses();
    toggleModal('settingsModal', false);
    showToast(t('toast.settings_saved'));
}

function updateGridFromCoords() {
    var lat = parseFloat(document.getElementById('setLat').value);
    var lon = parseFloat(document.getElementById('setLon').value);
    if (!isNaN(lat) && !isNaN(lon)) {
        document.getElementById('setGrid').value = latLonToGrid(lat, lon, 4);
    }
}

var _noradCache = [];

function onNoradInput() {
    if (_noradCache.length === 0) {
        fetchNoradSuggestions();
    }
}

async function fetchNoradSuggestions() {
    try {
        var resp = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle', {
            headers: { 'Accept': 'text/plain, */*' }
        });
        if (!resp.ok) return;
        var text = await resp.text();
        var lines = text.split('\n').filter(function(l) { return l.trim() !== ''; });
        var suggestions = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith('1 ') && i + 1 < lines.length && lines[i + 1].trim().startsWith('2 ')) {
                var tle1 = line;
                var noradId = parseInt(tle1.split(/\s+/)[1], 10);
                var name = 'Unknown';
                if (i > 0) {
                    var prev = lines[i - 1].trim();
                    if (!prev.startsWith('1 ') && !prev.startsWith('2 ') && prev.length > 0) {
                        name = prev;
                    }
                }
                if (!isNaN(noradId)) suggestions.push({ noradId: noradId, name: name });
            }
        }
        _noradCache = suggestions;
        var datalist = document.getElementById('noradSuggestions');
        if (datalist) {
            datalist.innerHTML = suggestions.map(function(s) {
                return '<option value="' + s.noradId + '">' + s.name + ' (' + s.noradId + ')</option>';
            }).join('');
        }
    } catch (e) {}
}

async function addSatelliteByNorad() {
    var input = document.getElementById('setNoradId');
    if (!input) return;
    var val = input.value.trim();
    if (!val) { showToast(t('toast.norad_required'), true); return; }
    var noradId = parseInt(val, 10);
    if (isNaN(noradId)) { showToast(t('toast.norad_invalid'), true); return; }
    if (satelliteDB.some(function(s) { return s.noradId === noradId; })) {
        showToast(t('toast.sat_exists'), true);
        return;
    }
    try {
        showToast(t('toast.tle_fetching'));
        var resp = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=' + noradId + '&FORMAT=TLE', {
            headers: { 'Accept': 'text/plain, */*' }
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var text = await resp.text();
        var lines = text.split('\n').filter(function(l) { return l.trim() !== ''; });
        var tle1 = null, tle2 = null, name = 'SAT' + noradId;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith('1 ') && !tle1) {
                tle1 = line;
                if (i > 0) {
                    var prev = lines[i - 1].trim();
                    if (!prev.startsWith('1 ') && !prev.startsWith('2 ') && prev.length > 0) name = prev;
                }
            } else if (line.startsWith('2 ') && tle1 && !tle2) {
                tle2 = line;
            }
        }
        if (!tle1 || !tle2) throw new Error(t('toast.tle_parse_error'));
        var id = 'user_' + noradId;
        var sat = {
            id: id, noradId: noradId, name: name,
            freq: state.txFreq, freqRX: state.txFreq, type: 'digipeater',
            tle1: tle1, tle2: tle2, color: '#3b9fd4',
        };
        satelliteDB.push(sat);
        state.userSatellites.push(noradId);
        persistSettings();
        saveTLECache();
        renderSatListManage();
        renderSatModal();
        input.value = '';
        showToast(t('toast.sat_added') + ' ' + name);
    } catch (err) {
        showToast(t('toast.error') + ' ' + err.message, true);
    }
}

function removeSatellite(noradId) {
    var idx = satelliteDB.findIndex(function(s) { return s.noradId === noradId; });
    if (idx >= 0) {
        var sat = satelliteDB[idx];
        if (sat.id === 'terrestrial' || sat.id === 'iss') {
            showToast(t('toast.cannot_remove_default'), true);
            return;
        }
        satelliteDB.splice(idx, 1);
    }
    var uidx = state.userSatellites.indexOf(noradId);
    if (uidx >= 0) state.userSatellites.splice(uidx, 1);
    persistSettings();
    renderSatListManage();
    renderSatModal();
    showToast(t('toast.sat_removed'));
}

function renderSatListManage() {
    var el = document.getElementById('satListManage');
    if (!el) return;
    el.innerHTML = satelliteDB.map(function(s) {
        if (s.id === 'terrestrial') return '';
        var canRemove = s.noradId && state.userSatellites.indexOf(s.noradId) >= 0;
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border);font-size:0.85em;">' +
            '<span>' + s.name + ' <span style="color:#666;">(' + s.noradId + ')</span></span>' +
            (canRemove ? '<button class="btn btn-sm btn-outline" onclick="removeSatellite(' + s.noradId + ')" style="color:#e74c3c;border-color:#e74c3c;font-size:0.8em;">✕</button>' : '') +
            '</div>';
    }).join('');
}

function persistSettings() {
    try {
        localStorage.setItem('orbitaprs_settings', JSON.stringify({
            myCall: state.myCall, myGrid: state.myGrid, txFreq: state.txFreq,
            digipath: state.digipath, myLat: state.myLat, myLon: state.myLon,
            myAlt: state.myAlt, qsoLog: state.qsoLog,
            tncType: state.tncType, tncHost: state.tncHost, tncPort: state.tncPort, tncBaud: state.tncBaud,
            logLines: state.logLines, autoQSO: state.autoQSO, rawMonitor: state.rawMonitor,
            rstDefault: state.rstDefault, tocall: state.tocallMsgSat,
            tocallMsgSat: state.tocallMsgSat, tocallPosSat: state.tocallPosSat,
            tocallMsgTer: state.tocallMsgTer, tocallPosTer: state.tocallPosTer, msgIdCounter: state.msgIdCounter,
            lastTLEUpdate: state.lastTLEUpdate, macros: state.macros,
            satFreqOverrides: state.satFreqOverrides, elevationOffset: state.elevationOffset,
            userSatellites: state.userSatellites,
            mapShowHeardSat: state.mapShowHeardSat, mapShowHeardTer: state.mapShowHeardTer,
            mapShowQSO: state.mapShowQSO, mapShowSat: state.mapShowSat, mapShowGeodesic: state.mapShowGeodesic,
            mapColorHeardSat: state.mapColorHeardSat, mapColorHeardTer: state.mapColorHeardTer,
            mapColorQSO: state.mapColorQSO, mapColorSat: state.mapColorSat,
            mapTileStyle: state.mapTileStyle, mapTileCache: state.mapTileCache, aprsSymbolSize: state.aprsSymbolSize,
            termColorTx: state.termColorTx, termColorRx: state.termColorRx,
            termColorEcho: state.termColorEcho, termColorOwn: state.termColorOwn,
            tncTxDelay: state.tncTxDelay, tncPersistence: state.tncPersistence,
            tncSlotTime: state.tncSlotTime, tncTxTail: state.tncTxTail,
            tncApplyOnConnect: state.tncApplyOnConnect,
            toneFreq: state.toneFreq, txGain: state.txGain,
            customPaths: state.customPaths,
            chatList: state.chatList,
            heardStationsLimit: state.heardStationsLimit,
            selectedSat: state.selectedSat,
            chatActive: state.chatActive,
            chatAck: state.chatAck,
            beaconEnabled: state.beaconEnabled,
            beaconInterval: state.beaconInterval,
            beaconShareLocation: state.beaconShareLocation,
            beaconMessage: state.beaconMessage,
            beaconDestCall: state.beaconDestCall,
            stationSymbolTable: state.stationSymbolTable,
            stationSymbolCode: state.stationSymbolCode,
            msgRetries: state.msgRetries,
            lang: state.lang,
        }));
    } catch (e) {}
}

function updateDisplays() {
    document.getElementById('myCallDisplay').textContent = state.myCall;
    document.getElementById('myGridDisplay').textContent = state.myGrid;
    document.getElementById('txFreqDisplay').textContent = state.txFreq.toFixed(3) + ' MHz';
    document.getElementById('pathDisplay').textContent = state.digipath;
    document.getElementById('tocallDisplay').textContent = isSatMode() ? state.tocallMsgSat : state.tocallMsgTer;
    if (typeof updateTocallFields === 'function') updateTocallFields();
    const sat = satelliteDB.find(s => s.id === state.selectedSat);
    if (sat) document.getElementById('satNameDisplay').textContent = sat.name.split(' ')[0];
    
    // Update TCP host/port fields
    if (document.getElementById('setTncHost')) {
        document.getElementById('setTncHost').value = state.tncHost || '';
    }
    if (document.getElementById('setTncPort')) {
        document.getElementById('setTncPort').value = state.tncPort || '';
    }
    
    renderQSOs();
}

function useGPSSettings() {
    if (!navigator.geolocation) {
        showToast(t('toast.gps_unavailable'), true);
        return;
    }
    showToast(t('toast.gps_requesting'));
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            document.getElementById('setLat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('setLon').value = pos.coords.longitude.toFixed(6);
            if (pos.coords.altitude !== null) {
                state.myAlt = Math.round(pos.coords.altitude);
            }
            updateGridFromCoords();
            saveSettings();
        },
        (err) => {
            showToast(t('toast.gps_error') + ' ' + err.message, true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function updateUTCClock() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mi = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    document.getElementById('utcDate').textContent = yyyy + '-' + mm + '-' + dd;
    document.getElementById('utcTime').textContent = hh + ':' + mi + ':' + ss + ' UTC';
    var betaEl = document.getElementById('betaRawDisplay');
    if (betaEl) {
        betaEl.textContent = compassRaw.beta !== null ? '(current: ' + compassRaw.beta.toFixed(1) + '\u00b0)' : '';
    }
}

function getUTCShort() {
    return new Date().toISOString().slice(11, 19);
}

function getUTCNow() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
