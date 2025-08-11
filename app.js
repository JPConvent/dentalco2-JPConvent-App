// ===============================
// JPConvent – Dental-CO₂ Klimabilanz
// app.js – Berechnung + PDF (Legende + Visualisierung + Balkendiagramm)
// ===============================

// ---- Titelteile (CO₂ wird gezeichnet mit echter Tiefstellung) ----
const TITLE_P1 = "Dental-CO";
const TITLE_P2 = " Klimabilanz";
const WM_P1 = "Dental CO";
const WM_P2 = " – Klimabilanz";

// ---- Emissionsfaktoren (vereinfachte Defaults / DE) ----
const FACTORS = {
  scope1: { km_diesel: 0.170, km_benzin: 0.155, km_h2: 0.080, ev_kwh_per_km: 0.20 },
  scope2: { strom_DE: 0.36, oekostrom: 0.05 },
  scope3: { bahn_km: 0.035, papier_blatt: 0.006, cloud_per_GB: 0.06, service_km: 0.170 },
  komp:   { baum_per_year: 12.5, co2_density: 1.964, football_area_m2: 7140, tv_height_m: 368 }
};

// ---- Helpers ----
const $ = s => document.querySelector(s);
const num = name => { const el = $(`[name="${name}"]`); const v = parseFloat(el?.value); return isNaN(v) ? 0 : v; };

// Ökostrom-Mix
function stromFaktor(){
  const ecoPct = Math.min(Math.max(num("oekostrom"), 0), 100) / 100;
  return (1 - ecoPct) * FACTORS.scope2.strom_DE + ecoPct * FACTORS.scope2.oekostrom;
}

// Subheadline (Name oben)
function updateEntityName(){
  const label = $('[name="labelname"]')?.value?.trim();
  const praxis = $('[name="praxis"]')?.value?.trim();
  const unternehmen = $('[name="unternehmen"]')?.value?.trim();
  $('#entityName').textContent = label || praxis || unternehmen || "—";
}
["labelname","praxis","unternehmen"].forEach(n => $(`[name="${n}"]`)?.addEventListener("input", updateEntityName));
updateEntityName();

// Audit-Datum
function auditDate(){
  const r = $('[name="revalidierung"]')?.value?.trim();
  const e = $('[name="erstvalidierung"]')?.value?.trim();
  return r || e || "";
}

// ---- Berechnungen ----
function calcScope1(){
  const kmTotal = num("kfz_km_gesamt");
  const nDiesel = num("kfz_diesel"), nBenzin = num("kfz_benzin"), nEV = num("kfz_strom"), nH2 = num("kfz_h2");
  const nSum = Math.max(nDiesel + nBenzin + nEV + nH2, 0);
  let s1 = 0;
  if (kmTotal > 0 && nSum > 0) {
    const share = n => n / nSum;
    s1 += (kmTotal * share(nDiesel)) * FACTORS.scope1.km_diesel;
    s1 += (kmTotal * share(nBenzin)) * FACTORS.scope1.km_benzin;
    s1 += (kmTotal * share(nH2))     * FACTORS.scope1.km_h2;
    s1 += (kmTotal * share(nEV))     * FACTORS.scope1.ev_kwh_per_km * stromFaktor();
  }
  return s1;
}

function calcScope2(){
  const kWh = num("strom_jahr");
  const kaelte = num("kaelte");
  return (kWh + kaelte) * stromFaktor();
}

function calcScope3(){
  let s3 = 0;

  // Servicefahrten (nach Bündelung)
  const fahrten = Math.max(num("wartung_ist") - num("anfahrten_gespart"), 0);
  s3 += fahrten * num("service_km_hz") * FACTORS.scope3.service_km;

  // Cloud-Service
  const cloud = $('[name="cloud_genutzt"]')?.value || "Nein";
  if (cloud.startsWith("Ja")) {
    s3 += cloud.includes("volumenbasiert") ? (num("cloud_gb") * 12) * FACTORS.scope3.cloud_per_GB : 5;
  }

  // Pendeln & Papier (vereinfachte Faktoren)
  s3 += num("pendel_kfz")      * FACTORS.scope1.km_diesel;
  s3 += num("pendel_emob")     * FACTORS.scope1.ev_kwh_per_km * stromFaktor();
  s3 += num("pendel_motorrad") * FACTORS.scope1.km_benzin;
  s3 += num("pendel_oev")      * FACTORS.scope3.bahn_km;
  s3 += num("druck_blatt")     * FACTORS.scope3.papier_blatt;

  return s3;
}

function calcAll(){
  const s1 = calcScope1();
  const s2 = calcScope2();
  const s3 = calcScope3();
  const total = s1 + s2 + s3;

  // Visualisierung
  const trees = total / FACTORS.komp.baum_per_year;
  const vol_m3 = total / FACTORS.komp.co2_density;
  const height_m = vol_m3 / FACTORS.komp.football_area_m2;
  const tvPct = (height_m / FACTORS.komp.tv_height_m) * 100;

  // Ausgabe
  $("#outScope1").textContent = s1.toFixed(0);
  $("#outScope2").textContent = s2.toFixed(0);
  $("#outScope3").textContent = s3.toFixed(0);
  $("#outTotal").textContent  = total.toFixed(0);
  $("#outTrees").textContent  = Math.ceil(trees);
  $("#outVolume").textContent = vol_m3.toFixed(0);
  $("#outHeight").textContent = height_m.toFixed(2);
  $("#outTVPct").textContent  = Math.min(tvPct, 999).toFixed(1);
  $("#resultCard").style.display = "block";

  return { s1, s2, s3, total, trees, vol_m3, height_m, tvPct };
}
$("#calcBtn")?.addEventListener("click", calcAll);

// ---- Verifikations-ID (Test, SHA-256) ----
async function computeHash(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// ===============================
// PDF-Export
// ===============================
$("#pdfBtn")?.addEventListener("click", async ()=>{
  const { jsPDF } = window.jspdf;
  const res = calcAll();
  const praxis = $("#entityName").textContent || "—";
  const datum = auditDate() || new Date().toISOString().slice(0, 10);
  const verHash = await computeHash(`${praxis}|${datum}`);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Seite 1 – Deckblatt
  doc.setFont("helvetica","bold"); drawCO2Title(doc, 56, 90, 18);
  doc.setFont("helvetica","normal"); doc.setFontSize(12);
  doc.text(praxis, 56, 112);
  doc.text(`Audit-Datum: ${datum}`, 56, 130);
  drawWatermarkCO2(doc, pageW, pageH); // sehr transparent
  footer(doc, pageW, pageH, verHash, 1, 4);

  // Seite 2 – Zusammenfassung
  doc.addPage();
  header(doc, praxis, datum, "Zusammenfassung");
  doc.setFont("helvetica","normal"); doc.setFontSize(12);
  doc.text(`Scope 1: ${res.s1.toFixed(0)} kg CO₂`, 56, 140);
  doc.text(`Scope 2: ${res.s2.toFixed(0)} kg CO₂`, 56, 160);
  doc.text(`Scope 3: ${res.s3.toFixed(0)} kg CO₂`, 56, 180);
  doc.setFont("helvetica","bold");
  doc.text(`Gesamt: ${res.total.toFixed(0)} kg CO₂`, 56, 205);
  doc.setFont("helvetica","normal");
  doc.text(`Bäume zur Kompensation: ${Math.ceil(res.trees)}`, 56, 240);
  doc.text(`CO₂-Volumen: ${res.vol_m3.toFixed(0)} m³`, 56, 260);
  doc.text(`Säulenhöhe über Fußballfeld: ${res.height_m.toFixed(2)} m`, 56, 280);
  doc.text(`Höhe relativ Berliner Fernsehturm: ${Math.min(res.tvPct,999).toFixed(1)} %`, 56, 300);
  footer(doc, pageW, pageH, verHash, 2, 4);

  // Seite 3 – Struktur
  doc.addPage();
  header(doc, praxis, datum, "Datenstruktur & Geltungsbereich");
  scopeBlock(doc, 56, 140, pageW-112, "#e3f2fd", "Scope 1 – Direkte Emissionen (GHG)", "Fuhrpark, Heizung (eigene Erzeugung).");
  scopeBlock(doc, 56, 210, pageW-112, "#e8f5e9", "Scope 2 – Eingekaufte Energie (GHG)", "Strom (Ökostrom-Anteil berücksichtigt), Kälte, Gebäude.");
  scopeBlock(doc, 56, 280, pageW-112, "#fff3e0", "Scope 3 – Übrige indirekte Emissionen (GHG)", "Digitalprozesse, Servicefahrten/Bundle, Cloud, Pendeln, Papier, Lieferkette.");
  footer(doc, pageW, pageH, verHash, 3, 4);

  // Seite 4 – Legende + Visualisierung + Balkendiagramm
  doc.addPage();
  header(doc, praxis, datum, "Legende & Visualisierung (GHG-konform)");
  renderLegend(doc, 56, 130, pageW-112, res);
  renderBarChart(doc, 56, 430, pageW-112, 220, res); // Balkendiagramm unten
  footer(doc, pageW, pageH, verHash, 4, 4);

  doc.save("Dental-CO2_Klimabilanz_Testbericht.pdf");
});

// ---- Footer / Header / CO₂-Titel / Wasserzeichen ----
function footer(doc, pageW, pageH, hash, page, pages){
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(80);
  const y1 = pageH - 46, y2 = pageH - 28, y3 = pageH - 12;
  const textLeft = "Lizenzierte Nutzung – JPConvent Klimaneutral. Berechnungen (DE/EU/international): UBA / IPCC / DEFRA / GHG Protocol. KI-unterstützte Auswertung (AI Act).";
  doc.text(textLeft, 56, y1, { maxWidth: pageW - 180 });
  doc.text(`Verifikations-ID: ${hash}`, 56, y2);
  doc.text(`Seite ${page} von ${pages}`, pageW - 56, y3, { align: "right" });
}

function header(doc, praxis, datum, titel){
  doc.setFont("helvetica","bold"); drawCO2Title(doc, 56, 56, 12);
  doc.setFont("helvetica","normal");
  doc.text(praxis, 56, 72);
  doc.text(`Audit: ${datum}`, doc.internal.pageSize.getWidth()-56, 56, { align: "right" });
  doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text(titel, doc.internal.pageSize.getWidth()/2, 90, { align: "center" });
}

// CO₂-Rendering als echte Tiefstellung
function drawCO2Title(doc, x, y, baseSize){
  doc.setFontSize(baseSize);
  doc.text(TITLE_P1, x, y);
  const w1 = doc.getTextWidth(TITLE_P1);
  const subSize = baseSize * 0.7;
  doc.setFontSize(subSize); doc.text("2", x + w1 + 2, y + baseSize * 0.28);
  doc.setFontSize(baseSize);
  const w2 = doc.getTextWidth("2") * (subSize/baseSize);
  doc.text(TITLE_P2, x + w1 + 2 + w2 + 2, y);
}

// Sehr transparentes Wasserzeichen, links-unten → rechts-oben (Winkel 30°)
function drawWatermarkCO2(doc, pageW, pageH){
  const baseSize = 34, subSize = baseSize * 0.7;
  const cx = pageW/2, cy = pageH/2;

  if (doc.GState) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.05 })); } // „Hauch“

  doc.setFont("helvetica","bold");
  doc.setFontSize(baseSize);
  const wP1 = doc.getTextWidth(WM_P1);
  doc.setFontSize(subSize); const wSub = doc.getTextWidth("2");
  doc.setFontSize(baseSize); const wP2 = doc.getTextWidth(WM_P2);

  const totalW = wP1 + 2 + wSub + 2 + wP2;
  const startX = cx - totalW/2;
  const baseY = cy;

  doc.setFontSize(baseSize); doc.text(WM_P1, startX, baseY, { angle: 30 });
  doc.setFontSize(subSize);  doc.text("2", startX + wP1 + 2, baseY + baseSize*0.28, { angle: 30 });
  doc.setFontSize(baseSize); doc.text(WM_P2, startX + wP1 + 2 + wSub + 2, baseY, { angle: 30 });

  if (doc.GState) doc.restoreGraphicsState();
}

// ---- Scope-Blöcke ----
function scopeBlock(doc, x, y, w, colorHex, title, desc){
  const rgb = hexToRgb(colorHex) || { r:230, g:230, b:230 };
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.roundedRect(x, y-18, w, 28, 6, 6, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text(title, x+8, y);
  doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.text(desc, x+8, y+24);
}
function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : null;
}

// ===============================
// Legende + Visualisierung (vektorbasierte Icons) – letzte Seite (untereinander)
// ===============================

// Icons als Vektorformen → PDF-Viewer-unabhängig
function drawTreeIcon(doc, x, y, size){
  // Krone
  doc.setFillColor(90,160,110);
  doc.triangle(x, y - size, x - size*0.7, y, x + size*0.7, y, 'F');
  // Stamm
  doc.setFillColor(110,80,50);
  doc.rect(x - size*0.12, y, size*0.24, size*0.6, 'F');
}
function drawStadiumIcon(doc, x, y, w, h){
  doc.setFillColor(120,150,190);
  doc.roundedRect(x - w/2, y - h/2, w, h, 10, 10, 'F');
  // Mittellinie
  doc.setDrawColor(255,255,255);
  doc.setLineWidth(1);
  doc.line(x - w/2 + 8, y, x + w/2 - 8, y);
}
function drawTowerIcon(doc, x, y, h){
  const w = h * 0.12;
  // Schaft
  doc.setFillColor(140,140,150);
  doc.rect(x - w/2, y - h, w, h*0.85, 'F');
  // Kugel
  doc.setFillColor(110,110,120);
  doc.circle(x, y - h*0.88, h*0.06, 'F');
  // Spitze
  doc.triangle(x, y - h*1.02, x - w*0.25, y - h*0.92, x + w*0.25, y - h*0.92, 'F');
}

function renderLegend(doc, x, y, w, res){
  const lh = 16;

  // Überschrift
  doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text("Legende (GHG Protocol):", x, y);
  doc.setFont("helvetica","normal"); doc.setFontSize(11);

  // Scope-Texte
  let yy = y + 22;
  doc.text("• Scope 1 – Direkte Emissionen (Fuhrpark, Heizung).", x, yy); yy += lh;
  doc.text("• Scope 2 – Eingekaufte Energie (Strom, Kälte, Gebäude).", x, yy); yy += lh;
  doc.text("• Scope 3 – Übrige indirekte Emissionen (Digitalprozesse, Servicefahrten/Bundle, Cloud, Pendeln, Papier, Lieferkette).", x, yy, { maxWidth: w });
  yy += lh + 10;

  // Visualisierungstitel
  doc.setFont("helvetica","bold");
  doc.text("Visualisierung der Gesamtemissionen:", x, yy);
  yy += lh;

  // Werte
  const trees   = Math.ceil(res.trees);
  const fields  = (res.vol_m3 / FACTORS.komp.football_area_m2);
  const heightM = res.height_m;
  const tvPct   = Math.min(res.tvPct, 999);

  // 1) Bäume
  drawTreeIcon(doc, x + 14, yy + 8, 12);
  doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text(`${trees} Bäume`, x + 36, yy + 6);
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  doc.text(`CO₂-Volumen: ${res.vol_m3.toFixed(0)} m³`, x + 36, yy + 22);
  yy += 36;

  // 2) Fußballfelder
  drawStadiumIcon(doc, x + 18, yy + 8, 34, 18);
  doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text(`${fields.toFixed(2)} Fußballfelder`, x + 44, yy + 6);
  yy += 28;

  // 3) Fernsehturm
  drawTowerIcon(doc, x + 16, yy + 14, 28);
  doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text(`${heightM.toFixed(2)} m (≈ ${tvPct.toFixed(1)}% TV-Turm)`, x + 44, yy + 6);
  yy += 20;

  // Quellen/Methodik
  yy += 10;
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text("Quellen/Methodik:", x, yy); yy += 14;
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const methodik = "Emissionsfaktoren: UBA (DE), IPCC, DEFRA; GHG Protocol (Scope 1–3). Berechnung automatisch aus App-Daten; Visualisierung dient der Verständlichkeit.";
  doc.text(methodik, x, yy, { maxWidth: w });
}

// ===============================
// Balkendiagramm (Scope 1–3) – Titel mit „t CO₂“, Werte über Balken
// ===============================
function renderBarChart(doc, x, y, w, h, res){
  const s1 = res.s1 / 1000, s2 = res.s2 / 1000, s3 = res.s3 / 1000; // in t
  const data = [
    { label: "Scope 1", value: s1, color: "#5a9bd5" },
    { label: "Scope 2", value: s2, color: "#7ccca1" },
    { label: "Scope 3", value: s3, color: "#f5c086" },
  ];

  const max = Math.max(1, s1, s2, s3);
  const padding = 46;               // etwas mehr Luft
  const chartW = w - padding*2;
  const chartH = h - padding*2;
  const barW = chartW / (data.length * 1.8);

  // Titel: "Balkendiagramm – Emissionen je Scope (t CO₂)"
  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  const titleLeft = "Balkendiagramm – Emissionen je Scope (t CO";
  const titleX = x, titleY = y + 12;
  doc.text(titleLeft, titleX, titleY);
  const txW = doc.getTextWidth(titleLeft);
  drawCO2Inline(doc, titleX + txW, titleY, 11, ")"); // nur „)“ → ergibt „CO₂)“

  // Achsen
  doc.setDrawColor(180,186,194);
  doc.line(x+padding, y+padding+chartH, x+padding+chartW, y+padding+chartH);
  doc.line(x+padding, y+padding, x+padding, y+padding+chartH);

  // Balken
  let cx = x + padding + barW/2;
  data.forEach(d => {
    const ratio = d.value / max;
    const barH = ratio * chartH;
    const rgb = hexToRgb(d.color) || { r:120, g:120, b:120 };
    const bx = cx, by = y + padding + chartH - barH;

    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(bx, by, barW, barH, "F");

    // Label unter dem Balken
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text(d.label, bx + barW/2, y + padding + chartH + 16, { align: "center" });

    // Wert über dem Balken
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text(`${d.value.toFixed(2)} t`, bx + barW/2, by - 8, { align: "center" });

    cx += barW * 1.8;
  });
}

// Hilfsfunktion: „₂“ zeichnen + beliebiger Nachlauftext
function drawCO2Inline(doc, x, y, baseSize, tailText){
  const sub = baseSize * 0.7;
  doc.setFontSize(sub);
  doc.text("2", x + 2, y + baseSize * 0.28);
  doc.setFontSize(baseSize);
  const w2 = doc.getTextWidth("2") * (sub / baseSize);
  if (tailText) doc.text(tailText, x + 2 + w2 + 2, y);
}
