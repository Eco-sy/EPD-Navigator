/**
 * ibu-calculator.js
 * IBU EPD Gebührenrechner – für Verbandsmitglieder & Nicht-Verbandsmitglieder
 * Gebührenordnung gültig ab 01.09.2025
 *
 * Steuerung über customerData.membershipType:
 *   "associate"     → Mitglied über einen Verband (Mitgliedsbeitrag läuft über Verband)
 *   "non-associate" → kein Verband, IBU-Mitgliedsbeitrag direkt fällig
 */

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

// Jahresbeiträge nach Firmengrößengruppe F1–F7 (nur für Direktmitglieder, § 2.1)
const MEMBERSHIP_FEES = { 1:600, 2:900, 3:1200, 4:1950, 5:3300, 6:4450, 7:5400 };

// Einmalige Gebühren – identisch für beide Mitgliedstypen (§ 1.1)
const ONE_TIME_FEES = {
  newEPD:     2700,
  familyEPD:  500,
  reworkEPD:  1500,
  renewalEPD: 1500,
};

// Zeichenentgelt-Staffel – gilt für ordentliche UND assoziierte Mitglieder (§ 2.1.a)
// Nicht-Mitglieder zahlen den 3-fachen Satz (§ 2.1.d)
const SIGN_FEE_TIERS = [
  { from:1,  to:1,    fee:960 },
  { from:2,  to:2,    fee:480 },
  { from:3,  to:3,    fee:240 },
  { from:4,  to:4,    fee:180 },
  { from:5,  to:20,   fee:120 },
  { from:21, to:null, fee:0   },
];

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function getSignFee(tiers, pos) {
  for (const tier of tiers) {
    if (pos >= tier.from && (tier.to === null || pos <= tier.to)) return tier.fee;
  }
  return tiers[tiers.length - 1].fee;
}

function calcSignFees(tiers, totalValidEPDs) {
  const breakdown = [];
  let total = 0;
  for (let i = 1; i <= totalValidEPDs; i++) {
    const fee = getSignFee(tiers, i);
    breakdown.push({ position: i, fee });
    total += fee;
  }
  return { breakdown, total };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Berechnet die IBU-EPD-Gebühren.
 *
 * @param {Object} customerData
 *   @param {string} customerData.companyName
 *   @param {"associate"|"non-associate"} customerData.membershipType
 *   @param {number} [customerData.membershipGroup]   – 1–7, nur für non-associate relevant
 *   @param {number} customerData.existingValidEPDs   – bereits gültige EPDs laut CRM
 *
 * @param {Object} answers
 *   @param {number} answers.renewEPDs
 *   @param {number} answers.newEPDs
 *   @param {number} answers.newEPDsFromFamily
 *   @param {number} answers.reworkEPDs
 *
 * @returns {Object} Strukturiertes Ergebnisobjekt
 */
function calculateIBU(customerData, answers) {
  const membershipType = customerData.membershipType;
  if (membershipType !== "associate" && membershipType !== "non-associate") {
    throw new Error(`Ungültiger membershipType: "${membershipType}". Erlaubt: "associate" | "non-associate".`);
  }

  const existingEPDs      = Math.max(0, Number(customerData.existingValidEPDs) || 0); //Anzahl schon existierender EPDs
  const renewEPDs         = Math.max(0, Number(answers.renewEPDs)         || 0); //Anzahl zu erneuernden EPDS
  const newEPDs           = Math.max(0, Number(answers.newEPDs)           || 0); //Anzahl aller neuen EPDs
  const numFamilies       = newEPDs > 0 ? Math.max(0, Math.min(Number(answers.newEPDsFromFamily) || 1, newEPDs)) : 0; //Anzahl der versch. Produktfamilien
  const newEPDsFromFamily = newEPDs - numFamilies//Anzahl alles EPDs unter folgekosten
  const normalNewEPDs     = numFamilies //Anzahl EPDs mit Erstaustellungsgebühren (Im Endeffekt die Anzahl aller versch. Familien)

  // --- Plausibilitätsprüfung ---
  // Aktualisierung und Überarbeitungen können sich nur auf bereits bestehende,
  // gültige EPDs beziehen.
  if (renewEPDs > existingEPDs) {
    throw new Error(
      `Anzahl der zu aktualisierenden EPDs (${renewEPDs}) übersteigt die Anzahl ` +
      `bestehender gültiger EPDs (${existingEPDs}).`
    );
  }
  // if (reworkEPDs > existingEPDs) {
  //   throw new Error(
  //     `Anzahl der zu überarbeitenden EPDs (${reworkEPDs}) übersteigt die Anzahl ` +
  //     `bestehender gültiger EPDs (${existingEPDs}).`
  //   );
  // }

  // --- Einmalige Kosten (identisch für beide Typen) ---
  const verificationCosts = {
    newEPDs:    { count: normalNewEPDs,     unitCost: ONE_TIME_FEES.newEPD,     total: normalNewEPDs     * ONE_TIME_FEES.newEPD,     label: 'Erstausstellung neue EPDs' },
    familyEPDs: { count: newEPDsFromFamily, unitCost: ONE_TIME_FEES.familyEPD,  total: newEPDsFromFamily       * ONE_TIME_FEES.familyEPD,  label: 'Weitere EPDs gleiche Produktfamilie' },
    // reworkEPDs: { count: reworkEPDs,        unitCost: ONE_TIME_FEES.reworkEPD,  total: reworkEPDs        * ONE_TIME_FEES.reworkEPD,  label: 'Überarbeitung / Aktualisierung' },
    renewEPDs:  { count: renewEPDs,         unitCost: ONE_TIME_FEES.renewalEPD, total: renewEPDs         * ONE_TIME_FEES.renewalEPD, label: 'Aktualisierung bestehender EPDs' },
  };
  const totalOneTimeCosts = Object.values(verificationCosts).reduce((s, c) => s + c.total, 0);

  // --- Jährliche Kosten (abhängig vom Mitgliedstyp) ---
  // Überarbeitete EPDs (reworkEPDs) sind Teil der bestehenden EPDs und werden
  // daher NICHT zusätzlich gezählt. Aktualisierungen (renewEPDs) ändern die
  // Gesamtzahl ebenfalls nicht – sie erhalten lediglich bestehende EPDs.
  const totalValidEPDs = existingEPDs + newEPDs;

  let membershipFee;
  let membershipFeeLabel;

  if (membershipType === "non-associate") {
    const group = Number(customerData.membershipGroup);
    if (!MEMBERSHIP_FEES[group]) {
      throw new Error(`Ungültige Mitgliedschaftsgruppe: ${group}.`);
    }
    membershipFee      = MEMBERSHIP_FEES[group];
    membershipFeeLabel = `Mitgliedsbeitrag IBU (Gruppe F${group})`;
  } else {
    // associate: Mitgliedsbeitrag läuft über den Verband
    membershipFee      = 0;
    membershipFeeLabel = 'Mitgliedsbeitrag (über Verband abgerechnet)';
  }

  const signFees         = calcSignFees(SIGN_FEE_TIERS, totalValidEPDs);
  const totalAnnualCosts = membershipFee + signFees.total;

  const projection = Array.from({ length: 5 }, (_, idx) => ({
    year:        idx + 1,
    oneTime:     idx === 0 ? totalOneTimeCosts : 0,
    annual:      totalAnnualCosts,
    total:       (idx === 0 ? totalOneTimeCosts : 0) + totalAnnualCosts,
    cumulative:  (idx === 0 ? totalOneTimeCosts : 0) + totalAnnualCosts * (idx + 1),
  }));
  // Kumulative Summe korrekt aufbauen
  projection.forEach((row, idx) => {
    row.cumulative = projection.slice(0, idx + 1).reduce((s, r) => s + r.total, 0);
  });

  return {
    provider:     'IBU',
    memberType:   membershipType,
    companyName:  customerData.companyName,
    calculatedAt: new Date().toISOString(),
    inputs: {
      membershipType,
      membershipGroup: customerData.membershipGroup ?? null,
      existingEPDs, renewEPDs, newEPDs, newEPDsFromFamily,
      totalValidEPDsAfter: totalValidEPDs,
    },
    oneTime: { items: verificationCosts, total: totalOneTimeCosts },
    annual: {
      items: {
        membershipFee: { total: membershipFee, label: membershipFeeLabel, billedExternally: membershipType === "associate" },
        signFees:      { total: signFees.total, breakdown: signFees.breakdown, label: 'Zeichenentgelte (jährlich)' },
      },
      total: totalAnnualCosts,
    },
    totalFirstYear: totalOneTimeCosts + totalAnnualCosts,
    projection,
  };
}
