/**
 * maree.js — Moteur de prédiction harmonique des marées
 * Port fidèle de app.py / generation.py (projet "Appli marée")
 * Compatible navigateur ET Node.js (export conditionnel en fin de fichier).
 *
 * Convention temporelle :
 *   Tous les paramètres dtMs sont des millisecondes où les champs UTC
 *   correspondent à l'heure locale France (CET/CEST).
 *   Ex. : "2027-01-15 08:30 heure France" → Date.UTC(2027, 0, 15, 8, 30, 0)
 *   Utilisez frLocalMs(annee, mois, jour, heure, min, sec) pour construire ces valeurs.
 */

// ---------------------------------------------------------------------------
// Constantes : fréquences angulaires (°/h) — sert de filtre des constituantes
// Source : SHOM / IHO SP-3 (même table que dans app.py)
// ---------------------------------------------------------------------------
const FREQUENCES_HARMONIQUES = new Set([
  "Z0","SA","SSA","MSM","MM","MSF","MF","ALP1",
  "2Q1","SIGMA1","Q1","RO1","O1","TAU1","NOT1","NOI1","CHI1",
  "PI1","P1","S1","K1","PSI1","PHI1","THE1","J1","SO1","OO1",
  "OQ2","E2","2N2","MU2","N2","NU2","GAM2","GAMMA2","H1","M2","H2",
  "MKS2","LAMBDA2","L2","T2","S2","R2","K2","MSN2","KJ2","2SM2","SKM2",
  "OP2","MNS2","MNUS2","2MK2","M(SK)2","M(KS)2","NKM2","3M2S2",
  "2MN2S2","2NS2","MS1","MP1",
  "2MK3","M3","SO3","MK3","SP3","SK3","MS3","S3",
  "N4","3MS4","MN4","MNU4","2MSK4","M4","SN4","3MN4","NK4","MT4",
  "MS4","MK4","S4","SK4","2SNM4","2MSN4","2MNS4",
  "3MNK6","3MNS6","3MNUS6","4MK6","2NM6","4MS6","2MN6","2MNU6",
  "3MSK6","M6","3MKS6","MSN6","4MN6","MNK6","2MT6","2MS6","2MK6",
  "2SN6","3MSN6","2SM6","MSK6",
  "3MN8","M8","3MS8","4MSN8","2(MS)8",
  "4MN10","M10","3MSN10","4MS10","3M2S10"
]);

// ---------------------------------------------------------------------------
// Table de Doodson : V0 = nc_T·T_sol + nc_s·s + nc_h·h + nc_p·p + nc_p1·p1 + nc_deg
// Source : table2NC décompilée de Routines.java (Java Marée), repris de app.py
// Format : [nc_T, nc_s, nc_h, nc_p, nc_p1, nc_deg]
// ---------------------------------------------------------------------------
const DOODSON = {
  // Longues périodes
  "Z0":      [0,  0,  0,  0,  0,    0],
  "SA":      [0,  0,  1,  0, -1,    0],
  "SSA":     [0,  0,  2,  0,  0,    0],
  "MSM":     [0,  1, -2,  1,  0,    0],
  "MM":      [0,  1,  0, -1,  0,    0],
  "MSF":     [0,  2, -2,  0,  0,    0],
  "MF":      [0,  2,  0,  0,  0,    0],
  // Diurnes
  "2Q1":     [1, -4,  1,  2,  0,   90],
  "SIGMA1":  [1, -4,  3,  0,  0,   90],
  "Q1":      [1, -3,  1,  1,  0,   90],
  "RO1":     [1, -3,  3, -1,  0,   90],
  "O1":      [1, -2,  1,  0,  0,   90],
  "MS1":     [1, -2,  2,  0,  0,  180],
  "MP1":     [1, -2,  3,  0,  0,  -90],
  "M1":      [1, -1,  1,  1,  0,  -90],
  "CHI1":    [1, -1,  3, -1,  0,  -90],
  "KI1":     [1, -1,  3, -1,  0,  -90],
  "NOT1":    [1, -1,  1,  1,  0,  -90],
  "NOI1":    [1, -1,  1,  1,  0,  -90],
  "TAU1":    [1, -2,  3,  0,  0,   90],
  "PI1":     [1,  0, -2,  0,  1,   90],
  "P1":      [1,  0, -1,  0,  0,   90],
  "S1":      [1,  0,  0,  0,  0,    0],
  "K1":      [1,  0,  1,  0,  0,  -90],
  "PSI1":    [1,  0,  2,  0, -1,  -90],
  "PHI1":    [1,  0,  3,  0,  0,  -90],
  "THETA1":  [1,  1, -1,  1,  0,  -90],
  "THE1":    [1,  1, -1,  1,  0,  -90],
  "J1":      [1,  1,  1, -1,  0,  -90],
  "SO1":     [1,  2, -1,  0,  0,  -90],
  "OO1":     [1,  2,  1,  0,  0,  -90],
  "KQ1":     [1,  3,  1, -1,  0,  -90],
  // Semi-diurnes
  "2MN2S2":  [2, -7,  6,  1,  0,    0],
  "2NS2":    [2, -6,  4,  2,  0,    0],
  "3M2S2":   [2, -6,  6,  0,  0,    0],
  "OQ2":     [2, -5,  2,  1,  0,    0],
  "MNS2":    [2, -5,  4,  1,  0,    0],
  "E2":      [2, -5,  4,  1,  0,    0],
  "MNUS2":   [2, -5,  6, -1,  0,    0],
  "2MK2":    [2, -4,  2,  0,  0,    0],
  "2N2":     [2, -4,  2,  2,  0,    0],
  "MU2":     [2, -4,  4,  0,  0,    0],
  "N2":      [2, -3,  2,  1,  0,    0],
  "NU2":     [2, -3,  4, -1,  0,    0],
  "OP2":     [2, -2,  0,  0,  0,    0],
  "GAMMA2":  [2, -2,  0,  2,  0,  180],
  "GAM2":    [2, -2,  0,  2,  0,  180],
  "M(SK)2":  [2, -2,  1,  0,  1,  180],
  "M2":      [2, -2,  2,  0,  0,    0],
  "H1":      [2, -2,  2,  0,  0,    0],
  "H2":      [2, -2,  2,  0,  0,  180],
  "M(KS)2":  [2, -2,  3,  0, -1,    0],
  "MKS2":    [2, -2,  4,  0,  0,    0],
  "LAMBDA2": [2, -1,  0,  1,  0,  180],
  "L2":      [2, -1,  2, -1,  0,  180],
  "NKM2":    [2, -1,  2,  1,  0,    0],
  "T2":      [2,  0, -1,  0,  1,    0],
  "S2":      [2,  0,  0,  0,  0,    0],
  "R2":      [2,  0,  1,  0, -1,  180],
  "K2":      [2,  0,  2,  0,  0,    0],
  "MSN2":    [2,  1,  0, -1,  0,    0],
  "KJ2":     [2,  1,  2, -1,  0,    0],
  "2SM2":    [2,  2, -2,  0,  0,    0],
  "SKM2":    [2,  2,  0,  0,  0,    0],
  // Tertiaires
  "2MK3":    [3, -4,  3,  0,  0,   90],
  "M3":      [3, -3,  3,  0,  0,    0],
  "SO3":     [3, -2,  1,  0,  0,  -90],
  "MS3":     [3, -2,  2,  0,  0,  180],
  "MK3":     [3, -2,  3,  0,  0,  -90],
  "SP3":     [3,  0, -1,  0,  0,    0],
  "S3":      [3,  0,  0,  0,  0,    0],
  "SK3":     [3,  0,  1,  0,  0,   90],
  // Quart-diurnes
  "2MMUS4":  [4, -8,  8,  0,  0,    0],
  "2MNS4":   [4, -7,  6,  1,  0,    0],
  "N4":      [4, -6,  4,  2,  0,    0],
  "3MS4":    [4, -6,  6,  0,  0,    0],
  "MN4":     [4, -5,  4,  1,  0,    0],
  "MNU4":    [4, -5,  6, -1,  0,    0],
  "2MSK4":   [4, -4,  2,  0,  0,    0],
  "M4":      [4, -4,  4,  0,  0,    0],
  "2MKS4":   [4, -4,  6,  0,  0,    0],
  "SN4":     [4, -3,  2,  1,  0,    0],
  "3MN4":    [4, -3,  4, -1,  0,    0],
  "NK4":     [4, -3,  4,  1,  0,    0],
  "MT4":     [4, -2,  1,  0,  1,    0],
  "MS4":     [4, -2,  2,  0,  0,    0],
  "MK4":     [4, -2,  4,  0,  0,    0],
  "2SNM4":   [4, -1,  0,  1,  0,    0],
  "2MSN4":   [4, -1,  2, -1,  0,    0],
  "S4":      [4,  0,  0,  0,  0,    0],
  "SK4":     [4,  0,  2,  0,  0,    0],
  // Sixièmes diurnes
  "3MNK6":   [6, -9,  6,  1,  0,    0],
  "3MNS6":   [6, -9,  8,  1,  0,    0],
  "3MNUS6":  [6, -9, 10, -1,  0,    0],
  "4MK6":    [6, -8,  6,  0,  0,    0],
  "2NM6":    [6, -8,  6,  2,  0,    0],
  "4MS6":    [6, -8,  8,  0,  0,    0],
  "2MN6":    [6, -7,  6,  1,  0,    0],
  "2MNU6":   [6, -7,  8, -1,  0,    0],
  "3MSK6":   [6, -6,  4,  0,  0,    0],
  "M6":      [6, -6,  6,  0,  0,    0],
  "3MKS6":   [6, -6,  8,  0,  0,    0],
  "MSN6":    [6, -5,  4,  1,  0,    0],
  "4MN6":    [6, -5,  6, -1,  0,    0],
  "MNK6":    [6, -5,  6,  1,  0,    0],
  "2MT6":    [6, -4,  3,  0,  1,    0],
  "2MS6":    [6, -4,  4,  0,  0,    0],
  "2MK6":    [6, -4,  6,  0,  0,    0],
  "2SN6":    [6, -3,  2,  1,  0,    0],
  "3MSN6":   [6, -3,  4, -1,  0,    0],
  "3MKN6":   [6, -3,  6, -1,  0,    0],
  "2SM6":    [6, -2,  2,  0,  0,    0],
  "MSK6":    [6, -2,  4,  0,  0,    0],
  "S6":      [6,  0,  0,  0,  0,    0],
  // Huitièmes diurnes
  "2(MN)8":  [8, -10, 8,  2,  0,    0],
  "3MN8":    [8, -9,  8,  1,  0,    0],
  "3MNU8":   [8, -9, 10, -1,  0,    0],
  "M8":      [8, -8,  8,  0,  0,    0],
  "2MSN8":   [8, -7,  6,  1,  0,    0],
  "3MS8":    [8, -6,  6,  0,  0,    0],
  "3MK8":    [8, -6,  8,  0,  0,    0],
  "2MSL8":   [8, -5,  6, -1,  0,    0],
  "2(MS)8":  [8, -4,  4,  0,  0,    0],
  "4MSN8":   [8, -9,  8,  1,  0,    0],
  // Dixièmes diurnes
  "4MN10":   [10, -11, 10,  1,  0,   0],
  "M10":     [10, -10, 10,  0,  0,   0],
  "3MSN10":  [10,  -9,  8,  1,  0,   0],
  "4MS10":   [10,  -8,  8,  0,  0,   0],
  "5MSN10":  [10,  -7,  8, -1,  0,   0],
  "3M2S10":  [10,  -6,  6,  0,  0,   0],
  // Aliases
  "ALP1":    [1, -4,  2,  1,  0,   90],
  "KIO1":    [1, -3,  1,  1,  0,   90],
};

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Modulo toujours positif (équivalent Python : a % b avec b > 0). */
function pymod(a, b) {
  return ((a % b) + b) % b;
}

/**
 * Construit un timestamp "France locale stocké en UTC" depuis les composants
 * de l'heure locale France (CET ou CEST selon la date).
 * Cela correspond à un datetime naïf Python traité comme heure France.
 */
function frLocalMs(annee, mois, jour, heure, min, sec) {
  // mois : 1-12
  return Date.UTC(annee, mois - 1, jour, heure, min, sec);
}

/**
 * Dernier dimanche du mois (annee, mois 1-12) à minuit UTC,
 * retourné en millisecondes.
 * Reprise de dernier_dimanche() dans app.py.
 */
function _dernierDimancheMs(annee, mois) {
  // Dernier jour du mois : Date.UTC(annee, mois, 0) = jour 0 du mois suivant
  const lastDayMs = Date.UTC(annee, mois, 0);
  const d = new Date(lastDayMs);
  // getUTCDay() : 0=dim, 1=lun, ..., 6=sam
  // Python : decalage = (weekday+1)%7 où weekday Mon=0..Sun=6
  // Python weekday = (jsDay + 6) % 7
  // Python decalage = ((jsDay+6)%7 + 1) % 7 = (jsDay+7)%7 = jsDay
  const decalage = d.getUTCDay(); // nombre de jours à retrancher pour atteindre dimanche
  return lastDayMs - decalage * 86400000;
}

/**
 * Décalage UTC en heures pour la France métropolitaine (CET=1, CEST=2).
 * Heure d'été : dernier dim de mars à 1h UTC → dernier dim d'octobre à 1h UTC.
 * Identique à _utc_offset_france() dans app.py.
 *
 * @param {number} dtMs - Heure France locale stockée en "faux UTC"
 */
function _utcOffsetFrance(dtMs) {
  const d = new Date(dtMs);
  const annee = d.getUTCFullYear();
  const debutEteMs = _dernierDimancheMs(annee, 3) + 3600000;  // dernier dim mars 01:00 UTC
  const finEteMs   = _dernierDimancheMs(annee, 10) + 3600000; // dernier dim oct 01:00 UTC
  if (dtMs >= debutEteMs && dtMs < finEteMs) return 2; // CEST
  return 1; // CET
}

/**
 * Calcule le Jour Julien pour un timestamp UTC (true UTC).
 * Identique à _julian_day() dans app.py.
 *
 * @param {number} trueUtcMs - Millisecondes UTC réels
 */
function _julianDay(trueUtcMs) {
  const d = new Date(trueUtcMs);
  const year   = d.getUTCFullYear();
  const month  = d.getUTCMonth() + 1; // 1-12
  const day    = d.getUTCDate();
  const hour   = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const second = d.getUTCSeconds();

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd = day + Math.floor((153 * m + 2) / 5) + 365 * y
           + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  jd += (hour - 12) / 24.0 + minute / 1440.0 + second / 86400.0;
  return jd;
}

/**
 * Calcule les arguments astronomiques pour dtMs (heure locale France).
 * Convertit en UTC avant le calcul. Formules IHO SP-3 / Schureman depuis J2000.0.
 * Identique à calcul_args_astronomiques() dans app.py.
 *
 * @returns {{ T_sol, s, h, p, N, p1 }} en degrés
 */
function _calcArgsAstronomiques(dtMs) {
  const offset = _utcOffsetFrance(dtMs);
  const dtUtcMs = dtMs - offset * 3600000; // conversion heure locale France → UTC

  const T = (_julianDay(dtUtcMs) - 2451545.0) / 36525.0; // siècles depuis J2000.0
  const T2 = T * T;

  const h  = pymod(280.46645    + 36000.76983    * T + 0.0003032  * T2, 360.0);
  const s  = pymod(218.3164591  + 481267.88134236 * T + 0.0013268  * T2, 360.0);
  const p  = pymod(83.353243    + 4069.0137111   * T - 0.0103238  * T2, 360.0);
  const N  = pymod(125.04452    - 1934.136261    * T + 0.0020708  * T2, 360.0);
  const p1 = pymod(282.9374     +    1.7196      * T,                   360.0);

  const dUtc = new Date(dtUtcMs);
  const T_sol = pymod(
    180.0 + (dUtc.getUTCHours() + dUtc.getUTCMinutes() / 60.0 + dUtc.getUTCSeconds() / 3600.0) * 15.0,
    360.0
  );

  return { T_sol, s, h, p, N, p1 };
}

/**
 * Calcule l'argument d'équilibre V0 (°) pour la constituante nom à dtMs.
 * Identique à calcul_argument_equilibre() dans app.py.
 */
function _calcArgumentEquilibre(nom, dtMs) {
  const coef = DOODSON[nom];
  if (coef === undefined) return 0.0;

  const { T_sol, s, h, p, N, p1 } = _calcArgsAstronomiques(dtMs);
  const [nc_t, nc_s, nc_h, nc_p, nc_p1, nc_deg] = coef;
  const v0 = nc_t * T_sol + nc_s * s + nc_h * h + nc_p * p + nc_p1 * p1 + nc_deg;
  return pymod(v0, 360.0);
}

/**
 * Retourne [f, u_deg] : facteur d'amplitude et correction de phase nodales.
 * Formules copiées exactement du code Java décompilé (Routines.java), via app.py.
 * Ordre des conditions identique à facteurs_nodaux() dans app.py.
 */
function _facteursNodaux(N_deg, p_deg, nom) {
  const N_r = N_deg * Math.PI / 180;
  // p_r utilisé pour MM/MSM et formules spéciales
  const p_r = p_deg * Math.PI / 180;

  const fM2 = () => 1.0007 - 0.0373 * Math.cos(N_r) + 0.0002 * Math.cos(2 * N_r);
  const uM2 = () => -2.14 * Math.sin(N_r);
  const fK1 = () => 1.006  + 0.115  * Math.cos(N_r) - 0.0088 * Math.cos(2 * N_r) + 0.0006 * Math.cos(3 * N_r);
  const uK1 = () => -8.86  * Math.sin(N_r) + 0.68 * Math.sin(2 * N_r) - 0.07 * Math.sin(3 * N_r);
  const fO1 = () => 1.0176 + 0.1871 * Math.cos(N_r) - 0.0147 * Math.cos(2 * N_r);
  const uO1 = () => 10.8   * Math.sin(N_r) - 1.34 * Math.sin(2 * N_r) + 0.19 * Math.sin(3 * N_r);
  const fK2 = () => 1.0246 + 0.2863 * Math.cos(N_r) + 0.0083 * Math.cos(2 * N_r) - 0.0015 * Math.cos(3 * N_r);
  const uK2 = () => -17.74 * Math.sin(N_r) + 0.68 * Math.sin(2 * N_r) - 0.04 * Math.sin(3 * N_r);
  const fJ1 = () => 1.1029 + 0.1676 * Math.cos(N_r) - 0.017  * Math.cos(2 * N_r) + 0.0016 * Math.cos(3 * N_r);
  const uJ1 = () => -12.94 * Math.sin(N_r) + 1.34 * Math.sin(2 * N_r) - 0.19 * Math.sin(3 * N_r);

  // 1. Solaires purs → pas de correction nodale
  if (["S1","S2","S4","S6","S8","T2","R2","P1","SA","SSA","Z0",
       "PI1","PSI1","PHI1","SP3"].includes(nom)) {
    return [1.0, 0.0];
  }

  // 2. M2 et assimilés (fM2, uM2) — inclut MSF (dead code plus bas neutralisé)
  if (["M2","N2","2N2","MU2","NU2","E2","H1","H2",
       "2NS2","SN4","2SN6","2SM2","2SM6","MS3",
       "MSF","MNUS2","MNS2","3M2S2","2MN2S2","MS1","MP1",
       "MT4","2MT6","LAMBDA2","MS4","2MNS4"].includes(nom)) {
    return [fM2(), uM2()];
  }

  // 3. OP2 = fM2·fK2, uM2 − uK2
  if (nom === "OP2") return [fM2() * fK2(), uM2() - uK2()];

  // 4. GAMMA2 : formule spéciale f(2*(N−p))
  if (nom === "GAMMA2" || nom === "GAM2") {
    const ang   = (2.0 * (N_deg - p_deg)) * Math.PI / 180;
    const s_val = 0.147 * Math.sin(ang);
    const c_val = 1.0 + 0.147 * Math.cos(ang);
    return [Math.sqrt(s_val * s_val + c_val * c_val),
            Math.atan2(s_val, c_val) * 180 / Math.PI];
  }

  // 5. L2 : formule spéciale f(N, p)
  if (nom === "L2") {
    const sin_2p   = Math.sin(2 * p_deg * Math.PI / 180);
    const cos_2p   = Math.cos(2 * p_deg * Math.PI / 180);
    const sin_2pN  = Math.sin((2 * p_deg - N_deg) * Math.PI / 180);
    const cos_2pN  = Math.cos((2 * p_deg - N_deg) * Math.PI / 180);
    const sin_2p2N = Math.sin((2 * p_deg - 2 * N_deg) * Math.PI / 180);
    const cos_2p2N = Math.cos((2 * p_deg - 2 * N_deg) * Math.PI / 180);
    const sinN     = Math.sin(N_r);
    const cosN     = Math.cos(N_r);
    const num = -0.2505 * sin_2p - 0.1102 * sin_2pN - 0.0156 * sin_2p2N - 0.037 * sinN;
    const den =  1.0    - 0.2505 * cos_2p - 0.1102 * cos_2pN - 0.0156 * cos_2p2N - 0.037 * cosN;
    return [Math.sqrt(num * num + den * den), Math.atan2(num, den) * 180 / Math.PI];
  }

  // 6. OQ2 : formule spéciale (commentaire "E2" dans app.py, mais condition sur OQ2)
  if (nom === "OQ2") {
    const num = -0.439 * Math.sin(N_r);
    const den =  1.0   + 0.439 * Math.cos(N_r);
    return [Math.sqrt(num * num + den * den), Math.atan2(num, den) * 180 / Math.PI];
  }

  // 7. NKM2 = f2M2·fK2, u2M2+uK2
  if (nom === "NKM2") return [fM2() * fM2() * fK2(), 2 * uM2() + uK2()];

  // 8. MKS2, M(KS)2 = fM2·fK2, uM2+uK2
  if (nom === "MKS2" || nom === "M(KS)2") return [fM2() * fK2(), uM2() + uK2()];

  // 9. 2MK2 = f2M2·fK2, u2M2−uK2
  if (nom === "2MK2") return [fM2() * fM2() * fK2(), 2 * uM2() - uK2()];

  // 10. MSN2 = f2M2, u=0
  if (nom === "MSN2") return [fM2() * fM2(), 0.0];

  // 11. SKM2 = fM2·fK2, uK2−uM2
  if (nom === "SKM2") return [fM2() * fK2(), uK2() - uM2()];

  // 12. M(SK)2 = fM2·fK1, uM2−uK1
  if (nom === "M(SK)2") return [fM2() * fK1(), uM2() - uK1()];

  // 13. K1, SK3
  if (nom === "K1" || nom === "SK3") return [fK1(), uK1()];

  // 14. O1 et diurnes lunaires (fO1, uO1)
  if (["O1","Q1","2Q1","SIGMA1","RO1","TAU1","NOT1","NOI1","SO3","SO1"].includes(nom)) {
    return [fO1(), uO1()];
  }

  // 15. K2, SK4
  if (nom === "K2" || nom === "SK4") return [fK2(), uK2()];

  // 16. J1 groupe (fJ1, uJ1)
  if (["J1","CHI1","KI1","PHI1","THETA1"].includes(nom)) return [fJ1(), uJ1()];

  // 17. OO1, KQ1 = fK2·fO1, uK2−uO1
  if (nom === "OO1" || nom === "KQ1") return [fK2() * fO1(), uK2() - uO1()];

  // 18. M1 : formule spéciale f(N, p)
  if (nom === "M1") {
    const sin_p  = Math.sin(p_r);
    const cos_p  = Math.cos(p_r);
    const sin_pN = Math.sin(p_r - N_r);
    const cos_pN = Math.cos(p_r - N_r);
    const sin_c = sin_p + 0.2 * sin_pN;
    const cos_c = 2.0 * (cos_p + 0.2 * cos_pN);
    return [Math.sqrt(sin_c * sin_c + cos_c * cos_c), Math.atan2(sin_c, cos_c) * 180 / Math.PI];
  }

  // 19. MF (fMf, uMf)
  if (nom === "MF") {
    const f = 1.084 + 0.415 * Math.cos(N_r) + 0.039 * Math.cos(2 * N_r);
    const u = -23.7 * Math.sin(N_r) + 2.7 * Math.sin(2 * N_r) - 0.4 * Math.sin(3 * N_r);
    return [f, u];
  }

  // 20. MSF = fM2, −uM2 — code mort dans app.py (MSF déjà traité en étape 2)
  // if (nom === "MSF") return [fM2(), -uM2()];

  // 21. MM, MSM (fMm, u=0)
  if (nom === "MM" || nom === "MSM") {
    const f = (1.0 - 0.1311 * Math.cos(N_r)
                   + 0.0538 * Math.cos(2 * p_deg * Math.PI / 180)
                   + 0.0205 * Math.cos((2 * p_deg - N_deg) * Math.PI / 180));
    return [f, 0.0];
  }

  // 22. KJ2 = fK1·fJ1, uK1+uJ1
  if (nom === "KJ2") return [fK1() * fJ1(), uK1() + uJ1()];

  // 23. Quart-diurnes M2² : M4, MN4, 3MS4, MNU4, 2MSK4, N4, 3MN4, NK4
  if (["M4","MN4","3MS4","MNU4","2MSK4","N4","3MN4","NK4"].includes(nom)) {
    return [fM2() * fM2(), 2 * uM2()];
  }

  // 24. MK4 = fM2·fK2, uM2+uK2
  if (nom === "MK4") return [fM2() * fK2(), uM2() + uK2()];

  // 25. 2MSN4 = fM2³, uM2
  if (nom === "2MSN4") return [fM2() * fM2() * fM2(), uM2()];

  // 26. Sixièmes diurnes fM2³ (inclut 3MNS6 — prime sur le groupe M8 ci-dessous)
  if (["M6","2MN6","2MNU6","4MS6","2NM6","3MNS6","3MNUS6",
       "MSN6","2MT6","2MS6","3MSN6","2SM6"].includes(nom)) {
    return [fM2() * fM2() * fM2(), 3 * uM2()];
  }

  // 27. 3MSK6, 2MK6, MNK6, MSK6 = fM2³·fK2, 3uM2+uK2
  if (["3MSK6","2MK6","MNK6","MSK6"].includes(nom)) {
    return [fM2() * fM2() * fM2() * fK2(), 3 * uM2() + uK2()];
  }

  // 28. 3MKS6, 3MNK6 = fM2³·fK2, 3uM2−uK2
  if (nom === "3MKS6" || nom === "3MNK6") {
    return [fM2() * fM2() * fM2() * fK2(), 3 * uM2() - uK2()];
  }

  // 29. 4MN6 = fM2⁵, 5uM2
  if (nom === "4MN6") return [fM2() * fM2() * fM2() * fM2() * fM2(), 5 * uM2()];

  // 30. 4MK6 = fM2⁴·fK2, 4uM2−uK2
  if (nom === "4MK6") return [fM2() * fM2() * fM2() * fM2() * fK2(), 4 * uM2() - uK2()];

  // 31. Huitièmes diurnes fM2⁴ (3MNS6 déjà géré, donc ne figure pas ici malgré Python)
  if (["M8","3MN8","3MNU8","3MNS6","2(MN)8"].includes(nom)) {
    return [fM2() * fM2() * fM2() * fM2(), 4 * uM2()];
  }

  // 32. 3MS8, 2MSN8, 2(MS)8 = fM2³, 3uM2
  if (["3MS8","2MSN8","2(MS)8"].includes(nom)) {
    return [fM2() * fM2() * fM2(), 3 * uM2()];
  }

  // 33. 3MK8, 3MKN6 = fM2³·fK2, 3uM2+uK2
  if (nom === "3MK8" || nom === "3MKN6") {
    return [fM2() * fM2() * fM2() * fK2(), 3 * uM2() + uK2()];
  }

  // 34. Dixièmes diurnes fM2⁵
  if (["M10","4MN10","5MSN10","2MSL8"].includes(nom)) {
    return [fM2() * fM2() * fM2() * fM2() * fM2(), 5 * uM2()];
  }

  // 35. 3MSN10, 4MS10, 3M2S10 = fM2⁴, 4uM2
  if (["3MSN10","4MS10","3M2S10"].includes(nom)) {
    return [fM2() * fM2() * fM2() * fM2(), 4 * uM2()];
  }

  // Par défaut : pas de correction nodale
  return [1.0, 0.0];
}

// ---------------------------------------------------------------------------
// Calcul de la hauteur harmonique
// ---------------------------------------------------------------------------

/**
 * Calcule la hauteur de marée (m CM) à l'instant dtMs par superposition harmonique.
 * h(t) = Z0 + Σ fi · Ai · cos(V0i(t) + ui − κi)
 * Identique à hauteur_harmonique() dans app.py.
 *
 * @param {number} dtMs        - Heure France locale (frLocalMs)
 * @param {number} z0          - Niveau moyen (m CM)
 * @param {Array}  constituantes - [{nom, amplitude, phase}] (phase = κ en degrés)
 * @returns {number} Hauteur en mètres CM
 */
function hauteurHarmonique(dtMs, z0, constituantes) {
  const args = _calcArgsAstronomiques(dtMs);
  const N_deg = args.N;
  const p_deg = args.p;
  let h = z0;
  for (const c of constituantes) {
    const nom = c.nom;
    if (!FREQUENCES_HARMONIQUES.has(nom)) continue;
    const [f, u_deg] = _facteursNodaux(N_deg, p_deg, nom);
    const v0 = _calcArgumentEquilibre(nom, dtMs);
    const angle_deg = v0 + u_deg - c.phase; // c.phase = κ (déphasage de Greenwich)
    h += f * c.amplitude * Math.cos(angle_deg * Math.PI / 180.0);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Utilitaire de division arrondie (imite timedelta Python)
// ---------------------------------------------------------------------------

/**
 * Divise l'entier a par l'entier b, arrondi au plus proche pair en cas d'égalité
 * (banker's rounding). Identique à _divide_and_round(a, b) dans CPython/Lib/datetime.py,
 * qui est appelée par timedelta.__truediv__(int) — donc par (t1-t0)/2 et (hi-lo)/3.
 *
 * Python :
 *   def _divide_and_round(a, b):
 *       q, r = divmod(a, b)
 *       r *= 2
 *       greater_than_half = r > b if b > 0 else r < b
 *       if greater_than_half or r == b and q % 2 == 1:
 *           q += 1
 *       return q
 */
function _divideAndRound(a, b) {
  const q = Math.floor(a / b);          // Python: q, r = divmod(a, b)  →  q
  const r = a - q * b;                  // Python: q, r = divmod(a, b)  →  r
  const r2 = r * 2;                     // Python: r *= 2
  // Python: greater_than_half = r > b if b > 0 else r < b
  const greaterThanHalf = (b > 0) ? (r2 > b) : (r2 < b);
  // Python: if greater_than_half or r == b and q % 2 == 1: q += 1
  if (greaterThanHalf || (r2 === b && q % 2 !== 0)) return q + 1;
  return q;
}

// ---------------------------------------------------------------------------
// Détection des PM / BM
// ---------------------------------------------------------------------------

/**
 * Affine la position d'un extremum par recherche ternaire dans
 * [tCentreMs − fenetreMin, tCentreMs + fenetreMin].
 * 40 itérations. Instants représentés en microsecondes entières pour imiter
 * datetime Python (précision 1 µs). Identique à _affiner_extremum() dans app.py.
 *
 * Python :
 *   def _affiner_extremum(z0, constituantes, t_centre, fenetre_min, recherche_max=True):
 *       lo = t_centre - timedelta(minutes=fenetre_min)
 *       hi = t_centre + timedelta(minutes=fenetre_min)
 *       for _ in range(40):
 *           m1 = lo + (hi - lo) / 3
 *           m2 = hi - (hi - lo) / 3
 *           h1 = hauteur_harmonique(m1, z0, constituantes)
 *           h2 = hauteur_harmonique(m2, z0, constituantes)
 *           if recherche_max:
 *               if h1 < h2: lo = m1
 *               else: hi = m2
 *           else:
 *               if h1 > h2: lo = m1
 *               else: hi = m2
 *       return lo + (hi - lo) / 2
 */
function _affinerExtremum(z0, constituantes, tCentreMs, fenetreMin, rechercheMax) {
  // lo = t_centre - timedelta(minutes=fenetre_min)   [converti ms → µs]
  let lo = tCentreMs * 1000 - fenetreMin * 60 * 1000000;
  // hi = t_centre + timedelta(minutes=fenetre_min)
  let hi = tCentreMs * 1000 + fenetreMin * 60 * 1000000;

  // for _ in range(40):
  for (let i = 0; i < 40; i++) {
    const diff = hi - lo;
    // (hi - lo) / 3  →  timedelta divisé par 3, arrondi pair à la µs
    const oneThird = _divideAndRound(diff, 3);
    // m1 = lo + (hi - lo) / 3
    const m1 = lo + oneThird;
    // m2 = hi - (hi - lo) / 3
    const m2 = hi - oneThird;

    // hauteur_harmonique ignore les µs (utilise .hour/.minute/.second)
    // → Math.floor(us/1000) tronque µs → ms ; getUTCSeconds() ignore les ms
    // h1 = hauteur_harmonique(m1, z0, constituantes)
    const h1 = hauteurHarmonique(Math.floor(m1 / 1000), z0, constituantes);
    // h2 = hauteur_harmonique(m2, z0, constituantes)
    const h2 = hauteurHarmonique(Math.floor(m2 / 1000), z0, constituantes);

    if (rechercheMax) {
      if (h1 < h2) lo = m1; // if h1 < h2: lo = m1
      else         hi = m2; // else: hi = m2
    } else {
      if (h1 > h2) lo = m1; // if h1 > h2: lo = m1
      else         hi = m2; // else: hi = m2
    }
  }

  // return lo + (hi - lo) / 2
  return Math.floor((lo + _divideAndRound(hi - lo, 2)) / 1000); // µs → ms
}

/**
 * Détecte les PM et BM à partir d'une liste de [dtMs, hauteur].
 * Affine chaque extremum par recherche ternaire.
 * Élimine les doublons < 1h.
 * Identique à detecter_pm_bm() dans app.py.
 *
 * @param {number} z0
 * @param {Array}  constituantes
 * @param {Array}  points - [[dtMs, hauteur], ...] triés chronologiquement
 * @returns {Array} [{dtMs, hauteur, type}] — type : "PM" ou "BM"
 */
function detecterPmBm(z0, constituantes, points) {
  if (points.length < 2) return [];

  // Pas de la grille en minutes
  const fenetreMin = (points[1][0] - points[0][0]) / 60000;

  const events = [];
  for (let i = 1; i < points.length - 1; i++) {
    const [tPrev, hPrev] = points[i - 1];
    const [tCurr, hCurr] = points[i];
    const [tNext, hNext] = points[i + 1];

    if (hCurr > hPrev && hCurr >= hNext) {
      const tFine = _affinerExtremum(z0, constituantes, tCurr, fenetreMin, true);
      const hFine = hauteurHarmonique(tFine, z0, constituantes);
      events.push({ dtMs: tFine, hauteur: hFine, type: "PM" });
    } else if (hCurr < hPrev && hCurr <= hNext) {
      const tFine = _affinerExtremum(z0, constituantes, tCurr, fenetreMin, false);
      const hFine = hauteurHarmonique(tFine, z0, constituantes);
      events.push({ dtMs: tFine, hauteur: hFine, type: "BM" });
    }
  }

  if (events.length === 0) return [];

  // Tri chronologique
  events.sort((a, b) => a.dtMs - b.dtMs);

  // Élimination des doublons < 1h
  const result = [events[0]];
  for (let i = 1; i < events.length; i++) {
    const diff = (events[i].dtMs - result[result.length - 1].dtMs) / 3600000;
    if (diff >= 1.0) result.push(events[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Franchissement de seuil
// ---------------------------------------------------------------------------

/**
 * Trouve par dichotomie l'instant exact où hauteur_harmonique franchit seuil
 * entre t0Ms et t1Ms (l'un sous, l'autre au-dessus).
 * 40 itérations. Instants représentés en microsecondes entières pour imiter
 * datetime Python (précision 1 µs). Identique à _affiner_franchissement() dans app.py.
 *
 * Python :
 *   def _affiner_franchissement(z0, constituantes, t0, t1, seuil):
 *       h1 = hauteur_harmonique(t1, z0, constituantes)
 *       for _ in range(40):
 *           tm = t0 + (t1 - t0) / 2
 *           hm = hauteur_harmonique(tm, z0, constituantes)
 *           if (hm >= seuil) == (h1 >= seuil):
 *               t1 = tm
 *               h1 = hm
 *           else:
 *               t0 = tm
 *       return t0 + (t1 - t0) / 2
 */
function affinerFranchissement(z0, constituantes, t0Ms, t1Ms, seuil) {
  // Conversion ms → µs : imite datetime Python (précision microseconde)
  let t0 = t0Ms * 1000; // ms → µs
  let t1 = t1Ms * 1000; // ms → µs

  // h1 = hauteur_harmonique(t1, z0, constituantes)
  // Python ignore dt.microsecond → Math.floor(us/1000) tronque µs→ms,
  // puis getUTCSeconds() ignore les ms : même troncature qu'en Python.
  let h1 = hauteurHarmonique(Math.floor(t1 / 1000), z0, constituantes);

  // for _ in range(40):
  for (let i = 0; i < 40; i++) {
    // tm = t0 + (t1 - t0) / 2
    // Python: (t1-t0) est un timedelta ; / 2 appelle _divide_and_round(us, 2)
    const tm = t0 + _divideAndRound(t1 - t0, 2);

    // hm = hauteur_harmonique(tm, z0, constituantes)
    const hm = hauteurHarmonique(Math.floor(tm / 1000), z0, constituantes);

    // if (hm >= seuil) == (h1 >= seuil):
    if ((hm >= seuil) === (h1 >= seuil)) {
      t1 = tm; h1 = hm; // t1 = tm ; h1 = hm
    } else {
      t0 = tm;           // t0 = tm
    }
  }

  // return t0 + (t1 - t0) / 2
  return Math.floor((t0 + _divideAndRound(t1 - t0, 2)) / 1000); // µs → ms
}

// ---------------------------------------------------------------------------
// Calcul des créneaux de travail (global_intervals)
// ---------------------------------------------------------------------------

/**
 * Calcule les créneaux de travail sur la période [debutMs, finMs].
 * Logique identique à la section "Détection des plages de travail" dans generation.py.
 *
 * Grille 2h de (debut − 1 jour) à (fin + 2 jours) minuit, exclusive de la fin.
 * Franchissements de seuil affinés par dichotomie.
 *
 * @param {number} z0
 * @param {Array}  constituantes
 * @param {number} debutMs  - Minuit France locale du premier jour de la période
 * @param {number} finMs    - Minuit France locale du dernier jour de la période
 * @param {number} seuil    - Seuil en mètres CM
 * @param {string} mode     - 'h' (marée haute ≥ seuil) ou 'b' (marée basse ≤ seuil)
 * @returns {Array} [[startMs, endMs], ...] — créneaux continus (France locale ms)
 */
function calculerCreneaux(z0, constituantes, debutMs, finMs, seuil, mode) {
  const MS_DAY = 86400000;
  const MS_2H  = 2 * 3600000;

  // compute_debut = date_debut - 1 jour, grid_end = date_fin + 2 jours
  const gridStart = debutMs - MS_DAY;
  const gridEnd   = finMs   + 2 * MS_DAY;

  // Construction de la grille 2h (inclusive début, exclusive fin)
  const points = [];
  for (let t = gridStart; t < gridEnd; t += MS_2H) {
    points.push([t, hauteurHarmonique(t, z0, constituantes)]);
  }

  function isWorking(h) {
    return mode === 'h' ? h >= seuil : h <= seuil;
  }

  const intervals = [];
  let active   = false;
  let startVal = null;

  if (points.length > 0 && isWorking(points[0][1])) {
    active   = true;
    startVal = points[0][0];
  }

  for (let i = 0; i < points.length - 1; i++) {
    const [t0, h0] = points[i];
    const [t1, h1] = points[i + 1];
    const w0 = isWorking(h0);
    const w1 = isWorking(h1);

    if (w0 === w1) continue;

    const tCross = affinerFranchissement(z0, constituantes, t0, t1, seuil);

    if (!w0 && w1) {
      active   = true;
      startVal = tCross;
    } else if (w0 && !w1 && active && startVal !== null) {
      if (tCross > startVal) {
        intervals.push([startVal, tCross]);
      }
      active   = false;
      startVal = null;
    }
  }

  if (active && startVal !== null) {
    intervals.push([startVal, gridEnd]);
  }

  return intervals;
}

// ---------------------------------------------------------------------------
// Export conditionnel (Node.js / navigateur)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    frLocalMs,
    hauteurHarmonique,
    detecterPmBm,
    affinerFranchissement,
    calculerCreneaux,
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.maree = {
    frLocalMs,
    hauteurHarmonique,
    detecterPmBm,
    affinerFranchissement,
    calculerCreneaux,
  };
}
