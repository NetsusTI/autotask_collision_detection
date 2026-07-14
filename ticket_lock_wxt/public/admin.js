(function () {
  var BASE_URL = 'https://netsus-two.vercel.app';
  var API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';
  var REFRESH_SECS = 10;

  var countdownInterval = null;
  var secondsLeft = REFRESH_SECS;
  var currentTab = 'live';
  var liveView = 'ticket'; // 'ticket' | 'tech'
  var lastTickets = [];
  var lastHistory = [];
  var historyFilter = '';
  var historyPeriod = 'all';
  var historyTechFilter = '';
  var dateFrom = null;
  var dateTo = null;
  var historyOffset = 0;
  var historyTotal = 0;
  var HISTORY_PAGE = 50;

  function userName(u) { return typeof u === 'string' ? u : u.name; }
  function userMinutes(u) { return typeof u === 'string' ? 0 : (u.minutes || 0); }
  function userLabel(u) {
    var name = userName(u);
    var min = userMinutes(u);
    return name + (min > 0 ? '<span class="chip-time">· ' + min + 'm</span>' : '');
  }

  function normalizeTickets(data) {
    if (Array.isArray(data)) return data;
    return Object.keys(data).map(function (id) {
      return { ticketId: id, ticketNumber: null, users: (data[id] || []).map(function (u) { return { name: u, minutes: 0 }; }) };
    });
  }

  function doLogin() {
    var pwd = document.getElementById('pwdInput').value;
    var btn = document.getElementById('loginBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }
    fetch(BASE_URL + '/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    }).then(function (r) {
      if (r.ok) {
        sessionStorage.setItem('netsus_admin', '1');
        showPanel();
      } else {
        var err = document.getElementById('loginError');
        err.style.display = 'block';
        setTimeout(function () { err.style.display = 'none'; }, 2000);
      }
    }).catch(function () {
      var err = document.getElementById('loginError');
      err.textContent = 'Error de conexión';
      err.style.display = 'block';
      setTimeout(function () { err.style.display = 'none'; err.textContent = 'Contraseña incorrecta'; }, 3000);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
    });
  }

  function doLogout() {
    sessionStorage.removeItem('netsus_admin');
    clearInterval(countdownInterval);
    countdownInterval = null;
    document.getElementById('panel').style.display = 'none';
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('pwdInput').value = '';
  }

  function setTab(tab) {
    currentTab = tab;
    ['live', 'history', 'analytics', 'config'].forEach(function (t) {
      var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) btn.classList.toggle('active', t === tab);
      var el = document.getElementById(t + 'Tab');
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.getElementById('liveViewToggle').style.display = tab === 'live' ? 'flex' : 'none';
    document.getElementById('exportCsvBtn').style.display = tab === 'history' ? '' : 'none';
    document.getElementById('filterBar').style.display = tab === 'history' ? 'flex' : 'none';
    if (tab === 'config') loadConfig();
    if (tab === 'analytics') loadAnalytics();
  }

  function updateCountdown() {
    secondsLeft--;
    if (secondsLeft <= 0) {
      secondsLeft = REFRESH_SECS;
      fetchData();
    }
    var el = document.getElementById('countdown');
    if (el) el.textContent = secondsLeft + 's';
  }

  function showPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    fetchData();
    secondsLeft = REFRESH_SECS;
    countdownInterval = setInterval(updateCountdown, 1000);
  }

  function showApiError(msg) {
    var el = document.getElementById('apiError');
    var t = document.getElementById('apiErrorTime');
    el.style.display = 'block';
    t.textContent = msg;
  }

  function hideApiError() {
    document.getElementById('apiError').style.display = 'none';
  }

  function fetchHistory(append) {
    var offset = append ? historyOffset : 0;
    var techParam = historyTechFilter ? '&tech=' + encodeURIComponent(historyTechFilter) : '';
    fetch(BASE_URL + '/api/presence/history?offset=' + offset + '&limit=' + HISTORY_PAGE + techParam, { headers: { 'x-api-key': API_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var events = Array.isArray(data.events) ? data.events : (Array.isArray(data) ? data : []);
        historyTotal = data.total || events.length;
        if (append) {
          lastHistory = lastHistory.concat(events);
          historyOffset += events.length;
        } else {
          lastHistory = events;
          historyOffset = events.length;
        }
        renderHistory(applyFilters(lastHistory));
      }).catch(function () {});
  }

  function fetchData() {
    Promise.all([
      fetch(BASE_URL + '/api/presence/status', { headers: { 'x-api-key': API_KEY } }),
      fetch(BASE_URL + '/api/presence/history?offset=0&limit=' + HISTORY_PAGE, { headers: { 'x-api-key': API_KEY } })
    ]).then(function (responses) {
      if (!responses[0].ok || !responses[1].ok) throw new Error('HTTP error');
      return Promise.all([
        responses[0].json().catch(function () { return []; }),
        responses[1].json().catch(function () { return {}; })
      ]);
    }).then(function (data) {
      hideApiError();
      lastTickets = normalizeTickets(data[0]);
      renderLive(lastTickets);
      var histData = data[1];
      var events = Array.isArray(histData.events) ? histData.events : (Array.isArray(histData) ? histData : []);
      historyTotal = histData.total || events.length;
      historyOffset = events.length;
      lastHistory = events;
      renderHistory(applyFilters(lastHistory));
      document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('es-CL');
    }).catch(function () {
      showApiError('Último intento: ' + new Date().toLocaleTimeString('es-CL'));
    });
  }

  function initials(name) {
    return name.split(' ').slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase();
  }

  function renderLive(tickets) {
    if (liveView === 'tech') { renderLiveByTech(tickets); return; }
    var allUsers = tickets.reduce(function (a, t) {
      return a.concat(t.users.map(function (u) { return userName(u); }));
    }, []);
    document.getElementById('statTickets').textContent = tickets.length;
    document.getElementById('statUsers').textContent = new Set(allUsers).size;
    var el = document.getElementById('liveTab');
    if (!tickets.length) {
      el.innerHTML = '<div class="empty"><div class="emptyIcon">✅</div><div class="emptyText">Sin colisiones activas</div><div class="emptySub">Todos los técnicos trabajan sin conflictos</div></div>';
      return;
    }
    el.innerHTML = tickets.map(function (t) {
      var isCol = t.users.length > 1;
      var label = t.ticketNumber || '#' + t.ticketId;
      var nameEl = t.ticketUrl
        ? '<a href="' + t.ticketUrl + '" target="_blank" class="ticketLink">' + label + '</a>'
        : label;
      return '<div class="ticketCard ' + (isCol ? 'collision' : '') + '">' +
        '<div class="ticketLeft"><div class="ticketIcon ' + (isCol ? 'col' : '') + '">' + (isCol ? '⚠️' : '🎫') + '</div>' +
        '<div><div class="ticketName">' + nameEl + '</div>' +
        '<div class="ticketMeta">' + t.users.length + ' técnico' + (t.users.length > 1 ? 's' : '') + ' activo' + (t.users.length > 1 ? 's' : '') + '</div></div></div>' +
        '<div class="chips">' + t.users.map(function (u, i) {
          return '<span class="chip ' + (i === 0 ? 'primary' : '') + '">' + userLabel(u) + '</span>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function renderLiveByTech(tickets) {
    var techMap = {};
    tickets.forEach(function (t) {
      t.users.forEach(function (u) {
        var name = userName(u);
        var min = userMinutes(u);
        if (!techMap[name]) techMap[name] = [];
        techMap[name].push({ number: t.ticketNumber || '#' + t.ticketId, minutes: min, collision: t.users.length > 1, url: t.ticketUrl || null });
      });
    });
    var el = document.getElementById('liveTab');
    var techs = Object.keys(techMap);
    if (!techs.length) {
      el.innerHTML = '<div class="empty"><div class="emptyIcon">✅</div><div class="emptyText">Sin actividad activa</div><div class="emptySub">Todos los técnicos están libres</div></div>';
      return;
    }
    el.innerHTML = techs.map(function (name) {
      var tks = techMap[name];
      var hasCollision = tks.some(function (t) { return t.collision; });
      return '<div class="ticketCard ' + (hasCollision ? 'collision' : '') + '">' +
        '<div class="ticketLeft">' +
        '<div class="techAvatar">' + initials(name) + '</div>' +
        '<div><div class="ticketName">' + name + '</div>' +
        '<div class="ticketMeta">' + tks.length + ' ticket' + (tks.length > 1 ? 's' : '') + ' abierto' + (tks.length > 1 ? 's' : '') + (hasCollision ? ' · ⚠️ colisión' : '') + '</div></div>' +
        '</div><div class="chips">' +
        tks.map(function (t) {
          var chip = t.url
            ? '<a href="' + t.url + '" target="_blank" class="chip ' + (t.collision ? 'primary' : '') + ' chipLink">' + t.number + (t.minutes > 0 ? '<span class="chip-time">· ' + t.minutes + 'm</span>' : '') + '</a>'
            : '<span class="chip ' + (t.collision ? 'primary' : '') + '">' + t.number + (t.minutes > 0 ? '<span class="chip-time">· ' + t.minutes + 'm</span>' : '') + '</span>';
          return chip;
        }).join('') +
        '</div></div>';
    }).join('');
  }

  function applyFilters(history) {
    return history.filter(function (e) {
      if (historyPeriod === 'today' && Date.now() - e.ts > 86400000) return false;
      if (historyPeriod === 'week' && Date.now() - e.ts > 7 * 86400000) return false;
      if (historyPeriod === 'custom') {
        if (dateFrom && e.ts < dateFrom) return false;
        if (dateTo && e.ts > dateTo) return false;
      }
      if (historyFilter) {
        var str = (e.ticketNumber || '') + (e.ticketId || '') + e.users.map(userName).join(' ');
        if (str.toLowerCase().indexOf(historyFilter.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }

  function populateTechFilter() {
    var techSet = {};
    lastHistory.forEach(function (e) {
      (e.users || []).forEach(function (u) { techSet[userName(u)] = true; });
    });
    var sel = document.getElementById('techFilter');
    var current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    Object.keys(techSet).sort().forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = current;
  }

  function renderHistory(history) {
    var today = lastHistory.filter(function (e) { return Date.now() - e.ts < 86400000; }).length;
    document.getElementById('statHistory').textContent = today;
    populateTechFilter();
    var el = document.getElementById('historyTab');
    if (!history.length) {
      el.innerHTML = '<div class="empty"><div class="emptyIcon">📋</div><div class="emptyText">Sin resultados</div><div class="emptySub">Prueba cambiando los filtros</div></div>';
      return;
    }
    var cards = history.map(function (e) {
      return '<div class="histCard"><div class="histLeft"><span style="font-size:16px">⚠️</span>' +
        '<div><div class="histTicket">' + (e.ticketNumber || '#' + e.ticketId) + '</div>' +
        '<div class="histTime">' + new Date(e.ts).toLocaleString('es-CL') + '</div></div></div>' +
        '<div class="chips">' + e.users.map(function (u, i) {
          return '<span class="histChip ' + (i === 0 ? 'first' : '') + '">' + userName(u) + '</span>';
        }).join('') + '</div></div>';
    }).join('');
    var hasMore = historyOffset < historyTotal && historyPeriod === 'all' && !historyFilter;
    el.innerHTML = cards + (hasMore
      ? '<div style="text-align:center;margin-top:12px"><button id="loadMoreBtn" class="csvBtn" style="margin:0 auto">Cargar más (' + (historyTotal - historyOffset) + ' restantes)</button></div>'
      : '');
    if (hasMore) {
      document.getElementById('loadMoreBtn').addEventListener('click', function () { fetchHistory(true); });
    }
  }

  function exportCsv() {
    var filtered = applyFilters(lastHistory);
    if (!filtered.length) return;
    var rows = [['Fecha', 'Ticket', 'Técnicos']];
    filtered.forEach(function (e) {
      rows.push([
        new Date(e.ts).toLocaleString('es-CL'),
        e.ticketNumber || '#' + e.ticketId,
        e.users.map(userName).join('; ')
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'colisiones_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function loadAnalytics() {
    var el = document.getElementById('analyticsTab');
    el.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3)">Cargando...</div>';
    fetch(BASE_URL + '/api/presence/analytics', { headers: { 'x-api-key': API_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.total) {
          el.innerHTML = '<div class="empty"><div class="emptyIcon">📊</div><div class="emptyText">Sin datos aún</div><div class="emptySub">Las colisiones aparecerán aquí una vez registradas</div></div>';
          return;
        }
        var maxTech = data.byTech.length ? data.byTech[0].count : 1;
        var maxHour = Math.max.apply(null, data.byHour) || 1;

        var techBars = data.byTech.map(function (t) {
          var w = Math.round((t.count / maxTech) * 100);
          return '<div class="barRow"><div class="barLabel" title="' + t.name + '">' + t.name + '</div>' +
            '<div class="barTrack"><div class="barFill" style="width:' + w + '%"></div></div>' +
            '<div class="barCount">' + t.count + '</div></div>';
        }).join('');

        var hourBars = data.byHour.map(function (c, h) {
          var pct = Math.round((c / maxHour) * 100);
          return '<div class="hourBar" style="height:' + Math.max(pct, c > 0 ? 8 : 2) + '%" title="' + h + ':00 — ' + c + ' colisiones"></div>';
        }).join('');
        var hourLabels = data.byHour.map(function (_, h) {
          return '<div class="hourLbl">' + (h % 3 === 0 ? h + 'h' : '') + '</div>';
        }).join('');

        var topTickets = data.topTickets.map(function (t) {
          var w = Math.round((t.count / (data.topTickets[0].count || 1)) * 100);
          return '<div class="barRow"><div class="barLabel">' + t.ticket + '</div>' +
            '<div class="barTrack"><div class="barFill blue" style="width:' + w + '%"></div></div>' +
            '<div class="barCount">' + t.count + '</div></div>';
        }).join('');

        var pairsHtml = '';
        if (data.pairs && data.pairs.length) {
          var maxPair = data.pairs[0].count || 1;
          var pairBars = data.pairs.map(function (p) {
            var w = Math.round((p.count / maxPair) * 100);
            return '<div class="barRow"><div class="barLabel" title="' + p.pair + '">' + p.pair + '</div>' +
              '<div class="barTrack"><div class="barFill" style="width:' + w + '%;background:linear-gradient(90deg,#8b5cf6,#ec4899)"></div></div>' +
              '<div class="barCount">' + p.count + 'x</div></div>';
          }).join('');
          pairsHtml = '<div class="anlSection"><div class="anlTitle">🔗 Pares que más colisionan</div>' + pairBars + '</div>';
        }

        var durStr = '';
        if (data.avgDurationSecs) {
          var avgMin = Math.floor(data.avgDurationSecs / 60);
          var avgSec = data.avgDurationSecs % 60;
          var maxMin = Math.floor((data.maxDurationSecs || 0) / 60);
          durStr = '<div class="anlSection"><div class="anlTitle">⏱ Duración de colisiones <span style="font-weight:400;color:rgba(255,255,255,0.35);font-size:12px">· ' + data.resolvedCount + ' registradas</span></div>' +
            '<div style="display:flex;gap:24px;margin-top:4px">' +
            '<div><div style="font-size:24px;font-weight:700;color:#f97316">' + (avgMin > 0 ? avgMin + 'm ' : '') + avgSec + 's</div><div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">Duración promedio</div></div>' +
            '<div><div style="font-size:24px;font-weight:700;color:rgba(255,255,255,0.6)">' + (maxMin > 0 ? maxMin + 'm ' : '') + (data.maxDurationSecs % 60) + 's</div><div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">Máxima registrada</div></div>' +
            '</div></div>';
        }

        var dayHtml = '';
        if (data.byDay && data.byDay.length) {
          var maxDay = Math.max.apply(null, data.byDay.map(function (d) { return d.count; })) || 1;
          var dayBars = data.byDay.map(function (d) {
            var pct = Math.round((d.count / maxDay) * 100);
            return '<div class="dayBar" style="height:' + Math.max(pct, d.count > 0 ? 8 : 2) + '%" title="' + d.date + ' — ' + d.count + ' col."></div>';
          }).join('');
          var dayLabels = data.byDay.map(function (d, i) {
            var day = d.date.slice(8); // DD
            return '<div class="dayLbl">' + (i % 5 === 0 ? day : '') + '</div>';
          }).join('');
          dayHtml = '<div class="anlSection"><div class="anlTitle">📅 Tendencia últimos 30 días</div>' +
            '<div class="dayGrid">' + dayBars + '</div>' +
            '<div class="dayLabels">' + dayLabels + '</div></div>';
        }

        el.innerHTML =
          dayHtml +
          '<div class="anlSection"><div class="anlTitle">👤 Técnicos con más colisiones <span style="font-weight:400;color:rgba(255,255,255,0.35);font-size:12px">· total ' + data.total + '</span></div>' + techBars + '</div>' +
          pairsHtml +
          '<div class="anlSection"><div class="anlTitle">🕐 Colisiones por hora del día</div>' +
            '<div class="hourGrid">' + hourBars + '</div>' +
            '<div class="hourLabels">' + hourLabels + '</div></div>' +
          (data.topTickets.length ? '<div class="anlSection"><div class="anlTitle">🎫 Tickets con más colisiones</div>' + topTickets + '</div>' : '') +
          durStr;
      }).catch(function () {
        el.innerHTML = '<div class="empty"><div class="emptyIcon">⚠️</div><div class="emptyText">Error al cargar análisis</div></div>';
      });
  }

  function loadConfig() {
    fetch(BASE_URL + '/api/config', { headers: { 'x-api-key': API_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        document.getElementById('webhookInput').value = data.teamsWebhook || '';
        document.getElementById('ttlInput').value = data.presenceTtl || 40;
        document.getElementById('notifEnabledInput').checked = data.notifEnabled !== false;
        try { document.getElementById('watchQueuesInput').value = (JSON.parse(data.watchQueues || '[]')).join(', '); } catch (e) { document.getElementById('watchQueuesInput').value = ''; }
        try { document.getElementById('criticalPrioritiesInput').value = (JSON.parse(data.criticalPriorities || '[1]')).join(', '); } catch (e) { document.getElementById('criticalPrioritiesInput').value = '1'; }
        document.getElementById('slaWarnMinInput').value = data.slaWarnMin || 30;
        document.getElementById('autotaskUiBaseInput').value = data.autotaskUiBase || '';
      }).catch(function () {});
  }

  function saveNotifConfig() {
    var status = document.getElementById('notifStatus');
    fetch(BASE_URL + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        notifEnabled: document.getElementById('notifEnabledInput').checked,
        watchQueues: document.getElementById('watchQueuesInput').value,
        criticalPriorities: document.getElementById('criticalPrioritiesInput').value,
        slaWarnMin: parseInt(document.getElementById('slaWarnMinInput').value) || 30,
        autotaskUiBase: document.getElementById('autotaskUiBaseInput').value.trim(),
      })
    }).then(function () {
      status.className = 'configStatus ok';
      status.textContent = '✓ Configuración de notificaciones guardada';
      setTimeout(function () { status.textContent = ''; }, 3000);
    }).catch(function () {
      status.className = 'configStatus err';
      status.textContent = '✗ Error al guardar';
    });
  }

  function pollNow() {
    var status = document.getElementById('notifStatus');
    status.className = 'configStatus';
    status.style.color = 'rgba(255,255,255,0.5)';
    status.textContent = 'Sondeando Autotask...';
    fetch(BASE_URL + '/api/notifications/poll?force=1', { headers: { 'x-api-key': API_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        status.style.color = '';
        if (!data.ran) {
          status.className = 'configStatus err';
          status.textContent = '⚠ No se ejecutó (poller desactivado o Autotask sin credenciales)';
        } else {
          var c = data.counts || {};
          status.className = 'configStatus ok';
          status.textContent = '✓ Sondeo OK · n1:' + (c.n1 || 0) + ' n2:' + (c.n2 || 0) + ' n3:' + (c.n3 || 0) + ' n4:' + (c.n4 || 0) + ' n5:' + (c.n5 || 0);
        }
        setTimeout(function () { status.textContent = ''; }, 6000);
      }).catch(function () {
        status.style.color = '';
        status.className = 'configStatus err';
        status.textContent = '✗ Error al sondear';
      });
  }

  function saveTtl() {
    var val = parseInt(document.getElementById('ttlInput').value) || 40;
    val = Math.max(15, Math.min(300, val));
    var status = document.getElementById('ttlStatus');
    fetch(BASE_URL + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ presenceTtl: val })
    }).then(function () {
      status.className = 'configStatus ok';
      status.textContent = '✓ TTL guardado: ' + val + 's';
      setTimeout(function () { status.textContent = ''; }, 3000);
    }).catch(function () {
      status.className = 'configStatus err';
      status.textContent = '✗ Error al guardar';
    });
  }

  function saveWebhook() {
    var url = document.getElementById('webhookInput').value.trim();
    var status = document.getElementById('webhookStatus');
    fetch(BASE_URL + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ teamsWebhook: url })
    }).then(function () {
      status.className = 'configStatus ok';
      status.textContent = '✓ Webhook guardado';
      setTimeout(function () { status.textContent = ''; }, 3000);
    }).catch(function () {
      status.className = 'configStatus err';
      status.textContent = '✗ Error al guardar';
    });
  }

  function testWebhook() {
    var url = document.getElementById('webhookInput').value.trim();
    var status = document.getElementById('webhookStatus');
    if (!url) { status.className = 'configStatus err'; status.textContent = 'Ingresa una URL primero'; return; }
    var body = {
      '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
      themeColor: 'f97316', summary: '✅ Prueba de webhook',
      sections: [{ activityTitle: '✅ Webhook configurado correctamente', activitySubtitle: 'Autotask CoView · Netsus', activityText: 'Las alertas de colisión llegarán a este canal.' }]
    };
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function () {
        status.className = 'configStatus ok';
        status.textContent = '✓ Mensaje de prueba enviado a Teams';
        setTimeout(function () { status.textContent = ''; }, 4000);
      }).catch(function () {
        status.className = 'configStatus err';
        status.textContent = '✗ Error — verifica la URL del webhook';
      });
  }

  function clearWebhook() {
    document.getElementById('webhookInput').value = '';
    saveWebhook();
  }

  // Event listeners
  document.getElementById('viewByTicket').addEventListener('click', function () {
    liveView = 'ticket';
    document.getElementById('viewByTicket').classList.add('active');
    document.getElementById('viewByTech').classList.remove('active');
    renderLive(lastTickets);
  });
  document.getElementById('viewByTech').addEventListener('click', function () {
    liveView = 'tech';
    document.getElementById('viewByTech').classList.add('active');
    document.getElementById('viewByTicket').classList.remove('active');
    renderLive(lastTickets);
  });

  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('pwdInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);
  document.getElementById('tabLive').addEventListener('click', function () { setTab('live'); });
  document.getElementById('tabHistory').addEventListener('click', function () { setTab('history'); });
  document.getElementById('tabAnalytics').addEventListener('click', function () { setTab('analytics'); });
  document.getElementById('tabConfig').addEventListener('click', function () { setTab('config'); });
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('saveTtlBtn').addEventListener('click', saveTtl);
  document.getElementById('saveNotifBtn').addEventListener('click', saveNotifConfig);
  document.getElementById('pollNowBtn').addEventListener('click', pollNow);
  document.getElementById('saveWebhookBtn').addEventListener('click', saveWebhook);
  document.getElementById('testWebhookBtn').addEventListener('click', testWebhook);
  document.getElementById('clearWebhookBtn').addEventListener('click', clearWebhook);

  function sendDailySummary(period) {
    var statusEl = document.getElementById('summaryStatus');
    statusEl.textContent = 'Enviando...';
    statusEl.style.color = 'rgba(255,255,255,0.5)';
    fetch(BASE_URL + '/api/presence/daily-summary?send=true&period=' + period, { headers: { 'x-api-key': API_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.total === 0) {
          statusEl.textContent = '⚠ Sin colisiones en el período seleccionado';
          statusEl.style.color = '#f97316';
        } else {
          statusEl.textContent = '✓ Resumen enviado · ' + data.total + ' colisiones';
          statusEl.style.color = '#10b981';
        }
        setTimeout(function () { statusEl.textContent = ''; }, 5000);
      }).catch(function () {
        statusEl.textContent = '✗ Error al enviar';
        statusEl.style.color = '#ef4444';
        setTimeout(function () { statusEl.textContent = ''; }, 4000);
      });
  }

  document.getElementById('sendYesterdayBtn').addEventListener('click', function () { sendDailySummary('yesterday'); });
  document.getElementById('sendTodayBtn').addEventListener('click', function () { sendDailySummary('today'); });

  document.getElementById('historySearch').addEventListener('input', function () {
    historyFilter = this.value;
    renderHistory(applyFilters(lastHistory));
  });

  document.getElementById('techFilter').addEventListener('change', function () {
    historyTechFilter = this.value;
    historyOffset = 0;
    fetchHistory(false);
  });

  document.getElementById('clearHistoryBtn').addEventListener('click', function () {
    if (!confirm('¿Borrar todo el historial de colisiones? Esta acción no se puede deshacer.')) return;
    fetch(BASE_URL + '/api/presence/history', { method: 'DELETE', headers: { 'x-api-key': API_KEY } })
      .then(function () {
        lastHistory = [];
        historyOffset = 0;
        historyTotal = 0;
        renderHistory([]);
        document.getElementById('statHistory').textContent = '0';
      }).catch(function () { alert('Error al borrar el historial'); });
  });

  document.querySelectorAll('.periodBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      historyPeriod = this.dataset.period;
      document.querySelectorAll('.periodBtn').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('dateRangeRow').style.display = historyPeriod === 'custom' ? 'flex' : 'none';
      renderHistory(applyFilters(lastHistory));
    });
  });

  document.getElementById('dateFrom').addEventListener('change', function () {
    dateFrom = this.value ? new Date(this.value).getTime() : null;
    renderHistory(applyFilters(lastHistory));
  });
  document.getElementById('dateTo').addEventListener('change', function () {
    dateTo = this.value ? new Date(this.value + 'T23:59:59').getTime() : null;
    renderHistory(applyFilters(lastHistory));
  });

  if (sessionStorage.getItem('netsus_admin') === '1') {
    showPanel();
  }
})();
