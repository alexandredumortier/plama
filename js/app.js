'use strict';

(async () => {
  // ── Service Worker ──────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ── Carte des ports (adapté de templates/index.html de l'appli PC) ──────
  // Source : appli PC — même version Leaflet 1.9.4, même vue initiale, mêmes marqueurs
  let _carte = null;
  let _marqueurs = [];  // {marqueur, fichier}

  function _initCarte() {
    // Vue initiale identique à l'appli PC : [47.8, -3.2], zoom 7
    _carte = L.map('map-ports').setView([47.8, -3.2], 7);

    // Pane dédié au fond de côte (zIndex 150 = sous les tuiles OSM à 200)
    // Ainsi OSM s'affiche normalement en ligne ; hors ligne, seul le fond de côte est visible
    const cotePaane = _carte.createPane('cote');
    cotePaane.style.zIndex = '150';

    // Fond de carte hors ligne : polygones terres Natural Earth (domaine public)
    // Fond mer bleu pâle : couleur CSS du conteneur (#map-ports, background: #c8e0f0)
    // Terre gris clair par-dessus, placé dans le pane 'cote' (sous les tuiles OSM)
    fetch('data/cote.geojson')
      .then(r => r.json())
      .then(gj => {
        L.geoJSON(gj, {
          pane: 'cote',
          style: {
            fillColor: '#d4dce3',
            fillOpacity: 1,
            color: '#8fa8b8',
            weight: 0.8
          }
        }).addTo(_carte);
      })
      .catch(() => { /* pas de fond de carte hors ligne, la carte reste utilisable */ });

    // Tuiles OSM quand le réseau est disponible (même source et attribution que l'appli PC)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(_carte);
  }

  function _peuplerCarte(ports) {
    if (!_carte) return;
    // Crée les marqueurs (identique à l'appli PC : L.marker, closeOnClick: false, autoClose: true)
    ports.forEach(port => {
      if (!port.lat || !port.lon) return;
      const marqueur = L.marker([port.lat, port.lon])
        .bindPopup(
          '<b>' + port.nom + '</b>',
          { maxWidth: 200, closeOnClick: false, autoClose: true }
        );
      marqueur.on('click', () => {
        // Un clic sur le marqueur sélectionne le port dans la liste déroulante
        sel.value = port.fichier;
        sel.dispatchEvent(new Event('change'));
      });
      marqueur.addTo(_carte);
      _marqueurs.push({ marqueur, fichier: port.fichier });
    });
  }

  _initCarte();
  // ── Fin code carte ───────────────────────────────────────────────────────

  const statusEl = document.getElementById('status');
  const sel      = document.getElementById('port-select');

  function showError(msg) {
    statusEl.textContent = msg;
    statusEl.className = 'error';
  }
  function showSuccess(msg) {
    statusEl.textContent = msg;
    statusEl.className = 'success';
  }
  function clearStatus() {
    statusEl.textContent = '';
    statusEl.className = '';
  }

  // ── Chargement de ports.json ────────────────────────────────────────────
  let portMap = {};
  try {
    const resp = await fetch('data/ports.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const ports = await resp.json();

    // Tri alphabétique français
    ports.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

    sel.innerHTML = '<option value="">\u2014 Choisir un port \u2014</option>';
    for (const p of ports) {
      const opt = document.createElement('option');
      opt.value = p.fichier;
      opt.textContent = p.nom;
      sel.appendChild(opt);
      portMap[p.fichier] = p;
    }
    // Peuple la carte avec les marqueurs (lat, lon, nom, fichier tous présents dans ports.json)
    _peuplerCarte(ports);
  } catch (err) {
    sel.innerHTML = '<option value="">Erreur de chargement</option>';
    sel.disabled = true;
    showError('Impossible de charger la liste des ports\u00a0: ' + err.message);
    return;
  }

  // ── Utilitaires de dates ───────────────────────────────────────────────

  /** "YYYY-MM-DD" → frLocalMs (composants = heure France locale stockée en UTC) */
  function dateToMs(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  /** frLocalMs → "JJ-MM-AAAA" */
  function fmtDate(ms) {
    const d = new Date(ms);
    return (
      String(d.getUTCDate()).padStart(2, '0') + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      d.getUTCFullYear()
    );
  }

  // ── Soumission du formulaire ───────────────────────────────────────────
  document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearStatus();

    // Lecture des champs
    const fichier   = sel.value;
    const dateDebut = document.getElementById('date-debut').value;
    const dateFin   = document.getElementById('date-fin').value;
    const seuilStr  = document.getElementById('seuil').value.replace(',', '.');
    const mode      = document.querySelector('input[name="mode"]:checked').value;

    // ── Validations ──────────────────────────────────────────────────────
    if (!fichier) {
      showError('Veuillez s\u00e9lectionner un port.');
      return;
    }
    if (!dateDebut || !dateFin) {
      showError('Veuillez renseigner les deux dates.');
      return;
    }

    const seuil = parseFloat(seuilStr);
    if (isNaN(seuil) || seuil <= 0) {
      showError('Seuil invalide. Entrez un nombre positif (ex.\u00a04,5).');
      return;
    }

    const debutMs = dateToMs(dateDebut);
    const finMs   = dateToMs(dateFin);

    if (debutMs > finMs) {
      showError('La date de d\u00e9but doit \u00eatre ant\u00e9rieure ou \u00e9gale \u00e0 la date de fin.');
      return;
    }

    const port = portMap[fichier];

    // ── Calcul harmonique ───────────────────────────────────────────────
    // Grille 2h identique à generation.py pour les PM/BM
    const MS_2H     = 7200000;
    const gridStart = debutMs - 86400000;   // −1 jour
    const gridEnd   = finMs   + 2 * 86400000; // +2 jours

    const points = [];
    for (let t = gridStart; t < gridEnd; t += MS_2H) {
      points.push([t, maree.hauteurHarmonique(t, port.z0, port.constituantes)]);
    }

    const tideEvents      = maree.detecterPmBm(port.z0, port.constituantes, points);
    const globalIntervals = maree.calculerCreneaux(
      port.z0, port.constituantes, debutMs, finMs, seuil, mode
    );

    // ── Vérification : au moins une plage de travail ──────────────────
    if (globalIntervals.length === 0) {
      const modeLabel = mode === 'h' ? 'haute' : 'basse';
      const seuilFr   = String(seuil).replace('.', ',');
      showError(
        'Aucune plage de travail trouv\u00e9e pour une mar\u00e9e ' + modeLabel +
        ' avec un seuil de ' + seuilFr + '\u00a0m sur cette p\u00e9riode.'
      );
      return;
    }

    // ── Génération ICS ───────────────────────────────────────────────────
    const contenu = ics.genererIcs(
      globalIntervals, tideEvents, port.nom, seuil, mode, debutMs, finMs
    );

    // ── Nom du fichier : Plama <Port> JJ-MM-AAAA au JJ-MM-AAAA <seuil><H|B>.ics ──
    const seuilFr  = String(seuil).replace('.', ',');
    const modeChar = mode === 'h' ? 'H' : 'B';
    const filename = (
      'Plama ' + port.nom + ' ' +
      fmtDate(debutMs) + ' au ' + fmtDate(finMs) + ' ' +
      seuilFr + modeChar + '.ics'
    );

    // ── Téléchargement ───────────────────────────────────────────────────
    const blob = new Blob([contenu], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccess(
      globalIntervals.length + ' plage(s) de travail g\u00e9n\u00e9r\u00e9e(s).'
    );
  });
})();
