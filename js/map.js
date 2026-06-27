(function () {
    'use strict';

    var _map = null;
    var _myMarker = null;
    var _satMarker = null;
    var _satTrack = null;
    var _satCoverage = null;
    var _heardGroup = null;
    var _qsoGroup = null;
    var _mode = 'default';
    var _loopId = null;
    var _followSat = false;
    var _qsoIdx = -1;
    var _qsoAllMode = false;
    var _mapMode = 'prediction';
    var _tileLayer = null;

    function tileUrlForStyle(style) {
        return 'https://{s}.basemaps.cartocdn.com/' + style + '_all/{z}/{x}/{y}{r}.png';
    }

    var satIcon = L.divIcon({
        className: '',
        html: '<div class="map-sat-marker"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });

    var myIcon = L.divIcon({
        className: '',
        html: '<div class="map-my-marker"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });

    function initMap() {
        if (typeof L === 'undefined') return;

        var el = document.getElementById('mapContainer');
        if (!el) return;

        _map = L.map('mapContainer', {
            zoomControl: true,
            attributionControl: false,
            center: [20, 0],
            zoom: 2,
            zoomSnap: 0.5,
        });

        var style = state.mapTileStyle || 'dark';
        _tileLayer = L.tileLayer(tileUrlForStyle(style), {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(_map);

        _myMarker = L.marker([state.myLat, state.myLon], { icon: myIcon })
            .addTo(_map)
            .bindPopup('<b>' + state.myCall + '</b><br>Grid: ' + state.myGrid);

        _satMarker = L.marker([0, 0], { icon: satIcon }).addTo(_map);

        _satTrack = L.layerGroup().addTo(_map);

        _heardGroup = L.layerGroup().addTo(_map);
        _qsoGroup = L.layerGroup().addTo(_map);

        _loopId = setInterval(updateSatellite, 1000);
        updateSatellite();

        // Set initial button state (Fixed by default)
        var initBtn = document.getElementById('mapFollowBtn');
        if (initBtn) { initBtn.textContent = '\u25c9 Fixed'; initBtn.classList.add('fixed'); }
    }

    function setTileStyle(style) {
        if (!_map) return;
        if (_tileLayer) _map.removeLayer(_tileLayer);
        _tileLayer = L.tileLayer(tileUrlForStyle(style), {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(_map);
    }

    function updateSatellite() {
        if (!_map || !state.selectedSat) return;

        var sat = null;
        for (var i = 0; i < satelliteDB.length; i++) {
            if (satelliteDB[i].id === state.selectedSat) { sat = satelliteDB[i]; break; }
        }
        if (!sat) return;

        if (sat.type === 'terrestrial') {
            if (_map.hasLayer(_satMarker)) _map.removeLayer(_satMarker);
            if (_satCoverage && _map.hasLayer(_satCoverage)) { _map.removeLayer(_satCoverage); _satCoverage = null; }
            if (_map.hasLayer(_satTrack)) _map.removeLayer(_satTrack);
            _satTrack.clearLayers();
            document.getElementById('satStatusDot').className = 'status-dot active';
            document.getElementById('satNameDisplay').textContent = 'TERRESTRIAL';
            var dopEl = document.getElementById('utcDoppler');
            dopEl.innerHTML = state.txFreq.toFixed(3) + ' MHz';
            dopEl.style.display = 'inline';
            document.getElementById('utcDate').style.display = 'none';
            document.getElementById('utcTime').style.display = 'none';
            return;
        }

        // Show/hide satellite layers based on mapShowSat toggle
        var showSat = state.mapShowSat !== false;
        if (!showSat) {
            if (_map.hasLayer(_satMarker)) _map.removeLayer(_satMarker);
            if (_satCoverage && _map.hasLayer(_satCoverage)) { _map.removeLayer(_satCoverage); _satCoverage = null; }
            if (_map.hasLayer(_satTrack)) _map.removeLayer(_satTrack);
            _satTrack.clearLayers();
        }
        // Also update satellite icon color from state
        var satColor = state.mapColorSat || sat.color;
        var newSatIcon = L.divIcon({
            className: '',
            html: '<div style="width:14px;height:14px;border-radius:50%;background:' + satColor + ';border:2px solid rgba(255,255,255,0.5);"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
        });
        _satMarker.setIcon(newSatIcon);

        var jd = getJulianDate(new Date());
        var ctx = initSGP4(sat);
        var tsince = (jd - ctx.epochJD) * MIN_PER_DAY;
        var prop = propagateSGP4(ctx, tsince);
        if (!prop) return;

        var geo = eciToGeodetic(prop.eciPos, prop.jdProp);

        // Re-add satellite layers if removed (e.g. by terrestrial mode) and toggle is on
        if (_mapMode === 'prediction' && showSat) {
            if (!_map.hasLayer(_satMarker)) _map.addLayer(_satMarker);
            if (!_map.hasLayer(_satTrack)) _map.addLayer(_satTrack);
        }

        // Update satellite marker
        _satMarker.setLatLng([geo.lat, geo.lon]);

        // Coverage circle (Leaflet geodesic circle)
        var rKm = calculateFootprintRadius(geo.alt);
        if (showSat && isFinite(rKm) && rKm > 0) {
            if (!_satCoverage) {
                _satCoverage = L.circle([geo.lat, geo.lon], {
                    radius: rKm * 1000,
                    color: satColor,
                    fillColor: satColor,
                    fillOpacity: 0.08,
                    weight: 1.5,
                    opacity: 0.4,
                }).addTo(_map);
            } else {
                _satCoverage.setLatLng([geo.lat, geo.lon]);
                _satCoverage.setRadius(rKm * 1000);
                _satCoverage.setStyle({ color: satColor, fillColor: satColor });
            }
        }

        // Ground track: 180 minutes, split at antimeridian
        _satTrack.clearLayers();
        var seg = [];
        for (var m = -90; m <= 90; m += 2) {
            var p = propagateSGP4(ctx, tsince + m);
            if (p) {
                var g = eciToGeodetic(p.eciPos, p.jdProp);
                if (seg.length > 0 && Math.abs(g.lon - seg[seg.length - 1][1]) > 100) {
                    if (seg.length > 1) {
                        L.polyline(seg, { color: '#f0a030', weight: 1.5, opacity: 0.6 }).addTo(_satTrack);
                    }
                    seg = [];
                }
                seg.push([g.lat, g.lon]);
            }
        }
        if (seg.length > 1) {
            L.polyline(seg, { color: '#f0a030', weight: 1.5, opacity: 0.6 }).addTo(_satTrack);
        }

        // Center on satellite if following
        if (_mode === 'default' && _followSat) {
            _map.setView([geo.lat, geo.lon], Math.max(_map.getZoom(), 3));
        }

        // Update elevation and pass display in header
        var obsECI = eciToObserverECI(state.myLat, state.myLon, state.myAlt, jd);
        var el = calculateElevation(prop.eciPos, obsECI);
        var dot = document.getElementById('satStatusDot');
        var dopEl = document.getElementById('utcDoppler');
        var dtEl = document.getElementById('utcDate');
        var tmEl = document.getElementById('utcTime');
        if (el > 0) {
            dot.className = 'status-dot active';
            var effFreq = (state.satFreqOverrides && state.satFreqOverrides[state.selectedSat]) || state.txFreq;
            var dop = calculateDoppler(effFreq, prop.eciPos, prop.eciVel, obsECI);
            var corrected = effFreq + dop.dopplerHz / 1e6;
            var az = calculateAzimuth(prop.eciPos, obsECI, state.myLat, state.myLon, jd);
            var label = corrected.toFixed(4) + ' MHz ' + az.toFixed(0) + '\u00b0';
            if (compassHeading !== null) {
                var diff = ((az - compassHeading + 180) % 360 + 360) % 360 - 180;
                var ok = Math.abs(diff) <= 3;
                var cls = ok ? 'dop-ok' : 'dop-warn';
                var arrow = diff > 3 ? ' >>' : (diff < -3 ? ' <<' : '');
                label = corrected.toFixed(4) + ' MHz <span class="' + cls + '">' + az.toFixed(0) + '\u00b0' + arrow + '</span>';
            }
            var phoneTilt = null;
            if (compassRaw.beta !== null) {
                phoneTilt = compassRaw.beta - state.elevationOffset;
            }
            if (phoneTilt !== null) {
                var elDiff = phoneTilt - el;
                var elCls, elArrow;
                if (Math.abs(elDiff) <= 5) {
                    elCls = 'dop-ok';
                    elArrow = '';
                } else if (elDiff < -5) {
                    elCls = 'dop-warn';
                    elArrow = ' \u25b2';
                } else {
                    elCls = 'dop-warn';
                    elArrow = ' \u25bc';
                }
                label += '<br><span class="' + elCls + '" style="font-size:0.85em;line-height:1.2;display:block;text-align:right;">' + el.toFixed(1) + '\u00b0' + elArrow + '</span>';
            }
            dopEl.innerHTML = label;
            dopEl.style.display = 'inline';
            dtEl.style.display = 'none';
            tmEl.style.display = 'none';
        } else {
            dot.className = 'status-dot warning';
            dopEl.textContent = '';
            dopEl.style.display = 'none';
            dtEl.style.display = 'inline';
            tmEl.style.display = 'inline';
        }
        var shortName = sat.name.split(' ')[0];
        var displayEl = document.getElementById('satNameDisplay');
        if (el > 0) {
            displayEl.textContent = shortName + ' \u2191' + el.toFixed(1) + '\u00b0';
        }
        // If below horizon, let the 30s refreshSatPasses handle the prediction text
    }

    function updateMyStation() {
        if (!_myMarker) return;
        _myMarker.setLatLng([state.myLat, state.myLon]);
        _myMarker.setPopupContent('<b>' + state.myCall + '</b><br>Grid: ' + state.myGrid);
    }

    function updateHeard() {
        if (!_map || _mode !== 'default') return;
        _heardGroup.clearLayers();
        var isTerrestrial = state.selectedSat === 'terrestrial';
        var show = isTerrestrial ? state.mapShowHeardTer : state.mapShowHeardSat;
        if (!show) return;
        var color = isTerrestrial ? state.mapColorHeardTer : state.mapColorHeardSat;
        var myPos = [state.myLat, state.myLon];
        for (var i = 0; i < state.heardStations.length; i++) {
            var h = state.heardStations[i];
            var pos = null;
            if (h.lat !== null && h.lat !== undefined && h.lon !== null && h.lon !== undefined) {
                pos = { lat: h.lat, lon: h.lon };
            } else if (h.grid && h.grid.length >= 4) {
                try { pos = gridToLatLon(h.grid); } catch (e) {}
            }
            if (!pos) continue;
            try {
                var m = L.marker([pos.lat, pos.lon], {
                    icon: L.divIcon({
                        className: '',
                        html: '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';opacity:0.8;border:1px solid rgba(255,255,255,0.3);"></div>',
                        iconSize: [10, 10],
                        iconAnchor: [5, 5],
                    })
                });
                var tooltipText = h.call;
                if (state.mapShowGeodesic) {
                    var dist = haversine(state.myLat, state.myLon, pos.lat, pos.lon);
                    var geoPts = geodesicLine(myPos[0], myPos[1], pos.lat, pos.lon, 32);
                    L.polyline(geoPts, { color: color, weight: 1, opacity: 0.5, dashArray: '3, 6' }).addTo(_heardGroup);
                    if (dist) tooltipText += ' (' + dist.toFixed(0) + ' km)';
                }
                m.bindTooltip('<span style="color:' + color + ';">' + tooltipText + '</span>', { permanent: true, direction: 'right', offset: [10, 0], className: 'qso-label dx' });
                _heardGroup.addLayer(m);
            } catch (e) {}
        }
    }

    function showQSO(qsoIdx) {
        if (!_map) return;
        _mode = 'qso-detail';
        _qsoIdx = qsoIdx;
        _qsoGroup.clearLayers();
        setMapMode('qso');
        if (!_map.hasLayer(_qsoGroup)) _map.addLayer(_qsoGroup);

        if (_qsoAllMode) {
            showAllQSOs();
        } else {
            showSingleQSO(qsoIdx);
        }
    }

    function showSingleQSO(qsoIdx) {
        var qso = state.qsoLog[qsoIdx];
        if (!qso) return;

        var myPos = [state.myLat, state.myLon];

        if (!qso.grid || qso.grid.length < 4) {
            showToast('QSO has no grid data', true);
            return;
        }
        var dxGeo = gridToLatLon(qso.grid);
        if (!dxGeo) return;
        var dxPos = [dxGeo.lat, dxGeo.lon];

        while (dxPos[1] - myPos[1] > 180) dxPos[1] -= 360;
        while (dxPos[1] - myPos[1] < -180) dxPos[1] += 360;

        var qsoColor = state.mapColorQSO || '#3b9fd4';

        var dxTooltip = qso.call;
        if (state.mapShowGeodesic) {
            var geoPts = geodesicLine(myPos[0], myPos[1], dxPos[0], dxPos[1], 64);
            L.polyline(geoPts, { color: qsoColor, weight: 2, opacity: 0.8, dashArray: '5, 10' }).addTo(_qsoGroup);
            if (qso.distanceKm) dxTooltip += ' (' + qso.distanceKm.toFixed(0) + ' km)';
        }

        var dxM = L.marker(dxPos, {
            icon: L.divIcon({
                className: '',
                html: '<div style="width:10px;height:10px;border-radius:50%;background:' + qsoColor + ';border:1px solid rgba(255,255,255,0.3);"></div>',
                iconSize: [10, 10],
                iconAnchor: [5, 5],
            })
        });
        dxM.bindTooltip('<span style="color:' + qsoColor + ';">' + dxTooltip + '</span>', { permanent: true, direction: 'right', offset: [10, 0], className: 'qso-label dx' });
        _qsoGroup.addLayer(dxM);

        var myM = L.marker(myPos, { icon: myIcon });
        myM.bindTooltip(state.myCall, { permanent: true, direction: 'right', offset: [10, 0], className: 'qso-label my' });
        _qsoGroup.addLayer(myM);

        var bounds = L.latLngBounds(myPos, dxPos);
        _map.fitBounds(bounds, { padding: [50, 50] });
    }

    function showAllQSOs() {
        var myPos = [state.myLat, state.myLon];
        var bounds = L.latLngBounds(myPos, myPos);
        var any = false;
        var qsoColor = state.mapColorQSO || '#3b9fd4';

        for (var i = 0; i < state.qsoLog.length; i++) {
            var qso = state.qsoLog[i];
            if (!qso.grid || qso.grid.length < 4) continue;
            var dxGeo = gridToLatLon(qso.grid);
            if (!dxGeo) continue;
            var dxPos = [dxGeo.lat, dxGeo.lon];

            while (dxPos[1] - myPos[1] > 180) dxPos[1] -= 360;
            while (dxPos[1] - myPos[1] < -180) dxPos[1] += 360;

            var m = L.marker(dxPos, {
                icon: L.divIcon({
                    className: '',
                    html: '<div style="width:10px;height:10px;border-radius:50%;background:' + qsoColor + ';border:1px solid rgba(255,255,255,0.3);"></div>',
                    iconSize: [10, 10],
                    iconAnchor: [5, 5],
                })
            });
            _qsoGroup.addLayer(m);

            if (state.mapShowGeodesic) {
                var geoPts = geodesicLine(myPos[0], myPos[1], dxPos[0], dxPos[1], 32);
                L.polyline(geoPts, { color: qsoColor, weight: 1, opacity: 0.5, dashArray: '3, 6' }).addTo(_qsoGroup);
            }

            bounds.extend(dxPos);
            any = true;
        }

        // My station marker
        var myM = L.marker(myPos, { icon: myIcon });
        _qsoGroup.addLayer(myM);

        if (any) {
            _map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    function toggleQSOView() {
        _qsoAllMode = !_qsoAllMode;
        var btn = document.getElementById('qsoViewToggle');
        if (btn) {
            btn.textContent = _qsoAllMode ? 'All' : 'One';
            btn.classList.toggle('active', _qsoAllMode);
        }
        if (_mode === 'qso-detail' && _qsoIdx >= 0) {
            showQSO(_qsoIdx);
        }
    }

    function toggleMapMode() {
        if (!_map) return;
        setMapMode(_mapMode === 'prediction' ? 'qso' : 'prediction');
    }

    function setMapMode(mode) {
        if (!_map || _mapMode === mode) return;
        _mapMode = mode;

        if (mode === 'qso') {
            if (_map.hasLayer(_satMarker)) _map.removeLayer(_satMarker);
            if (_satCoverage && _map.hasLayer(_satCoverage)) _map.removeLayer(_satCoverage);
            if (_map.hasLayer(_satTrack)) _map.removeLayer(_satTrack);
            if (_map.hasLayer(_heardGroup)) _map.removeLayer(_heardGroup);
            if (state.mapShowQSO !== false && !_map.hasLayer(_qsoGroup)) _map.addLayer(_qsoGroup);
        } else {
            if (_map.hasLayer(_qsoGroup)) _map.removeLayer(_qsoGroup);
            if (state.mapShowSat !== false) {
                if (!_map.hasLayer(_satMarker)) _map.addLayer(_satMarker);
                if (_satCoverage && !_map.hasLayer(_satCoverage)) _map.addLayer(_satCoverage);
                if (!_map.hasLayer(_satTrack)) _map.addLayer(_satTrack);
            }
            if (!_map.hasLayer(_heardGroup)) _map.addLayer(_heardGroup);
        }

        var btn = document.getElementById('mapModeToggle');
        if (btn) {
            btn.textContent = mode === 'qso' ? 'QSO' : 'Sat';
            btn.classList.toggle('active', mode === 'qso');
        }
    }

    function resetView() {
        if (!_map) return;
        _mode = 'default';
        _followSat = false;
        _qsoIdx = -1;
        _qsoGroup.clearLayers();
        setMapMode('prediction');
        var btn = document.getElementById('mapFollowBtn');
        if (btn) { btn.textContent = '\u25c9 Fixed'; btn.classList.add('fixed'); }
        updateHeard();
        updateSatellite();
        _map.setView([20, 0], 2);
    }

    function toggleMapFollow() {
        var btn = document.getElementById('mapFollowBtn');
        if (!btn) return;

        // If in QSO detail mode, exit to default Fixed view
        if (_mode === 'qso-detail') {
            resetView();
            return;
        }

        _followSat = !_followSat;
        if (_followSat) {
            btn.textContent = '◎ Dynamic';
            btn.classList.remove('fixed');
            // Center immediately on satellite
            if (_satMarker) {
                var ll = _satMarker.getLatLng();
                _map.setView([ll.lat, ll.lng], Math.max(_map.getZoom(), 3));
            }
        } else {
            btn.textContent = '◉ Fixed';
            btn.classList.add('fixed');
        }
    }

    window.toggleMapFollow = toggleMapFollow;
    window.toggleQSOView = toggleQSOView;
    window.toggleMapMode = toggleMapMode;

    window.mapView = {
        init: initMap,
        updateHeard: updateHeard,
        updateMyStation: updateMyStation,
        showQSO: showQSO,
        reset: resetView,
        setTileStyle: setTileStyle,
        getMap: function () { return _map; },
    };
})();
