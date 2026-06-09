function msgDestIsForUs(info) {
    if (!info || info[0] !== ':') return true;
    var secondColon = info.indexOf(':', 1);
    if (secondColon < 0) return false;
    var dest = info.slice(1, secondColon).trim().toUpperCase();
    return dest === state.myCall.toUpperCase();
}

function logPacketFromTNC(parsed) {
    // Skip internet-routed packets (TCPIP* / NOGATE in digi path)
    if (parsed.digiPath && parsed.digiPath.some(function(d) {
        return /^(TCPIP|NOGATE)/i.test(d);
    })) {
        addTerminalLine('system', 'SKIP (internet): ' + parsed.source + ' via ' + parsed.digiPath.join(','));
        return;
    }

    // Bidirectional QSO confirmation
    if (state.selectedSat && state.pendingQSOs.length > 0) {
        // Match against both full callsign (+SSID) and base (no SSID)
        var matchKey = parsed.source;
        var matchBase = parsed.sourceBase || parsed.source;
        var pendingIdx = state.pendingQSOs.findIndex(function(p) {
            return (p.call === matchKey || p.call === matchBase) && p.satId === state.selectedSat;
        });
        if (pendingIdx >= 0 && msgDestIsForUs(parsed.info)) {
            var pending = state.pendingQSOs[pendingIdx];
            var aprsData = extractAPRSData(parsed.info);
            var remoteGrid = aprsData.grid || pending.grid;
            logQSO(pending.satId, parsed.source, remoteGrid,
                state.rstDefault, state.rstDefault, 'confirmed');
            addTerminalLine('system', 'QSO confirmed with ' + parsed.source + ' grid ' + remoteGrid);
            showToast('QSO confirmed: ' + parsed.source);
            state.pendingQSOs.splice(pendingIdx, 1);
            persistSettings();
            return;
        }
    }
}
