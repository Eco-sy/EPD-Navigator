/**
 * environdec-calculator.js
 * Environdec EPD Gebührenrechner
 *
 * Steuerung über customerData.environdecMembershipType:
 *   "micro"        → Micro Business          (515 €/Jahr)
 *   "sme"          → Small & Medium Business (1.030 €/Jahr)
 *   "multinational"→ Multinational Business  (2.575 €/Jahr)
 *
 * Einmalige Verifizierungsgebühren (gestaffelt nach Position der EPD):
 *   EPD 1:       1.000 €
 *   EPDs 2–4:      500 € je EPD
 *   EPDs 5–99:     100 € je EPD
 *   EPDs ab 100:    50 € je EPD
 */

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

const ENVIRONDEC_MEMBERSHIP_FEES = {
  micro:         515,
  sme:           1030,
  multinational: 2575,
};

const ENVIRONDEC_VERIFICATION_TIERS = [
  { from: 1,   to: 1,    fee: 1000 },
  { from: 2,   to: 4,    fee: 500  },
  { from: 5,   to: 99,   fee: 100  },
  { from: 100, to: null, fee: 50   },
];

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function getVerificationFee(pos) {
  for (const tier of ENVIRONDEC_VERIFICATION_TIERS) {
    if (pos >= tier.from && (tier.to === null || pos <= tier.to)) return tier.fee;
  }
  return ENVIRONDEC_VERIFICATION_TIERS[ENVIRONDEC_VERIFICATION_TIERS.length - 1].fee;
}

/**
 * Berechnet die gestaffelten Verifizierungskosten für EPDs.
 * Die Staffel baut auf der Position jeder EPD in der Gesamtreihe auf —
 * bestehende EPDs belegen bereits die ersten Positionen.
 *
 * @param {number} existingEPDs  – bereits bestehende EPDs (belegen Positionen 1..n)
 * @param {number} newEPDs       – neue EPDs die hinzukommen
 * @param {number} renewEPDs     – Verlängerungen (zahlen erneut Verifizierungsgebühr)
 */
function calcVerificationCosts(existingEPDs, newEPDs, renewEPDs) {
  const newBreakdown   = [];
  const renewBreakdown = [];

  // Neue EPDs belegen die nächsten freien Positionen nach den bestehenden
  for (let i = 1; i <= newEPDs; i++) {
    const pos = existingEPDs + i;
    newBreakdown.push({ position: pos, fee: getVerificationFee(pos) });
  }

  // Verlängerungen zahlen erneut die Gebühr ihrer ursprünglichen Position
  for (let i = 1; i <= renewEPDs; i++) {
    renewBreakdown.push({ position: i, fee: getVerificationFee(i) });
  }

  const newTotal   = newBreakdown.reduce((s, e) => s + e.fee, 0);
  const renewTotal = renewBreakdown.reduce((s, e) => s + e.fee, 0);

  return { newBreakdown, newTotal, renewBreakdown, renewTotal };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Berechnet die Environdec-EPD-Gebühren.
 *
 * @param {Object} customerData
 *   @param {string} customerData.companyName
 *   @param {"micro"|"sme"|"multinational"} customerData.environdecMembershipType
 *   @param {number} customerData.existingValidEPDs
 *
 * @param {Object} answers
 *   @param {number} answers.renewEPDs
 *   @param {number} answers.newEPDs
 *
 * @returns {Object} Strukturiertes Ergebnisobjekt
 */
function calculateEnvirondec(customerData, answers) {
  const membershipType = customerData.environdecMembershipType;
  if (!ENVIRONDEC_MEMBERSHIP_FEES[membershipType]) {
    throw new Error(
      `Ungültiger environdecMembershipType: "${membershipType}". ` +
      `Erlaubt: "micro" | "sme" | "multinational".`
    );
  }

  const existingEPDs = Math.max(0, Number(customerData.existingValidEPDs) || 0);
  const renewEPDs    = Math.max(0, Number(answers.renewEPDs) || 0);
  const newEPDs      = Math.max(0, Number(answers.newEPDs)   || 0);

  if (renewEPDs > existingEPDs) {
    throw new Error(
      `Anzahl der zu verlängernden EPDs (${renewEPDs}) übersteigt die Anzahl ` +
      `bestehender gültiger EPDs (${existingEPDs}).`
    );
  }

  // --- Einmalige Kosten ---
  const verification = calcVerificationCosts(existingEPDs, newEPDs, renewEPDs);
  const totalOneTimeCosts = verification.newTotal + verification.renewTotal;

  // --- Jährliche Kosten ---
  const membershipFee    = ENVIRONDEC_MEMBERSHIP_FEES[membershipType];
  const totalValidEPDs   = existingEPDs + newEPDs;
  const totalAnnualCosts = membershipFee;

  const projection = Array.from({ length: 5 }, (_, idx) => ({
    year:  idx + 1,
    oneTime: idx === 0 ? totalOneTimeCosts : 0,
    annual:  totalAnnualCosts,
    total:   (idx === 0 ? totalOneTimeCosts : 0) + totalAnnualCosts,
  }));
  projection.forEach((row, idx) => {
    row.cumulative = projection.slice(0, idx + 1).reduce((s, r) => s + r.total, 0);
  });

  return {
    provider:     'Environdec',
    companyName:  customerData.companyName,
    calculatedAt: new Date().toISOString(),
    inputs: {
      membershipType,
      existingEPDs,
      renewEPDs,
      newEPDs,
      totalValidEPDsAfter: totalValidEPDs,
    },
    oneTime: {
      newEPDs: {
        label:     'Verifizierung neue EPDs (gestaffelt)',
        breakdown: verification.newBreakdown,
        total:     verification.newTotal,
      },
      renewEPDs: {
        label:     'Verifizierung Verlängerungen (gestaffelt)',
        breakdown: verification.renewBreakdown,
        total:     verification.renewTotal,
      },
      total: totalOneTimeCosts,
    },
    annual: {
      membershipFee: {
        label: `Jahresmitgliedschaft (${membershipType})`,
        total: membershipFee,
      },
      total: totalAnnualCosts,
    },
    totalFirstYear: totalOneTimeCosts + totalAnnualCosts,
    projection,
  };
}
