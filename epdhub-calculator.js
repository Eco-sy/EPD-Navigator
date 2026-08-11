/**
 * epdhub-calculator.js
 * EPD Hub Gebührenrechner
 * Quelle: https://www.epdhub.com/about-epd-hub/pricing
 *
 * Preise sind fixe Gesamtpreise pro exakter EPD-Anzahl (kein Stufenmodell).
 * Für Mengen über 20 EPDs: Scaling Packs auf Anfrage (sales@epdhub.com).
 *
 * Zählregeln (EPD Hub):
 *   - Standard EPD          = 1 EPD
 *   - Ähnliche EPD (gleiche Zeit) = 0,5 EPD
 *   - Averaged/Scaling EPD  = 2 EPDs
 *   - Jede 5. EPD gratis (Buy 4, get 1 free)
 *
 * Produktkomplexität:
 *   "simple"  → Simple product
 *   "complex" → Complex product
 */

// ---------------------------------------------------------------------------
// Preistabelle – exakte Preise pro EPD-Anzahl
// ---------------------------------------------------------------------------
const EPD_PRICES = {
   1: { simple:  1995, complex:  2850 },
   2: { simple:  2800, complex:  3600 },
   3: { simple:  3600, complex:  4800 },
   4: { simple:  4400, complex:  6200 },
   5: { simple:  5000, complex:  7500 },
   6: { simple:  5940, complex:  8700 },
   7: { simple:  6860, complex:  9800 },
   8: { simple:  7800, complex: 11000 },
   9: { simple:  8730, complex: 12150 },
  10: { simple:  9600, complex: 13000 },
  15: { simple: 14100, complex: 18750 },
  20: { simple: 18600, complex: 24000 },
};

const EPD_PRICE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
const EPD_PRICE_MAX   = 20;

// ---------------------------------------------------------------------------
// Hilfsfunktion – nächste verfügbare Paketstufe finden
// ---------------------------------------------------------------------------
function findPriceEntry(count) {
  for (const step of EPD_PRICE_STEPS) {
    if (count <= step) return { step, prices: EPD_PRICES[step] };
  }
  return null; // über 20 EPDs → auf Anfrage
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * @param {Object} customerData
 *   @param {string} customerData.companyName
 *
 * @param {Object} answers
 *   @param {"simple"|"complex"} answers.epdHubComplexity
 *   @param {number} answers.newEPDs
 */
function calculateEPDHub(customerData, answers) {
  const complexity = answers.epdHubComplexity;
  const requestedCount = Math.max(0, Number(answers.newEPDs) || 0);
  const newEPDs    = Math.max(0, Number(answers.newEPDs) || 0);
  const effectiveCount = newEPDs - Math.floor(newEPDs / 5);

  if (complexity !== "simple" && complexity !== "complex") {
    throw new Error(`Ungültige Komplexität: "${complexity}". Erlaubt: "simple" | "complex".`);
  }
  if (effectiveCount === 0) {
    throw new Error("Anzahl EPDs muss größer als 0 sein.");
  }
  // if (effectiveCount > EPD_PRICE_MAX) {
  //   throw new Error(
  //     `Für mehr als ${EPD_PRICE_MAX} EPDs bietet EPD Hub Scaling Packs auf Anfrage an. ` +
  //     `Bitte kontaktieren Sie sales@epdhub.com für ein individuelles Angebot.`
  //   );
  // }

  const cappedCount = EPD_PRICE_MAX;
  const limitExceeded = requestedCount > cappedCount;

  const entry        = findPriceEntry(cappedCount);
  const packagePrice = entry.prices[complexity];
  const pricePerEPD  = Math.round(packagePrice / entry.step);

  const projection = Array.from({ length: 5 }, (_, idx) => ({
    year:       idx + 1,
    oneTime:    idx === 0 ? packagePrice : 0,
    annual:     0,
    total:      idx === 0 ? packagePrice : 0,
    cumulative: packagePrice,
  }));

  return {
    provider:     'EPD Hub',
    companyName:  customerData.companyName,
    calculatedAt: new Date().toISOString(),
    inputs: {
      complexity,
      requestedEPDs: requestedCount,
      effectiveCount,
      cappedCount,
      packageStep: entry.step,
      limitExceeded,
    },
    package: {
      label:       `${limitExceeded ? cappedCount : requestedCount} EPDs (${complexity === "simple" ? "Simple" : "Complex"} Product)`,
      step:        entry.step,
      price:       packagePrice,
      pricePerEPD,
      note: limitExceeded
        ? 'Inkl. bis zu 3 Verifikationsrunden, Publishing und digitalem Workflow. Kein Mitgliedsbeitrag. <br >Berechnet als Maximalpaket für 20 EPDs. Für größere Mengen kontaktieren Sie sales@epdhub.com.'
        : 'Inkl. bis zu 3 Verifikationsrunden, Publishing und digitalem Workflow. Kein Mitgliedsbeitrag.',
    },
    totalFirstYear: packagePrice,
    projection,
  };
}