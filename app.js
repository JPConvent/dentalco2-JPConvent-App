// --- Emissionsfaktoren (DE-Defaults) ---
// Quellen: UBA/IPCC/DEFRA-nah (rund, praxistauglich)
const FACTORS = {
  scope1: {
    km_diesel: 0.170,   // kg/km
    km_benzin: 0.155,   // kg/km
    km_h2: 0.080,       // kg/km (konservativer Mix)
    ev_kwh_per_km: 0.20 // kWh/km (mit Stromfaktor verrechnet)
    // Heizung: aktuell keine kWh/Jahr-Eingabe -> 0
  },
  scope2: {
    strom_DE: 0.36,     // kg/kWh
    oekostrom: 0.05     // kg/kWh (Restemissionen/Vorkette)
  },
  scope3: {
    bahn_km: 0.035,     // kg/km
    papier_blatt: 0.006,// kg/Blatt DIN A4
    cloud_per_GB: 0.06, // kg/GB Transfer/Compute (vereinfachter Mix)
    service_km: 0.170   // kg/km (Diesel)
  },
  komp: {
    baum_per_year: 12.5, // kg CO2 pro Baum/Jahr
    co2_density: 1.964,  // kg/m³
    football_area_m2: 7140, // m² (105 x 68)
    tv_height_m: 368
  }
};

// Helfer: Feldwert als Zahl holen
function num(name) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}

// Stromfaktor dynamisch nach Ökostrom-Anteil
function stromFaktor() {
  const ecoPct = Math.min(Math.max(num("oekostrom"), 0), 100) / 100;
  const f = (1 - ecoPct) * FACTORS.scope2.strom_DE + ecoPct * FACTORS.scope2.oekostrom;
  return f; // kg/kWh
}

// --- Scope 1: Fahrzeuge (nach Antriebsanteilen) ---
function calcScope1() {
  const kmTotal = num("kfz_km_gesamt");
  const nDiesel = num("kfz_diesel");
  const nBenzin = num("kfz_benzin");
  const nEV = num("kfz_strom");
  const nH2 = num("kfz_h2");
  const nSum = Math.max(nDiesel + nBenzin + nEV + nH2, 0);

  let s1 = 0;
  if (kmTotal > 0 && nSum > 0) {
    const shareDiesel = nDiesel / nSum;
    const shareBenzin = nBenzin / nSum;
    const shareEV = nEV / nSum;
    const shareH2 = nH2 / nSum;

    const kmDiesel = kmTotal * shareDiesel;
    const kmBenzin = kmTotal * shareBenzin;
    const kmEV = kmTotal * shareEV;
    const kmH2 = kmTotal * shareH2;

    s1 += kmDiesel * FACTORS.scope1.km_diesel;
    s1 += kmBenzin * FACTORS.scope1.km_benzin;
    s1 += kmH2 * FACTORS.scope1.km_h2;
    // EV: Stromverbrauch = km * 0.20 kWh/km * Stromfaktor
    s1 += kmEV * FACTORS.scope1.ev_kwh_per_km * stromFaktor();
  }

  // Heizung: aktuell keine kWh/Jahr vorhanden -> 0
  // (Wenn Fläche & heizwaermebedarf & Wirkungsgrad vorhanden, ergänze hier.)
  return s1; // kg
}

// --- Scope 2: Strom (inkl. Kälte) ---
function calcScope2() {
  const kWh = num("strom_jahr");
  const kaelte = num("kaelte");
  const f = stromFaktor();
  return (kWh + kaelte) * f; // kg
}

// --- Scope 3: Cloud/Service, Pendeln, Papier etc. ---
function calcScope3() {
  let s3 = 0;

  // Servicefahrten (tatsächliche Wartungen - gesparte Anfahrten)
  const wartIst = num("wartung_ist");
  const anfahrtGespart = num("anfahrten_gespart");
  const kmHz = num("service_km_hz");
  const nettoFahrten = Math.max(wartIst - anfahrtGespart, 0);
  s3 += nettoFahrten * kmHz * FACTORS.scope3.service_km;

  // Cloud-Service
  const cloud = document.querySelector('[name="cloud_genutzt"]')?.value || "Nein";
  if (cloud.startsWith("Ja")) {
    if (cloud.includes("volumenbasiert")) {
      const gbMonat = num("cloud_gb");
      const gbJahr = gbMonat * 12;
      s3 += gbJahr * FACTORS.scope3.cloud_per_GB;
    } else {
      // pauschal – konservativer Richtwert
      s3 += 5; // kg/Jahr
    }
  } else {
    // Kein Cloudservice: keine Zusatz-Cloud-Emissionen (Servicefahrten sind bereits berücksichtigt)
  }

  // Pendeln
  s3 += num("pendel_kfz") * FACTORS.scope1.km_diesel; // konservativ Pkw
  // E-Mobility Pendeln (über Stromfaktor)
  s3 += num("pendel_emob") * FACTORS.scope1.ev_kwh_per_km * stromFaktor();
  // Motorrad – näherungsweise wie Benzin-Pkw (konservativ)
  s3 += num("pendel_motorrad") * FACTORS.scope1.km_benzin;
  // Öffentlich (Bahn/ÖPNV konservativ)
  s3 += num("pendel_oev") * FACTORS.scope3.bahn_km;
  // Fahrrad/E-Bike = 0

  // Papier
  s3 += num("druck_blatt") * FACTORS.scope3.papier_blatt;

  return s3; // kg
}

// --- Ergebnis + Visualisierung ---
function calcAndShow() {
  const s1 = calcScope1();
  const s2 = calcScope2();
  const s3 = calcScope3();
  const total = s1 + s2 + s3;

  // Bäume
  const trees = total / FACTORS.komp.baum_per_year;

  // Volumen & „Säule über Fußballfeld“
  const vol_m3 = total / FACTORS.komp.co2_density; // m³
  const height_m = FACTORS.komp.football_area_m2 > 0
    ? vol_m3 / FACTORS.komp.football_area_m2
    : 0;
  const tvPct = FACTORS.komp.tv_height_m > 0
    ? (height_m / FACTORS.komp.tv_height_m) * 100
    : 0;

  // Ausgabe
  document.getElementById("outScope1").textContent = s1.toFixed(0);
  document.getElementById("outScope2").textContent = s2.toFixed(0);
  document.getElementById("outScope3").textContent = s3.toFixed(0);
  document.getElementById("outTotal").textContent = total.toFixed(0);
  document.getElementById("outTrees").textContent = Math.ceil(trees).toString();
  document.getElementById("outVolume").textContent = vol_m3.toFixed(0);
  document.getElementById("outHeight").textContent = height_m.toFixed(2);
  document.getElementById("outTVPct").textContent = Math.min(tvPct, 999).toFixed(1);

  document.getElementById("resultCard").style.display = "block";
}

// Button-Handler
document.getElementById("calcBtn")?.addEventListener("click", calcAndShow);
console.log("Berechnungsversion (DE-Defaults) geladen.");


