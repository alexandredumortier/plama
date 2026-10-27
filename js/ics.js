/**
 * ics.js — Export ICS (RFC 5545) à partir des données de marée.
 * Port fidèle de ics_export.py (projet "Appli marée").
 *
 * Convention temporelle : même que maree.js — tous les dtMs sont des
 * millisecondes où les composants UTC = heure locale France (frLocalMs).
 *
 * Compatible navigateur ET Node.js (export conditionnel en fin de fichier).
 */

'use strict';

// ── Bloc VTIMEZONE Europe/Paris (CET/CEST) ─────────────────────────────────
// Identique à VTIMEZONE_PARIS dans ics_export.py
const VTIMEZONE_PARIS =
    'BEGIN:VTIMEZONE\r\n' +
    'TZID:Europe/Paris\r\n' +
    'BEGIN:STANDARD\r\n' +
    'DTSTART:19701025T030000\r\n' +
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\r\n' +
    'TZOFFSETFROM:+0200\r\n' +
    'TZOFFSETTO:+0100\r\n' +
    'TZNAME:CET\r\n' +
    'END:STANDARD\r\n' +
    'BEGIN:DAYLIGHT\r\n' +
    'DTSTART:19700329T020000\r\n' +
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\r\n' +
    'TZOFFSETFROM:+0100\r\n' +
    'TZOFFSETTO:+0200\r\n' +
    'TZNAME:CEST\r\n' +
    'END:DAYLIGHT\r\n' +
    'END:VTIMEZONE\r\n';


// ── Helpers RFC 5545 ───────────────────────────────────────────────────────

/**
 * Formate un dtMs (frLocalMs) en "YYYYMMDDTHHmmSS" pour ICS.
 * Identique à _ics_dt() dans ics_export.py.
 */
function _ics_dt(dtMs) {
    const d = new Date(dtMs);
    const p = n => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear() +
        p(d.getUTCMonth() + 1) +
        p(d.getUTCDate()) +
        'T' +
        p(d.getUTCHours()) +
        p(d.getUTCMinutes()) +
        p(d.getUTCSeconds())
    );
}

/**
 * Retourne minuit du jour de dtMs (convention frLocalMs).
 * Utilisé pour les comparaisons de dates (équivalent à .date() en Python).
 */
function _dayMs(dtMs) {
    const d = new Date(dtMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Formate les composants heure:minute d'un dtMs (frLocalMs) en "HH:MM".
 * Identique à dt.strftime('%H:%M') dans ics_export.py.
 */
function _hhmm(dtMs) {
    const d = new Date(dtMs);
    return (
        String(d.getUTCHours()).padStart(2, '0') +
        ':' +
        String(d.getUTCMinutes()).padStart(2, '0')
    );
}

/**
 * Échappe les caractères spéciaux ICS : \ ; , \n
 * Identique à _escape() dans ics_export.py.
 */
function _escape(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Encode une chaîne en octets UTF-8.
 * Compatible navigateur (TextEncoder) et Node.js (Buffer).
 */
function _utf8Encode(str) {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str);
    }
    // Node.js < 11 fallback
    return Buffer.from(str, 'utf8');
}

/**
 * Décode des octets UTF-8 en chaîne.
 * Compatible navigateur (TextDecoder) et Node.js (Buffer).
 */
function _utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(bytes);
    }
    return Buffer.from(bytes).toString('utf8');
}

/**
 * Plie une ligne ICS à 75 octets (RFC 5545 §3.1), encodage UTF-8.
 * Identique à _fold() dans ics_export.py.
 * - Première tranche : 75 octets max
 * - Tranches suivantes : 1 espace préfixe + 74 octets max de contenu
 * - Ne coupe jamais au milieu d'un caractère multi-octets
 */
function _fold(line) {
    const encoded = _utf8Encode(line);
    if (encoded.length <= 75) return line + '\r\n';

    let result = '';
    let pos = 0;
    let first = true;

    while (pos < encoded.length) {
        const limit = first ? 75 : 74;
        let end = Math.min(pos + limit, encoded.length);
        // Ne pas couper au milieu d'un caractère multi-octets UTF-8
        while (end > pos && (encoded[end - 1] & 0xC0) === 0x80) {
            end--;
        }
        result += _utf8Decode(encoded.slice(pos, end)) + '\r\n';
        pos = end;
        if (pos < encoded.length) {
            result += ' ';
            first = false;
        }
    }
    return result;
}

/**
 * Retourne une propriété ICS pliée : "name:value\r\n" (+ continuation si > 75 octets).
 * Identique à _prop() dans ics_export.py.
 */
function _prop(name, value) {
    return _fold(name + ':' + value);
}

/**
 * UID déterministe et stable : port+type+datetime@appli-maree
 * Identique à _uid() dans ics_export.py.
 */
function _uid(port, typeEvt, dtMs) {
    const portClean = port.replace(/ /g, '_').replace(/,/g, '');
    const dtStr = _ics_dt(dtMs);
    return portClean + '-' + typeEvt + '-' + dtStr + '@appli-maree';
}

/**
 * Arrondi à l'entier le plus proche, identique à round() de Python.
 * Python utilise le "banker's rounding" (arrondi au pair en cas d'égalité à .5),
 * alors que Math.round() de JavaScript arrondit toujours vers le haut à .5.
 * Exemple : _pyRound(200.5) = 200, _pyRound(201.5) = 202.
 */
function _pyRound(x) {
    const fl = Math.floor(x);
    const frac = x - fl;
    if (frac < 0.5) return fl;
    if (frac > 0.5) return fl + 1;
    // Exactement 0.5 : arrondir à l'entier pair (banker's rounding)
    return fl % 2 === 0 ? fl : fl + 1;
}

/**
 * Formate une durée en minutes en "XhYY" (ex. 2h30).
 * Identique à _duree_hhmm() dans ics_export.py.
 */
function _duree_hhmm(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h + 'h' + String(m).padStart(2, '0');
}


// ── Générateur principal ──────────────────────────────────────────────────

/**
 * Génère le contenu d'un fichier .ics RFC 5545.
 * Port fidèle de generer_ics() dans ics_export.py.
 *
 * @param {Array}  globalIntervals  [[startMs, endMs], ...] — créneaux de travail (frLocalMs)
 * @param {Array}  tideEvents       [{dtMs, hauteur, type}, ...] — PM et BM (frLocalMs)
 *                                   type : "PM" ou "BM" (= type_calc dans Python)
 * @param {string} nomPort          ex. 'Brest'
 * @param {number} seuil            hauteur seuil en mètres CM
 * @param {string} choix            'h' ou 'b'
 * @param {number} dateDebutMs      minuit France locale du premier jour (frLocalMs)
 * @param {number} dateFinMs        minuit France locale du dernier jour (frLocalMs)
 *
 * @returns {string} contenu du fichier .ics, lignes terminées par CRLF
 */
function genererIcs(globalIntervals, tideEvents, nomPort, seuil, choix, dateDebutMs, dateFinMs, calname) {
    // Ajout propre à la version mobile, absent de l'appli PC
    if (calname === undefined) calname = 'Plama';
    // DTSTAMP : heure UTC courante, identique à datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    const now = new Date();
    const p2 = n => String(n).padStart(2, '0');
    const nowStr =
        now.getUTCFullYear() +
        p2(now.getUTCMonth() + 1) +
        p2(now.getUTCDate()) +
        'T' +
        p2(now.getUTCHours()) +
        p2(now.getUTCMinutes()) +
        p2(now.getUTCSeconds()) +
        'Z';

    const modeLabel = choix === 'h' ? 'haute' : 'basse';
    const debutDayMs = _dayMs(dateDebutMs);
    const finDayMs   = _dayMs(dateFinMs);

    const lines = [];

    // En-tête calendrier
    lines.push('BEGIN:VCALENDAR\r\n');
    lines.push(_prop('VERSION', '2.0'));
    lines.push(_prop('PRODID', '-//Appli Maree//FR'));
    // Ajout propre à la version mobile, absent de l'appli PC
    lines.push(_prop('X-WR-CALNAME', _escape(calname)));
    lines.push(_prop('X-WR-TIMEZONE', 'Europe/Paris'));
    lines.push(_prop('CALSCALE', 'GREGORIAN'));
    lines.push(_prop('METHOD', 'PUBLISH'));
    lines.push(VTIMEZONE_PARIS);

    // ── Événements de travail ──────────────────────────────────────────────
    for (const [debut, fin] of globalIntervals) {
        // Filtrer les créneaux hors de la période demandée
        // (identique à : fin.date() < date_debut.date() or debut.date() > date_fin.date())
        if (_dayMs(fin) < debutDayMs || _dayMs(debut) > finDayMs) continue;

        const dureeMin = _pyRound((fin - debut) / 60000);
        const desc =
            'D\u00e9but : ' + _hhmm(debut) +
            ' / Fin : '     + _hhmm(fin) +
            ' / Dur\u00e9e : ' + _duree_hhmm(dureeMin);

        // Formatage seuil à la française (virgule décimale, sans zéros inutiles)
        // Identique à : (str(seuil).rstrip('0').rstrip('.') or '0').replace('.', ',')
        // String(2.0) == '2' et String(4.5) == '4.5' en JS, donc pas besoin de strip
        const seuilFr = String(seuil).replace('.', ',');

        lines.push('BEGIN:VEVENT\r\n');
        lines.push(_prop('UID', _uid(nomPort, 'travail', debut)));
        lines.push(_prop('DTSTAMP', nowStr));
        lines.push(_prop('DTSTART;TZID=Europe/Paris', _ics_dt(debut)));
        lines.push(_prop('DTEND;TZID=Europe/Paris', _ics_dt(fin)));
        lines.push(_prop('SUMMARY', _escape(
            nomPort + ' : travail \u00e0 mar\u00e9e ' + modeLabel +
            ' avec un seuil \u00e0 ' + seuilFr + ' m'
        )));
        lines.push(_prop('DESCRIPTION', _escape(desc)));
        lines.push(_prop('CATEGORIES', _escape('Mar\u00e9e ' + modeLabel)));
        lines.push('END:VEVENT\r\n');
    }

    // ── Événements PM/BM ──────────────────────────────────────────────────
    for (const evt of tideEvents) {
        const { dtMs, hauteur, type: typeCalc } = evt;
        // Filtrer sur la période affichée
        // (identique à : dt_evt.date() < date_debut.date() or dt_evt.date() > date_fin.date())
        if (_dayMs(dtMs) < debutDayMs || _dayMs(dtMs) > finDayMs) continue;

        const dtFin = dtMs + 15 * 60000; // +15 minutes, identique à timedelta(minutes=15)
        // Hauteur formatée à la française (virgule décimale), identique à f"{hauteur:.2f}".replace('.', ',')
        const hauteurStr = hauteur.toFixed(2).replace('.', ',');
        const desc = 'Hauteur : ' + hauteurStr + ' m';
        const timeStr = _hhmm(dtMs);

        lines.push('BEGIN:VEVENT\r\n');
        lines.push(_prop('UID', _uid(nomPort, typeCalc, dtMs)));
        lines.push(_prop('DTSTAMP', nowStr));
        lines.push(_prop('DTSTART;TZID=Europe/Paris', _ics_dt(dtMs)));
        lines.push(_prop('DTEND;TZID=Europe/Paris', _ics_dt(dtFin)));
        lines.push(_prop('SUMMARY', _escape(
            typeCalc + ' ' + nomPort + ' ' + timeStr + ' \u2013 ' + hauteurStr + ' m'
        )));
        lines.push(_prop('DESCRIPTION', _escape(desc)));
        lines.push(_prop('CATEGORIES', 'Mar\u00e9e'));
        lines.push('END:VEVENT\r\n');
    }

    lines.push('END:VCALENDAR\r\n');

    return lines.join('');
}


// ── Export conditionnel (Node.js / navigateur) ─────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { genererIcs };
} else if (typeof globalThis !== 'undefined') {
    globalThis.ics = { genererIcs };
}
