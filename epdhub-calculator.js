/**
 * epdhub-calculator.js
 * EPD Hub Gebührenrechner
 * Quelle: https://www.epdhub.com/about-epd-hub/pricing
 *
 * Zwei Modelle:
 *   "pack"    → EPD Packs (bis 100 EPDs, einzelne Projekte)
 *   "scaling" → Scaling Packs / Process Certification (ab 100 EPDs, via pre-verified Tools)
 *
 * Produktkomplexität:
 *   "simple"  → Simple product
 *   "complex" → Complex product
 *
 * Preise sind Paketpreise (Gesamtpreis für die gewählte Paketstufe),
 * kein separater Mitgliedsbeitrag, keine Zeichenentgelte, keine Publishing-Gebühr.
 */

// ---------------------------------------------------------------------------
// Preistabellen
// ---------------------------------------------------------------------------

// EPD Packs – bis 100 EPDs
const EPD_PACK_TIERS = [
  { upTo:   1, simple:   1995, complex:   2850 },
  { upTo:   5, simple:   5000, complex:   7500 },
  { upTo:  10, simple:   9600, complex:  13000 },
  { upTo:  20, simple:  18600, complex:  24000 },
  { upTo:  50, simple:  45000, complex:  55000 },
  { upTo: 100, simple:  80000, complex:  99000 },
];

// Scaling Packs – ab 100 EPDs via pre-verified Tools
const SCALING_PACK_TIERS = [
  { upTo:   100, simple:  33000, complex:  49500 },
  { upTo:   250, simple:  66000, complex:  99500 },
  { upTo:   500, simple:  99000, complex: 149000 },
  { upTo:  1000, simple: 132000, complex: 197000 },
  { upTo:  2500, simple: 165000, complex: 249000 },
  { upTo:  5000, simple: 265000, complex: 399000 },
  { upTo: 10000, simple: 450000, complex: 699000 },
];

// ---------------------------------------------------------------------------
// Hilfsfunktion
// ---------------------------------------------------------------------------

function findTier(tiers, count) {
  for (let i = 0; i < tiers.length; i++) {
    if (count <= tiers[i].upTo) return { tier: tiers[i], index: i };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Berechnet die EPD Hub-Kosten.
 *
 * @param {Object} customerData
 *   @param {string} customerData.companyName
 *
 * @param {Object} answers
 *   @param {"pack"|"scaling"} answers.epdHubModel
 *   @param {"simple"|"complex"} answers.epdHubComplexity
 *   @param {number} answers.newEPDs
 */
function calculateEPDHub(customerData, answers) {
  const model      = answers.epdHubModel;
  const complexity = answers.epdHubComplexity;
  const newEPDs    = Math.max(0, Number(answers.newEPDs) || 0);

  if (model !== "pack" && model !== "scaling") {
    throw new Error(`Ungültiges Modell: "${model}". Erlaubt: "pack" | "scaling".`);
  }
  if (complexity !== "simple" && complexity !== "complex") {
    throw new Error(`Ungültige Komplexität: "${complexity}". Erlaubt: "simple" | "complex".`);
  }
  if (newEPDs === 0) {
    throw new Error("Anzahl EPDs muss größer als 0 sein.");
  }

  const tiers  = model === "pack" ? EPD_PACK_TIERS : SCALING_PACK_TIERS;
  const result = findTier(tiers, newEPDs);

  if (!result) {
    const max = tiers[tiers.length - 1].upTo;
    throw new Error(
      `Anzahl EPDs (${newEPDs}) übersteigt das maximale Paket (${max} EPDs). ` +
      `Bitte EPD Hub direkt kontaktieren.`
    );
  }

  const { tier } = result;
  const packagePrice = tier[complexity];
  const pricePerEPD  = Math.round(packagePrice / tier.upTo);

  return {
    provider:     'EPD Hub',
    companyName:  customerData.companyName,
    calculatedAt: new Date().toISOString(),
    inputs: { model, complexity, newEPDs, packageSize: tier.upTo },
    package: {
      label:       `${model === "pack" ? "EPD Pack" : "Scaling Pack"} – bis ${tier.upTo} EPDs (${complexity === "simple" ? "Simple" : "Complex"} Product)`,
      size:        tier.upTo,
      price:       packagePrice,
      pricePerEPD,
      note:        'Inkl. bis zu 3 Verifikationsrunden, Publishing und digitalem Workflow. Kein Mitgliedsbeitrag.',
    },
    totalFirstYear: packagePrice,
  };
}
