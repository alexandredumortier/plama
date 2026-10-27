'use strict';

(async () => {
  /* ════════════════════════════════════════════════════════════════════
     Constantes frise
     JOURS_FRISE  : nombre de jours visibles (changer aussi px dans le CSS)
     PX_PAR_HEURE : hauteur d'une heure en pixels (doit correspondre au CSS : 56px)
  ════════════════════════════════════════════════════════════════════ */
  const JOURS_FRISE  = 5;
  const PX_PAR_HEURE = 56;
  const TOTAL_PX     = 24 * PX_PAR_HEURE; // 1344 px
  const MS_JOUR      = 86400000;
  const MS_2H        = 7200000;

  /* ════════════════════════════════════════════════════════════════════
     Service Worker + bandeau de mise à jour
  ════════════════════════════════════════════════════════════════════ */
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('sw.js').catch(() => null);
    if (reg) {
      const afficherBandeau = (sw) => {
        const b = document.getElementById('bandeau-maj');
        b.hidden = false;
        b.addEventListener('click', () => sw.postMessage({ type: 'SKIP_WAITING' }), { once: true });
      };

      // Nouveau SW déjà en attente (ex. page rechargée après installation)
      if (reg.waiting) {
        afficherBandeau(reg.waiting);
      }

      // Nouveau SW trouvé pendant la navigation
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            afficherBandeau(newSW);
          }
        });
      });
    }

    // Rechargement unique après changement de contrôleur (skipWaiting confirmé)
    let _reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!_reloading) { _reloading = true; location.reload(); }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     Gestion des écrans
  ════════════════════════════════════════════════════════════════════ */
  const _screens = ['accueil', 'exporter', 'consulter', 'frise'];

  function showScreen(name) {
    _screens.forEach(s => {
      document.getElementById('screen-' + s).classList.toggle('active', s === name);
    });
    // Invalidation des cartes Leaflet après affichage (50 ms pour le reflow)
    if (name === 'exporter' && _mapExport) {
      setTimeout(() => _mapExport.invalidateSize(), 50);
    }
    if (name === 'consulter' && _mapConsult) {
      setTimeout(() => _mapConsult.invalidateSize(), 50);
    }
  }

  document.getElementById('btn-vers-exporter').addEventListener('click', () => {
    showScreen('exporter');
    if (!_mapExport) setTimeout(() => _initCarte('export'), 50);
  });
  document.getElementById('btn-vers-consulter').addEventListener('click', () => {
    showScreen('consulter');
    if (!_mapConsult) setTimeout(() => _initCarte('consult'), 50);
  });
  document.getElementById('btn-retour-export').addEventListener('click',  () => showScreen('accueil'));
  document.getElementById('btn-retour-consult').addEventListener('click', () => showScreen('accueil'));
  document.getElementById('btn-retour-frise').addEventListener('click',   () => showScreen('consulter'));

  /* ════════════════════════════════════════════════════════════════════
     Cartes Leaflet (une par écran, initialisées à la première visite)
  ════════════════════════════════════════════════════════════════════ */
  let _mapExport = null;
  let _mapConsult = null;

  function _creerFondCarte(carte) {
    const cotePaane = carte.createPane('cote');
    cotePaane.style.zIndex = '150';
    fetch('data/cote.geojson')
      .then(r => r.json())
      .then(gj => {
        L.geoJSON(gj, {
          pane: 'cote',
          style: { fillColor: '#d4dce3', fillOpacity: 1, color: '#8fa8b8', weight: 0.8 }
        }).addTo(carte);
      })
      .catch(() => {});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(carte);
  }

  function _peuplerCarte(carte, sel) {
    _ports.forEach(port => {
      if (!port.lat || !port.lon) return;
      L.marker([port.lat, port.lon])
        .bindPopup('<b>' + port.nom + '</b>', { maxWidth: 200, closeOnClick: false, autoClose: true })
        .on('click', () => {
          sel.value = port.fichier;
          sel.dispatchEvent(new Event('change'));
        })
        .addTo(carte);
    });
  }

  function _initCarte(which) {
    const mapId = (which === 'export') ? 'map-ports-export' : 'map-ports-consult';
    const sel   = (which === 'export') ? _selExport : _selConsult;
    const carte = L.map(mapId).setView([47.8, -3.2], 7);
    _creerFondCarte(carte);
    _peuplerCarte(carte, sel);
    if (which === 'export') _mapExport = carte;
    else                    _mapConsult = carte;
  }

  /* ════════════════════════════════════════════════════════════════════
     Chargement des ports
  ════════════════════════════════════════════════════════════════════ */
  let _ports  = [];
  let _portMap = {};

  const _selExport  = document.getElementById('port-select-export');
  const _selConsult = document.getElementById('port-select-consult');
  const _statusExport = document.getElementById('status-export');

  function _showError(el, msg)   { el.textContent = msg; el.className = 'status-msg error'; }
  function _showSuccess(el, msg) { el.textContent = msg; el.className = 'status-msg success'; }
  function _clearStatus(el)      { el.textContent = ''; el.className = 'status-msg'; }

  try {
    const resp = await fetch('data/ports.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    _ports = await resp.json();
    _ports.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

    const plh = '\u2014 Choisir un port \u2014';
    _selExport.innerHTML  = '<option value="">' + plh + '</option>';
    _selConsult.innerHTML = '<option value="">' + plh + '</option>';

    for (const p of _ports) {
      const makeOpt = () => {
        const o = document.createElement('option');
        o.value = p.fichier;
        o.textContent = p.nom;
        return o;
      };
      _selExport.appendChild(makeOpt());
      _selConsult.appendChild(makeOpt());
      _portMap[p.fichier] = p;
    }
  } catch (err) {
    [_selExport, _selConsult].forEach(sel => {
      sel.innerHTML = '<option value="">Erreur de chargement</option>';
      sel.disabled = true;
    });
    _showError(_statusExport, 'Impossible de charger la liste des ports\u00a0: ' + err.message);
  }

  /* ════════════════════════════════════════════════════════════════════
     Utilitaires de dates
  ════════════════════════════════════════════════════════════════════ */

  /** "YYYY-MM-DD" → frLocalMs */
  function _dateToMs(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  /** frLocalMs → "JJ-MM-AAAA" */
  function _fmtDate(ms) {
    const d = new Date(ms);
    return (
      String(d.getUTCDate()).padStart(2, '0') + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      d.getUTCFullYear()
    );
  }

  /** frLocalMs → "HH:MM" */
  function _fmtHeure(ms) {
    const d = new Date(ms);
    return (
      String(d.getUTCHours()).padStart(2, '0') + ':' +
      String(d.getUTCMinutes()).padStart(2, '0')
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     Écran Exporter — formulaire ICS (logique identique à l'original)
  ════════════════════════════════════════════════════════════════════ */
  document.getElementById('form-export').addEventListener('submit', (e) => {
    e.preventDefault();
    _clearStatus(_statusExport);

    const fichier   = _selExport.value;
    const dateDebut = document.getElementById('date-debut-export').value;
    const dateFin   = document.getElementById('date-fin-export').value;
    const seuilStr  = document.getElementById('seuil-export').value.replace(',', '.');
    const mode      = document.querySelector('input[name="mode-export"]:checked').value;

    if (!fichier) {
      _showError(_statusExport, 'Veuillez s\u00e9lectionner un port.');
      return;
    }
    if (!dateDebut || !dateFin) {
      _showError(_statusExport, 'Veuillez renseigner les deux dates.');
      return;
    }

    const seuil = parseFloat(seuilStr);
    if (isNaN(seuil) || seuil <= 0) {
      _showError(_statusExport, 'Seuil invalide. Entrez un nombre positif (ex.\u00a04,5).');
      return;
    }

    const debutMs = _dateToMs(dateDebut);
    const finMs   = _dateToMs(dateFin);
    if (debutMs > finMs) {
      _showError(_statusExport, 'La date de d\u00e9but doit \u00eatre ant\u00e9rieure ou \u00e9gale \u00e0 la date de fin.');
      return;
    }

    const port = _portMap[fichier];

    // Grille 2h pour PM/BM (identique à l'original)
    const gridStart = debutMs - MS_JOUR;
    const gridEnd   = finMs   + 2 * MS_JOUR;
    const points = [];
    for (let t = gridStart; t < gridEnd; t += MS_2H) {
      points.push([t, maree.hauteurHarmonique(t, port.z0, port.constituantes)]);
    }

    const tideEvents      = maree.detecterPmBm(port.z0, port.constituantes, points);
    const globalIntervals = maree.calculerCreneaux(port.z0, port.constituantes, debutMs, finMs, seuil, mode);

    if (globalIntervals.length === 0) {
      const modeLabel = mode === 'h' ? 'haute' : 'basse';
      const seuilFr   = String(seuil).replace('.', ',');
      _showError(_statusExport,
        'Aucune plage de travail trouv\u00e9e pour une mar\u00e9e ' + modeLabel +
        ' avec un seuil de ' + seuilFr + '\u00a0m sur cette p\u00e9riode.');
      return;
    }

    const seuilFr  = String(seuil).replace('.', ',');
    const modeChar = mode === 'h' ? 'H' : 'B';
    const filename = (
      'Plama ' + port.nom + ' ' +
      _fmtDate(debutMs) + ' au ' + _fmtDate(finMs) + ' ' +
      seuilFr + modeChar + '.ics'
    );
    const calname = filename.replace(/\.ics$/, '');
    const contenu = ics.genererIcs(globalIntervals, tideEvents, port.nom, seuil, mode, debutMs, finMs, calname);

    const blob = new Blob([contenu], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    _showSuccess(_statusExport, globalIntervals.length + ' plage(s) de travail g\u00e9n\u00e9r\u00e9e(s).');
  });

  /* ════════════════════════════════════════════════════════════════════
     Écran Consulter — formulaire sans date de fin, sans export
  ════════════════════════════════════════════════════════════════════ */
  const _statusConsult = document.getElementById('status-consult');

  document.getElementById('form-consult').addEventListener('submit', (e) => {
    e.preventDefault();
    _clearStatus(_statusConsult);

    const fichier   = _selConsult.value;
    const dateDebut = document.getElementById('date-debut-consult').value;
    const seuilStr  = document.getElementById('seuil-consult').value.replace(',', '.');
    const mode      = document.querySelector('input[name="mode-consult"]:checked').value;

    if (!fichier) {
      _showError(_statusConsult, 'Veuillez s\u00e9lectionner un port.');
      return;
    }
    if (!dateDebut) {
      _showError(_statusConsult, 'Veuillez renseigner la date de d\u00e9but.');
      return;
    }

    const seuil = parseFloat(seuilStr);
    if (isNaN(seuil) || seuil <= 0) {
      _showError(_statusConsult, 'Seuil invalide. Entrez un nombre positif (ex.\u00a04,5).');
      return;
    }

    _friseParams = {
      port:        _portMap[fichier],
      seuil,
      mode,
      dateDebutMs: _dateToMs(dateDebut),
    };
    _friseOffset = 0;
    _renderFrisePage();
    showScreen('frise');
  });

  /* ════════════════════════════════════════════════════════════════════
     Frise de consultation
  ════════════════════════════════════════════════════════════════════ */
  let _friseParams = null;
  let _friseOffset = 0; // nombre de fenêtres décalées depuis la date initiale

  document.getElementById('btn-frise-prev').addEventListener('click', () => {
    _friseOffset--;
    _renderFrisePage();
  });
  document.getElementById('btn-frise-next').addEventListener('click', () => {
    _friseOffset++;
    _renderFrisePage();
  });

  /** Calcule et affiche la frise pour la fenêtre courante. */
  function _renderFrisePage() {
    const { port, seuil, mode, dateDebutMs } = _friseParams;
    const friseStartMs = dateDebutMs + _friseOffset * JOURS_FRISE * MS_JOUR;
    // finMs = dernier jour inclus (même convention que l'export : minuit du dernier jour)
    const finMs = friseStartMs + (JOURS_FRISE - 1) * MS_JOUR;

    // En-tête d'information
    const modeLabel = mode === 'h' ? 'Mar\u00e9e haute' : 'Mar\u00e9e basse';
    const seuilFr   = String(seuil).replace('.', ',');
    document.getElementById('frise-info').textContent =
      port.nom + ' \u2014 seuil\u00a0: ' + seuilFr + '\u00a0m \u2014 ' + modeLabel;

    // ── Créneaux — EXACTEMENT les mêmes fonctions que l'export ──────────
    const creneaux = maree.calculerCreneaux(
      port.z0, port.constituantes,
      friseStartMs, finMs,
      seuil, mode
    );

    // ── PM/BM sur la fenêtre élargie (même logique que l'export) ────────
    const gridStart = friseStartMs - MS_JOUR;
    const gridEnd   = friseStartMs + (JOURS_FRISE + 1) * MS_JOUR;
    const points = [];
    for (let t = gridStart; t < gridEnd; t += MS_2H) {
      points.push([t, maree.hauteurHarmonique(t, port.z0, port.constituantes)]);
    }
    const pmBm = maree.detecterPmBm(port.z0, port.constituantes, points);

    // Rendu graphique
    _dessinerGrille(
      document.getElementById('frise-grille'),
      creneaux, pmBm, friseStartMs
    );

    // Repositionner le scroll sur 6h (heure de début de travail typique)
    const scroll = document.getElementById('frise-scroll');
    scroll.scrollTop = 6 * PX_PAR_HEURE - 4;
  }

  /**
   * Dessine la grille dans le conteneur fourni.
   * Gère les créneaux à cheval sur minuit et le changement d'heure.
   */
  function _dessinerGrille(container, creneaux, pmBm, friseStartMs) {
    container.innerHTML = '';

    const JOURS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    // ── En-tête des colonnes (sticky) ─────────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'frise-header-row';

    const timeHead = document.createElement('div');
    timeHead.className = 'frise-col-time-head';
    headerRow.appendChild(timeHead);

    for (let d = 0; d < JOURS_FRISE; d++) {
      const dayMs = friseStartMs + d * MS_JOUR;
      const dt    = new Date(dayMs);
      const head  = document.createElement('div');
      head.className = 'frise-col-header';
      head.innerHTML =
        '<span class="frise-dow">'  + JOURS_FR[dt.getUTCDay()] + '</span>' +
        '<span class="frise-date">' +
          String(dt.getUTCDate()).padStart(2, '0') + '/' +
          String(dt.getUTCMonth() + 1).padStart(2, '0') +
        '</span>';
      headerRow.appendChild(head);
    }
    container.appendChild(headerRow);

    // ── Corps (axe temps + colonnes) ──────────────────────────────────
    const body = document.createElement('div');
    body.className = 'frise-body';

    // Axe temps (repères toutes les 2h)
    const timeAxis = document.createElement('div');
    timeAxis.className = 'frise-time-axis';
    for (let h = 0; h < 24; h += 2) {
      const lbl = document.createElement('div');
      lbl.className = 'frise-hour-label';
      lbl.style.top = (h * PX_PAR_HEURE) + 'px';
      lbl.textContent = h + 'h';
      timeAxis.appendChild(lbl);
    }
    body.appendChild(timeAxis);

    // Colonnes de jours
    for (let d = 0; d < JOURS_FRISE; d++) {
      const dayStartMs = friseStartMs + d * MS_JOUR;
      const dayEndMs   = dayStartMs + MS_JOUR;

      const col = document.createElement('div');
      col.className = 'frise-day-col';

      // ── Créneaux de travail pour ce jour ────────────────────────────
      // Gestion des créneaux à cheval sur minuit : on clip au jour courant.
      for (const [cStart, cEnd] of creneaux) {
        const s = Math.max(cStart, dayStartMs);
        const e = Math.min(cEnd,   dayEndMs);
        if (s >= e) continue;

        const sD = new Date(s);
        const eD = new Date(e);

        // Position en pixels : basée sur l'heure France locale (frLocalMs → getUTCH/M)
        const topPx = (sD.getUTCHours() * 60 + sD.getUTCMinutes()) / 60 * PX_PAR_HEURE;
        const rawBot = (eD.getUTCHours() * 60 + eD.getUTCMinutes()) / 60 * PX_PAR_HEURE;
        // Fin à minuit pile : getUTCH=0, getUTCM=0 → rawBot=0 → on force TOTAL_PX
        const botPx = (rawBot > topPx) ? rawBot : TOTAL_PX;
        const hPx   = botPx - topPx;

        const block = document.createElement('div');
        block.className = 'frise-creneau';
        block.style.top    = topPx + 'px';
        block.style.height = hPx   + 'px';

        let html = '';

        // Heure de début (si le créneau commence bien dans ce jour)
        if (hPx >= 16 && s === cStart) {
          html += '<span class="fc-start">' + _fmtHeure(s) + '</span>';
        }
        // PM/BM à l'intérieur du créneau
        if (hPx >= 44) {
          const evInBlock = pmBm.filter(ev => ev.dtMs >= s && ev.dtMs < e);
          for (const ev of evInBlock) {
            const evD    = new Date(ev.dtMs);
            const evPx   = (evD.getUTCHours() * 60 + evD.getUTCMinutes()) / 60 * PX_PAR_HEURE;
            const evTop  = Math.max(0, Math.min(hPx - 24, evPx - topPx - 12));
            const hStr   = ev.hauteur.toFixed(2).replace('.', ',');
            html +=
              '<span class="fc-pmbm fc-' + ev.type.toLowerCase() + '" style="top:' + evTop.toFixed(1) + 'px">' +
                ev.type + ' ' + _fmtHeure(ev.dtMs) + ' ' + hStr + 'm' +
              '</span>';
          }
        }
        // Heure de fin (si le créneau se termine bien dans ce jour, espace suffisant)
        if (hPx >= 28 && e === cEnd) {
          html += '<span class="fc-end">' + _fmtHeure(e) + '</span>';
        }

        block.innerHTML = html;
        col.appendChild(block);
      }

      // ── Marqueurs PM/BM hors créneaux ───────────────────────────────
      for (const ev of pmBm) {
        if (ev.dtMs < dayStartMs || ev.dtMs >= dayEndMs) continue;
        // Vérifier qu'il n'est PAS dans un créneau de travail
        const dansCreneau = creneaux.some(([cs, ce]) => ev.dtMs >= cs && ev.dtMs < ce);
        if (dansCreneau) continue;

        const evD   = new Date(ev.dtMs);
        const topPx = (evD.getUTCHours() * 60 + evD.getUTCMinutes()) / 60 * PX_PAR_HEURE;
        const marker = document.createElement('div');
        marker.className = 'frise-pmbm-marker fpm-' + ev.type.toLowerCase();
        marker.style.top = topPx + 'px';
        marker.title =
          ev.type + ' ' + _fmtHeure(ev.dtMs) + ' \u2014 ' +
          ev.hauteur.toFixed(2).replace('.', ',') + '\u00a0m';
        col.appendChild(marker);
      }

      body.appendChild(col);
    }

    container.appendChild(body);
  }
})();
