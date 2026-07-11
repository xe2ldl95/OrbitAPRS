function latToAPRS(lat) {
    const a = Math.abs(lat);
    const d = Math.floor(a), m = (a - d) * 60;
    return d.toString().padStart(2, '0') + m.toFixed(2).padStart(5, '0') + (lat >= 0 ? 'N' : 'S');
}

function lonToAPRS(lon) {
    const a = Math.abs(lon);
    const d = Math.floor(a), m = (a - d) * 60;
    return d.toString().padStart(3, '0') + m.toFixed(2).padStart(5, '0') + (lon >= 0 ? 'E' : 'W');
}

function buildAX25Frame(packet) {
    if (packet.sourceCall && !validateCallsign(packet.sourceCall)) {
        throw new Error('Invalid source callsign: ' + packet.sourceCall);
    }
    if (packet.destCall && !validateCallsign(packet.destCall)) {
        throw new Error('Invalid destination callsign: ' + packet.destCall);
    }
    const info = stringToBytes(packet.infoField);
    if (info.length > 256) {
        throw new Error('Info field exceeds 256 bytes (' + info.length + ')');
    }
    const hasDigi = packet.digipath && packet.digipath !== 'DIRECT';
    const dest = encodeAX25Address(packet.destCall || 'APRS', 0);
    const src = encodeAX25Address(packet.sourceCall, hasDigi ? 0x00 : 0x01);
    let digi = [];
    if (hasDigi) {
        const dlist = packet.digipath.split(',');
        dlist.forEach((d, i) => {
            const dd = d.trim();
            if (dd) digi = digi.concat(Array.from(encodeAX25Address(dd, i === dlist.length - 1 ? 0x01 : 0)));
        });
    }
    const ctrl = 0x03, pid = 0xF0;
    let frame = [...dest, ...src, ...digi, ctrl, pid, ...info];
    const fcs = calcFCS(frame);
    frame.push(fcs & 0xFF, (fcs >> 8) & 0xFF);
    return new Uint8Array(frame);
}

function encodeAX25Address(call, flags) {
    const b = new Uint8Array(7);
    let base = call, ssid = 0;
    const dash = call.indexOf('-');
    if (dash >= 0) {
        base = call.slice(0, dash);
        ssid = parseInt(call.slice(dash + 1), 10) || 0;
    }
    for (let i = 0; i < 6; i++) b[i] = (i < base.length ? base.charCodeAt(i) << 1 : 0x20 << 1);
    b[6] = 0x60 | ((ssid & 0x0F) << 1) | (flags & 0x01);
    return b;
}

function calcFCS(data) {
    let fcs = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        fcs ^= data[i];
        for (let j = 0; j < 8; j++) fcs = (fcs & 1) ? (fcs >> 1) ^ 0x8408 : fcs >> 1;
    }
    return (~fcs) & 0xFFFF;
}

function validateFCS(frame) {
    if (frame.length < 18) return false;
    const data = frame.slice(0, -2);
    const fcsRecv = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
    return calcFCS(data) === fcsRecv;
}

function validateCallsign(call) {
    if (!call || call.length === 0) return false;
    let base = call, ssid = null;
    const dash = call.indexOf('-');
    if (dash >= 0) {
        base = call.slice(0, dash);
        ssid = parseInt(call.slice(dash + 1), 10);
        if (isNaN(ssid) || ssid < 0 || ssid > 15) return false;
    }
    if (base.length < 1 || base.length > 6) return false;
    for (let i = 0; i < base.length; i++) {
        const c = base.charCodeAt(i);
        if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122))) return false;
    }
    return true;
}

function stringToBytes(str) {
    return Array.from(str).map(c => c.charCodeAt(0) & 0xFF);
}

function _ax25AddrAt(data, off) {
    let call = '';
    for (let i = off; i < off + 6; i++) {
        const c = String.fromCharCode(data[i] >> 1);
        if (c !== ' ') call += c;
    }
    const ssid = (data[off + 6] >> 1) & 0x0F;
    const repeated = !!(data[off + 6] & 0x80); // bit 7 H-bit: 1 = repeated by digipeater
    return { base: call, ssid: ssid, full: ssid > 0 ? call + '-' + ssid : call, repeated };
}

function parseAX25Frame(bytes) {
    if (bytes.length < 16) return null;
    let data;
    if (bytes.length >= 18 && validateFCS(bytes)) {
        data = bytes.slice(0, -2);
    } else {
        data = bytes;
    }
    let addrEnd = 0;
    for (let i = 6; i < data.length; i += 7) {
        if (data[i] & 0x01) { addrEnd = i + 1; break; }
    }
    if (addrEnd < 14) return null;
    if (data[addrEnd] !== 0x03) return null;
    if (data[addrEnd + 1] !== 0xF0) return null;
    const dst = _ax25AddrAt(data, 0);
    const src = _ax25AddrAt(data, 7);
    const digiPath = [];
    const digiRepeated = [];
    for (let i = 14; i < addrEnd; i += 7) {
        const d = _ax25AddrAt(data, i);
        digiPath.push(d.full);
        digiRepeated.push(d.repeated);
    }
    let infoField = '';
    for (let i = addrEnd + 2; i < data.length; i++) {
        infoField += String.fromCharCode(data[i]);
    }
    return {
        source: src.full,
        sourceBase: src.base,
        sourceSSID: src.ssid,
        dest: dst.full,
        destBase: dst.base,
        destSSID: dst.ssid,
        digiPath: digiPath,
        digiRepeated: digiRepeated,
        info: infoField,
    };
}

function latLonToGrid(lat, lon, length) {
    if (length !== 4 && length !== 6) length = 6;
    const adjLon = lon + 180, adjLat = lat + 90;
    const fLon = Math.floor(adjLon / 20), fLat = Math.floor(adjLat / 10);
    let grid = String.fromCharCode(65 + fLon) + String.fromCharCode(65 + fLat);
    if (length <= 2) return grid;
    const sLon = Math.floor((adjLon % 20) / 2), sLat = Math.floor((adjLat % 10) / 1);
    grid += sLon.toString() + sLat.toString();
    if (length <= 4) return grid;
    const uLon = Math.floor((adjLon % 2) / (2 / 24)), uLat = Math.floor((adjLat % 1) / (1 / 24));
    grid += String.fromCharCode(97 + uLon) + String.fromCharCode(97 + uLat);
    return grid.toUpperCase();
}

// ── APRS Packet Formatter (APRS 1.01 spec) ──

function padTarget(target) {
    return target.padEnd(9, ' ').slice(0, 9);
}

function formatAPRSMessage(target, message, msgId) {
    const t = padTarget(target);
    let info = ':' + t + ':' + sanitizeAPRSText(message);
    if (msgId !== undefined && msgId !== null && msgId !== '') {
        let id = String(msgId);
        if (id.length > 4) id = id.slice(-4);
        info += '{' + id;
    }
    return info;
}

function formatAPRSPosition(lat, lon, symbol, symbolTable, comment, altitude) {
    const latStr = latToAPRS(lat);
    const lonStr = lonToAPRS(lon);
    const st = symbolTable || '/';
    const sy = symbol || '-';
    let info = '=' + latStr + st + lonStr + sy;
    if (comment) info += sanitizeAPRSText(comment);
    if (altitude !== undefined && altitude !== null && !isNaN(altitude)) {
        const pies = Math.round(altitude * 3.28084);
        info += '/A=' + String(pies).padStart(6, '0');
    }
    return info;
}

function formatAPRSFrame(source, dest, digipath, infoField) {
    let frame = source + '>' + dest;
    if (digipath && digipath !== 'DIRECT') frame += ',' + digipath;
    frame += ':' + infoField;
    return frame;
}

function decodeMicE(dest, info) {
    const result = { grid: null, lat: null, lon: null, comment: null };
    if (!dest || !info) return result;
    const dstBase = dest.split('-')[0];
    if (dstBase.length < 6) return result;
    const body = info.slice(1);
    if (body.length < 8) return result;

    let latDigits = '';
    for (let i = 0; i < dstBase.length; i++) {
        const code = dstBase.charCodeAt(i);
        const c = dstBase[i];
        if (c === 'K' || c === 'L' || c === 'Z') {
            latDigits += ' ';
        } else if (code > 76) {
            latDigits += String.fromCharCode(code - 32);
        } else if (code > 57) {
            latDigits += String.fromCharCode(code - 17);
        } else {
            latDigits += c;
        }
    }

    const spaceMatch = latDigits.match(/^(\d+)( *)$/);
    const posAmbiguity = spaceMatch ? spaceMatch[2].length : 0;
    let latArr = latDigits.split('');
    if (posAmbiguity > 0) {
        if (posAmbiguity >= 4) {
            latArr[2] = '3';
        } else {
            latArr[6 - posAmbiguity] = '5';
        }
    }
    latDigits = latArr.join('');

    const latMin = parseFloat(latDigits.slice(2, 4) + '.' + latDigits.slice(4, 6));
    let lat = parseInt(latDigits.slice(0, 2), 10) + latMin / 60.0;
    if (dstBase.charCodeAt(3) <= 0x4c) lat = -lat;

    const D = body.charCodeAt(0);
    let lonDeg = D - 28;
    if (dstBase.charCodeAt(4) >= 0x50) lonDeg += 100;
    if (lonDeg >= 180 && lonDeg <= 189) lonDeg -= 80;
    if (lonDeg >= 190 && lonDeg <= 199) lonDeg -= 190;

    let lonMin = body.charCodeAt(1) - 28;
    if (lonMin >= 60) lonMin -= 60;
    lonMin += (body.charCodeAt(2) - 28) / 100.0;

    let lon = lonDeg + lonMin / 60.0;
    if (dstBase.charCodeAt(5) >= 0x50) lon = -lon;

    result.lat = lat;
    result.lon = lon;
    result.grid = latLonToGrid(lat, lon, 6);

    result.symbol = body[7];
    result.symbolTable = body[6];

    const sepx = info.indexOf('}');
    if (sepx >= 0) {
        result.comment = info.slice(sepx + 1).trim() || null;
    }

    const E = body.charCodeAt(3) - 28;
    const F = body.charCodeAt(4) - 28;
    const G = body.charCodeAt(5) - 28;
    let speed = E * 10;
    const courseTens = Math.floor(F / 10);
    const courseOnes = F % 10;
    let course = courseOnes * 100 + G;
    speed += courseTens;
    if (speed >= 800) speed -= 800;
    if (course >= 400) course -= 400;
    result.speed = speed * 1.852;
    result.course = course;

    return result;
}

function extractAPRSData(info, dest) {
    const result = { grid: null, lat: null, lon: null, comment: null };
    if (!info) return result;
    const typeChar = info[0];
    if (typeChar === '`' || typeChar === "'" || typeChar === '\x1c' || typeChar === '\x1d') {
        const miced = decodeMicE(dest, info);
        if (miced.lat !== null) {
            result.grid = miced.grid;
            result.lat = miced.lat;
            result.lon = miced.lon;
            result.comment = miced.comment;
            result.symbol = miced.symbol;
            result.symbolTable = miced.symbolTable;
            result.speed = miced.speed;
            result.course = miced.course;
        }
        return result;
    }
    if (typeChar === '=' || typeChar === '@' || typeChar === '!' || typeChar === '/') {
        const body = info.slice(1);
        const latLonMatch = body.match(/(\d{4}\.\d{2}[NS])(.)(\d{5}\.\d{2}[EW])/);
        if (latLonMatch) {
            const latStr = latLonMatch[1], lonStr = latLonMatch[3];
            result.lat = parseFloat(latStr.slice(0, 2)) + parseFloat(latStr.slice(2, 7)) / 60;
            if (latStr.slice(-1) === 'S') result.lat = -result.lat;
            result.lon = parseFloat(lonStr.slice(0, 3)) + parseFloat(lonStr.slice(3, 8)) / 60;
            if (lonStr.slice(-1) === 'W') result.lon = -result.lon;
            result.symbolTable = latLonMatch[2];
            const symIdx = latLonMatch.index + latLonMatch[0].length;
            if (symIdx < body.length) result.symbol = body[symIdx];
        }
        const gridMatch = info.match(/\[(\w{4,6})\]/);
        if (gridMatch) result.grid = gridMatch[1].toUpperCase();
        if (!result.grid && result.lat !== null && result.lon !== null) {
            result.grid = latLonToGrid(result.lat, result.lon, 6);
        }
        result.comment = body.replace(latLonMatch ? latLonMatch[0] : '', '').replace(/\[.*?\]/, '').trim() || null;
    }
    if (info[0] === ':') {
        const secondColon = info.indexOf(':', 1);
        const body = secondColon > 0 && info.length > secondColon + 1 ? info.slice(secondColon + 1).replace(/\{[a-zA-Z0-9]{1,4}$/, '').trim() : '';
        const gridKeyword = body.match(/(?:^|\s)(?:GRID|UR)\s+([A-Ra-r]{2}[0-9]{2}(?:[A-Xa-x]{2})?)/i);
        if (gridKeyword) result.grid = gridKeyword[1].toUpperCase();
        if (!result.grid) {
            const g = body.match(/\b([A-Ra-r]{2}[0-9]{2}(?:[A-Xa-x]{2})?)\b/);
            if (g) {
                const gs = g[1].toUpperCase();
                if (/^[A-R]{2}[0-9]{2}/.test(gs) && gs !== '73' && gs !== 'TU') result.grid = gs;
            }
        }
        const rstMatch = body.match(/RST\s+(\d{2,3})/i);
        if (rstMatch) result.comment = 'RST: ' + rstMatch[1];
    }
    return result;
}

function sanitizeAPRSText(text) {
    if (!text) return text;
    return text.replace(/[|~]/g, '');
}

function freqToBand(freq) {
    if (!freq) return 'SAT';
    if (freq >= 144 && freq < 148) return '2M';
    if (freq >= 430 && freq < 440) return '70CM';
    if (freq >= 1240 && freq < 1300) return '23CM';
    if (freq >= 2300 && freq < 2400) return '13CM';
    if (freq >= 5650 && freq < 5925) return '6CM';
    if (freq >= 10000 && freq < 10500) return '3CM';
    return 'SAT';
}

function isValidMaidenhead(grid) {
    if (!grid || grid.length < 4) return false;
    var c0 = grid.charCodeAt(0), c1 = grid.charCodeAt(1);
    if (c0 < 65 || c0 > 82 || c1 < 65 || c1 > 82) return false;
    var c2 = grid.charCodeAt(2), c3 = grid.charCodeAt(3);
    if (c2 < 48 || c2 > 57 || c3 < 48 || c3 > 57) return false;
    if (grid.length >= 6) {
        var c4 = grid.charCodeAt(4), c5 = grid.charCodeAt(5);
        if (c4 < 97 || c4 > 120 || c5 < 97 || c5 > 120) return false;
    }
    return true;
}

function extractRST(body) {
    if (!body) return null;
    var m = body.match(/RST\s+(\d{2,3})/i);
    if (m) return m[1];
    m = body.match(/\b(\d{3})\b/);
    if (m) {
        var digits = m[1];
        if (digits[0] >= '1' && digits[0] <= '5' && digits[1] >= '1' && digits[1] <= '9' && digits[2] >= '1' && digits[2] <= '9') {
            return digits;
        }
    }
    return null;
}

var APRS_SYMBOLS = {
    primary: {
        '!': 'Police/Sheriff', '"': 'Reserved', '#': 'DIGI (white center)',
        '$': 'Phone', '%': 'DX Cluster', '&': 'HF Gateway',
        "'": 'Small Aircraft', '(': 'Mobile Sat Station', ')': 'Wheelchair',
        '*': 'Snowmobile', '+': 'Red Cross', ',': 'Boy Scouts',
        '-': 'House QTH (VHF)', '.': 'X', '/': 'Red Dot',
        '0': 'Circle (obs.)', '1': 'TBD', '2': 'TBD', '3': 'TBD',
        '4': 'TBD', '5': 'TBD', '6': 'TBD', '7': 'TBD', '8': 'TBD', '9': 'TBD',
        ':': 'Fire', ';': 'Campground', '<': 'Motorcycle', '=': 'Railroad Engine',
        '>': 'Car', '?': 'File Server', '@': 'HC Future (dot)',
        'A': 'Aid Station', 'B': 'BBS/PBBS', 'C': 'Canoe', 'D': 'Reserved',
        'E': 'Eyeball (Events)', 'F': 'Farm Vehicle', 'G': 'Grid Square',
        'H': 'Hotel', 'I': 'TCP/IP on air', 'J': 'Reserved', 'K': 'School',
        'L': 'PC User', 'M': 'MacAPRS', 'N': 'NTS Station', 'O': 'Balloon',
        'P': 'Police', 'Q': 'TBD', 'R': 'Rec. Vehicle', 'S': 'Shuttle',
        'T': 'SSTV', 'U': 'Bus', 'V': 'ATV', 'W': 'National WX Service',
        'X': 'Helicopter', 'Y': 'Yacht (sail)', 'Z': 'WinAPRS',
        '[': 'Human/Person', '\\': 'Triangle (DF)', ']': 'Mail/Post Office',
        '^': 'Large Aircraft', '_': 'Weather Station', '`': 'Dish Antenna',
        'a': 'Ambulance', 'b': 'Bike', 'c': 'Incident Command Post',
        'd': 'Fire Dept', 'e': 'Horse (equestrian)', 'f': 'Fire Truck',
        'g': 'Glider', 'h': 'Hospital', 'i': 'IOTA', 'j': 'Jeep', 'k': 'Truck',
        'l': 'Laptop', 'm': 'Mic-E Repeater', 'n': 'Node (bulls-eye)',
        'o': 'EOC', 'p': 'Rover (puppy/dog)', 'q': 'Grid Square (>128m)',
        'r': 'Repeater', 's': 'Ship (power boat)', 't': 'Truck Stop',
        'u': 'Truck (18-wheeler)', 'v': 'Van', 'w': 'Water Station',
        'x': 'xAPRS (Unix)', 'y': 'Yagi @ QTH', 'z': 'TBD',
        '{': 'Available', '|': 'TNC Stream Switch', '}': 'Available', '~': 'TNC Stream Switch',
    },
    alternate: {
        '!': 'EMERGENCY', '"': 'Reserved', '#': 'DIGI (green star)',
        '$': 'Bank or ATM', '%': 'Power Plant', '&': 'Gateway (I/R/T/2)',
        "'": 'Crash/Incident', '(': 'Cloudy', ')': 'Firenet MEO',
        '*': 'Available', '+': 'Church', ',': 'Girl Scouts',
        '-': 'House (H=HF,O=Op)', '.': 'Big Question Mark', '/': 'Waypoint Dest.',
        '0': 'CIRCLE (IRLP/Echolink)', '1': 'Available', '2': 'Available',
        '3': 'Available', '4': 'Available', '5': 'Available', '6': 'Available',
        '7': 'Available', '8': '802.11/Network', '9': 'Gas Station',
        ':': 'Available (Hail H)', ';': 'Park/Picnic', '<': 'ADVISORY (WX flag)',
        '=': 'Available (ovly group)', '>': 'Overlayed Cars',
        '?': 'Info Kiosk', '@': 'Hurricane/Trop Storm',
        'A': 'Overlay Box (DTMF)', 'B': 'Available', 'C': 'Coast Guard',
        'D': 'Depots', 'E': 'Smoke', 'F': 'Available', 'G': 'Available',
        'H': 'Haze', 'I': 'Rain Shower', 'J': 'Available', 'K': 'Kenwood HT',
        'L': 'Lighthouse', 'M': 'MARS', 'N': 'Navigation Buoy',
        'O': 'Rocket/Balloon', 'P': 'Parking', 'Q': 'Quake',
        'R': 'Restaurant', 'S': 'Satellite/Pacsat', 'T': 'Thunderstorm',
        'U': 'Sunny', 'V': 'VORTAC Nav Aid', 'W': 'NWS Site',
        'X': 'Pharmacy Rx', 'Y': 'Radios/Devices', 'Z': 'Available',
        '[': 'W. Cloud', '\\': 'GPS Symbol', ']': 'Available',
        '^': 'Aircraft ovrlys', '_': 'WX site (green digi)', '`': 'Rain (all types)',
        'a': 'ARRL/ARES/WinLINK', 'b': 'Available', 'c': 'CD/RACES/SATERN',
        'd': 'DX Spot', 'e': 'Sleet', 'f': 'Funnel Cloud', 'g': 'Gale Flags',
        'h': 'Store/Hamfest', 'i': 'BOX / Points of Interest', 'j': 'WorkZone',
        'k': 'Special Vehicle', 'l': 'Areas (box/circle)', 'm': 'Value Sign (3 digit)',
        'n': 'Overlay Triangle', 'o': 'Small Circle', 'p': 'Available',
        'q': 'Available', 'r': 'Restrooms', 's': 'Overlay Ship/boats',
        't': 'Tornado', 'u': 'Overlayed Truck', 'v': 'Overlayed Van',
        'w': 'Flooding/Avalanches', 'x': 'Wreck/Obstruction', 'y': 'Skywarn',
        'z': 'Overlayed Shelter', '{': 'Available', '|': 'TNC Stream Switch',
        '}': 'Available', '~': 'TNC Stream Switch',
    },
};
