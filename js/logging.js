function msgDestIsForUs(info) {
    if (!info || info[0] !== ':') return true;
    var secondColon = info.indexOf(':', 1);
    if (secondColon < 0) return false;
    var dest = info.slice(1, secondColon).trim().toUpperCase();
    var myBase = state.myCall.split('-')[0].toUpperCase();
    var destBase = dest.split('-')[0].toUpperCase();
    // Also accept bulletins (BLN0..BLN9) and announcements (ANNC)
    return destBase === myBase || /^BLN\d$/.test(destBase) || destBase === 'ANNC';
}

function logPacketFromTNC(parsed) {
    if (parsed.digiPath && parsed.digiPath.some(function(d) {
        return /^(TCPIP|NOGATE)/i.test(d);
    })) {
        addTerminalLine('system', 'SKIP (internet): ' + parsed.source + ' via ' + parsed.digiPath.join(','));
        return;
    }

    if (state.selectedSat && state.pendingQSOs.length > 0) {
        var matchKey = parsed.source;
        var matchBase = parsed.sourceBase || parsed.source;
        var pendingIdx = state.pendingQSOs.findIndex(function(p) {
            var pBase = p.call.split('-')[0].toUpperCase();
            return (p.call.toUpperCase() === matchKey.toUpperCase() || pBase === matchBase.toUpperCase()) && p.satId === state.selectedSat;
        });
        if (pendingIdx >= 0 && msgDestIsForUs(parsed.info)) {
            var pending = state.pendingQSOs[pendingIdx];
            var aprsData = extractAPRSData(parsed.info, parsed.dest);
            var remoteGrid = aprsData.grid || pending.grid;

            var secondColon = parsed.info.indexOf(':', 1);
            var body = secondColon > 0 ? parsed.info.slice(secondColon + 1) : '';
            var rstRcvdReal = extractRST(body) || state.rstDefault;
            var rstSentReal = pending.rstSent || state.rstDefault;

            logQSO(
                pending.satId, parsed.source, remoteGrid,
                rstSentReal, rstRcvdReal, 'confirmed',
                body.trim() || null, null,
                aprsData.lat || null, aprsData.lon || null
            );
            addTerminalLine('system', t('toast.qso_confirmed') + parsed.source + ' grid ' + remoteGrid);
            showToast(t('toast.qso_confirmed') + parsed.source);
            state.pendingQSOs.splice(pendingIdx, 1);
            persistSettings();
            return;
        }
    }
}
