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
    const info = stringToBytes(packet.infoField);
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
    if (bytes.length < 18) return null;
    const data = bytes.slice(0, -2);
    let addrEnd = 0;
    for (let i = 6; i < data.length; i += 7) {
        if (data[i] & 0x01) { addrEnd = i + 1; break; }
    }
    if (addrEnd < 14) return null;
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
    let info = ':' + t + ':' + message;
    if (msgId !== undefined && msgId !== null && msgId !== '') {
        info += '{' + String(msgId).padStart(2, '0');
    }
    return info;
}

function formatAPRSPosition(lat, lon, symbol, symbolTable, comment) {
    const latStr = latToAPRS(lat);
    const lonStr = lonToAPRS(lon);
    const st = symbolTable || '/';
    const sy = symbol || '-';
    let info = '=' + latStr + st + lonStr + sy;
    if (comment) info += comment;
    return info;
}

function formatAPRSFrame(source, dest, digipath, infoField) {
    let frame = source + '>' + dest;
    if (digipath && digipath !== 'DIRECT') frame += ',' + digipath;
    frame += ':' + infoField;
    return frame;
}

function extractAPRSData(info) {
    const result = { grid: null, lat: null, lon: null, comment: null };
    if (!info) return result;
    if (info[0] === '=' || info[0] === '@' || info[0] === '!') {
        const body = info.slice(1);
        const latLonMatch = body.match(/(\d{4}\.\d{2}[NS])(.)(\d{5}\.\d{2}[EW])/);
        if (latLonMatch) {
            const latStr = latLonMatch[1], lonStr = latLonMatch[3];
            result.lat = parseFloat(latStr.slice(0, 2)) + parseFloat(latStr.slice(2, 7)) / 60;
            if (latStr.slice(-1) === 'S') result.lat = -result.lat;
            result.lon = parseFloat(lonStr.slice(0, 3)) + parseFloat(lonStr.slice(3, 8)) / 60;
            if (lonStr.slice(-1) === 'W') result.lon = -result.lon;
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
        const body = secondColon > 0 && info.length > secondColon + 1 ? info.slice(secondColon + 1).replace(/\{[\da-zA-Z]{1,2}$/, '').trim() : '';
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
