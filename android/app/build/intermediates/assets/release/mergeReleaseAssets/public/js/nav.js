var navView = (function() {
    'use strict';

    var _canvas = null;
    var _ctx = null;
    var _container = null;
    var _rafId = null;
    var _lastAz = null;
    var _lastEl = null;
    var _lastHeading = null;
    var _lastBeta = null;
    var _lastWidth = 0;
    var _lastHeight = 0;

    function init() {
        _container = document.getElementById('navContainer');
        if (!_container) return;
        if (_canvas) return;
        _canvas = document.createElement('canvas');
        _container.appendChild(_canvas);
        _ctx = _canvas.getContext('2d');
        window.addEventListener('resize', resize);
        _rafId = requestAnimationFrame(loop);
    }

    function resize() {
        if (!_container || !_canvas) return;
        var w = _container.clientWidth;
        var h = _container.clientHeight;
        if (w === 0 || h === 0) return;
        var dpr = window.devicePixelRatio || 1;
        _canvas.width = w * dpr;
        _canvas.height = h * dpr;
        _canvas.style.width = w + 'px';
        _canvas.style.height = h + 'px';
        _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        _lastWidth = w;
        _lastHeight = h;
        if (!_rafId) _rafId = requestAnimationFrame(loop);
    }

    function loop() {
        try { render(); } catch (e) { console.error('Nav render error:', e); }
        _rafId = requestAnimationFrame(loop);
    }

    function render() {
        if (!_ctx || _lastWidth === 0) return;
        var w = _lastWidth;
        var h = _lastHeight;
        var cx = w / 2;
        var cy = h / 2;
        var r = Math.min(cx, cy) * 0.85;

        _ctx.clearRect(0, 0, w, h);

        var heading = (typeof compassHeading !== 'undefined' && compassHeading !== null) ? compassHeading : 0;
        var satAz = null;
        var satEl = null;
        var phoneTilt = null;

        if (typeof state !== 'undefined' && state.selectedSat) {
            var satDB = (typeof satelliteDB !== 'undefined') ? satelliteDB : null;
            if (satDB) {
                var sat = satDB.find(function(s) { return s.id === state.selectedSat; });
                if (sat && typeof getJulianDate !== 'undefined' && typeof propagateSGP4 !== 'undefined' && typeof initSGP4 !== 'undefined' && typeof eciToObserverECI !== 'undefined' && typeof calculateAzimuth !== 'undefined' && typeof calculateElevation !== 'undefined') {
                    var jd = getJulianDate(new Date());
                    var ctx = initSGP4(sat);
                    if (!ctx) return;
                    var tsince = (jd - ctx.epochJD) * 1440;
                    var prop = propagateSGP4(ctx, tsince);
                    if (prop) {
                        var obsECI = eciToObserverECI(state.myLat, state.myLon, state.myAlt, jd);
                        satAz = calculateAzimuth(prop.eciPos, obsECI, state.myLat, state.myLon, jd);
                        satEl = calculateElevation(prop.eciPos, obsECI);
                    }
                }
            }
        }

        if (typeof compassRaw !== 'undefined' && compassRaw.beta !== null && typeof state !== 'undefined') {
            phoneTilt = compassRaw.beta - (state.elevationOffset || 0);
        }

        drawCompassRing(_ctx, cx, cy, r, heading);

        var aligned = false;
        if (satAz !== null && satEl !== null && satEl > 0) {
            var relAz = satAz - heading;
            var normAz = ((relAz + 180) % 360 + 360) % 360 - 180;
            var azOk = Math.abs(normAz) <= 5;
            var elOk = (phoneTilt !== null) && Math.abs(phoneTilt - satEl) <= 5;
            aligned = azOk && elOk;
            drawSatelliteMarker(_ctx, cx, cy, r, satAz, satEl, heading);
        }

        drawCrosshair(_ctx, cx, cy, r, phoneTilt, aligned);

        drawInfoText(_ctx, cx, cy, r, heading, satAz, satEl, phoneTilt);
    }

    function drawCompassRing(ctx, cx, cy, r, heading) {
        ctx.save();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(240,160,48,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(240,160,48,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.translate(cx, cy);
        ctx.rotate(-heading * Math.PI / 180);

        var i, angle, x1, y1, x2, y2, xT, yT;
        for (i = 0; i < 360; i += 10) {
            angle = i * Math.PI / 180;
            var isMajor = i % 90 === 0;
            var isMed = i % 30 === 0;
            var innerFrac = isMajor ? 0.82 : (isMed ? 0.88 : 0.92);

            x1 = Math.sin(angle) * r;
            y1 = -Math.cos(angle) * r;
            x2 = Math.sin(angle) * r * innerFrac;
            y2 = -Math.cos(angle) * r * innerFrac;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = isMajor ? '#f0a030' : 'rgba(240,160,48,0.4)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.stroke();
        }

        var cardinals = [
            { label: 'N', angle: 0, color: '#e74c3c' },
            { label: 'E', angle: 90, color: '#f0a030' },
            { label: 'S', angle: 180, color: '#f0a030' },
            { label: 'W', angle: 270, color: '#f0a030' }
        ];
        ctx.font = 'bold ' + Math.round(r * 0.12) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        cardinals.forEach(function(c) {
            var a = c.angle * Math.PI / 180;
            var tx = Math.sin(a) * r * 0.73;
            var ty = -Math.cos(a) * r * 0.73;
            ctx.fillStyle = c.color;
            ctx.fillText(c.label, tx, ty);
        });

        ctx.restore();
    }

    function drawSatelliteMarker(ctx, cx, cy, r, satAz, satEl, heading) {
        var relAz = satAz - heading;
        var normAz = ((relAz + 180) % 360 + 360) % 360 - 180;
        var elFrac = satEl / 90;
        var dist = r * (1 - elFrac) * 0.85;
        var angle = normAz * Math.PI / 180;
        var sx = cx + Math.sin(angle) * dist;
        var sy = cy - Math.cos(angle) * dist;

        ctx.save();
        ctx.shadowColor = 'rgba(240,160,48,0.3)';
        ctx.shadowBlur = 12;
        ctx.font = Math.round(r * 0.18) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83D\uDEF0', sx, sy);
        ctx.restore();
    }

    function drawInfoText(ctx, cx, cy, r, heading, satAz, satEl, phoneTilt) {
        var fontSize = Math.round(r * 0.09);
        ctx.save();
        ctx.font = fontSize + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f0a030';

        var y = cy + r * 0.45;
        var lineH = fontSize * 1.4;

        ctx.fillText('H: ' + heading.toFixed(1) + '\u00b0', cx - r * 0.6, y);

        if (satAz !== null && satEl !== null) {
            var satText = 'Sat: ' + satAz.toFixed(0) + '\u00b0 / ' + satEl.toFixed(1) + '\u00b0';
            ctx.fillStyle = '#888';
            ctx.fillText(satText, cx - r * 0.6, y + lineH);
        }

        if (phoneTilt !== null) {
            ctx.fillStyle = '#f0a030';
            ctx.fillText('Tilt: ' + phoneTilt.toFixed(1) + '\u00b0', cx + r * 0.15, y);
        }

        ctx.restore();
    }

    function drawCrosshair(ctx, cx, cy, r, phoneTilt, aligned) {
        var color = aligned ? '#2ecc71' : 'rgba(240,160,48,0.7)';
        var crossR = r * 0.12;
        var armLen = r * 0.06;
        var gap = r * 0.04;
        var tx = cx;
        var ty = cy;
        if (phoneTilt !== null) {
            var tiltNorm = Math.max(-90, Math.min(90, phoneTilt)) / 90;
            ty = cy - (1 - tiltNorm) * r * 0.85;
        }
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - armLen - gap, ty);
        ctx.lineTo(tx - gap, ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx + gap, ty);
        ctx.lineTo(tx + armLen + gap, ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, ty - armLen - gap);
        ctx.lineTo(tx, ty - gap);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, ty + gap);
        ctx.lineTo(tx, ty + armLen + gap);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tx, ty, crossR, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    function destroy() {
        if (_rafId) cancelAnimationFrame(_rafId);
        _rafId = null;
    }

    return { init: init, resize: resize, destroy: destroy };
})();
