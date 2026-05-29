/**
 * ibu-calculator.js
 * IBU EPD Gebührenrechner – kein Verbandsmitglied
 * Gebührenordnung gültig ab 01.09.2025
 */

const MEMBERSHIP_FEES = { 1:600, 2:900, 3:1200, 4:1950, 5:3300, 6:4450, 7:5400 };

const SIGN_FEE_TIERS = [
  { from:1, to:1,    fee:2880 },
  { from:2, to:2,    fee:1440 },
  { from:3, to:3,    fee:720  },
  { from:4, to:4,    fee:540  },
  { from:5, to:null, fee:360  },
];

const ONE_TIME_FEES = {
  newEPD:     2700,
  familyEPD:  500,
  reworkEPD:  1500,
  renewalEPD: 1500,
};

function getSignFee(pos) {
  for (const tier of SIGN_FEE_TIERS) {
    if (pos >= tier.from && (tier.to === null || pos <= tier.to)) return tier.fee;
  }
  return SIGN_FEE_TIERS[SIGN_FEE_TIERS.length - 1].fee;
}

function calcSignFees(totalValidEPDs) {
  const breakdown = [];
  let total = 0;
  for (let i = 1; i <= totalValidEPDs; i++) {
    const fee = getSignFee(i);
    breakdown.push({ position: i, fee });
    total += fee;
  }
  return { breakdown, total };
}

/**
 * Berechnet IBU-Gebühren für ein Unternehmen ohne Verbandsmitgliedschaft.
 *
 * @param {Object} customerData
 *   @param {string} customerData.companyName
 *   @param {number} customerData.membershipGroup   – 1 bis 7
 *   @param {number} customerData.existingValidEPDs – bereits gültige EPDs laut CRM
 *
 * @param {Object} answers  – Fragebogen-Antworten (Rohwerte, werden intern bereinigt)
 *   @param {number} answers.renewEPDs         – zu verlängernde EPDs
 *   @param {number} answers.newEPDs           – komplett neue EPDs
 *   @param {number} answers.newEPDsFromFamily – davon aus gleicher Produktfamilie
 *   @param {number} answers.reworkEPDs        – zu überarbeitende EPDs
 *
 * @returns {Object} Strukturiertes Ergebnisobjekt
 */
function calculateIBU(customerData, answers) {
  const membershipGroup = Number(customerData.membershipGroup);
  if (!MEMBERSHIP_FEES[membershipGroup])
    throw new Error(`Ungültige Mitgliedschaftsgruppe: ${membershipGroup}. Erlaubt: 1–7.`);

  const existingEPDs      = Math.max(0, Number(customerData.existingValidEPDs) || 0);
  const renewEPDs         = Math.max(0, Number(answers.renewEPDs)         || 0);
  const newEPDs           = Math.max(0, Number(answers.newEPDs)           || 0);
  const newEPDsFromFamily = Math.max(0, Math.min(Number(answers.newEPDsFromFamily) || 0, Math.max(0, newEPDs - 1)));
  const reworkEPDs        = Math.max(0, Number(answers.reworkEPDs)        || 0);
  const normalNewEPDs     = newEPDs - newEPDsFromFamily;

  const verificationCosts = {
    newEPDs:    { count: normalNewEPDs,     unitCost: ONE_TIME_FEES.newEPD,     total: normalNewEPDs     * ONE_TIME_FEES.newEPD,     label: 'Erstausstellung neue EPDs' },
    familyEPDs: { count: newEPDsFromFamily, unitCost: ONE_TIME_FEES.familyEPD,  total: newEPDsFromFamily * ONE_TIME_FEES.familyEPD,  label: 'Weitere EPDs gleiche Produktfamilie' },
    reworkEPDs: { count: reworkEPDs,        unitCost: ONE_TIME_FEES.reworkEPD,  total: reworkEPDs        * ONE_TIME_FEES.reworkEPD,  label: 'Überarbeitung / Aktualisierung' },
    renewEPDs:  { count: renewEPDs,         unitCost: ONE_TIME_FEES.renewalEPD, total: renewEPDs         * ONE_TIME_FEES.renewalEPD, label: 'Verlängerung bestehender EPDs' },
  };

  const totalOneTimeCosts = Object.values(verificationCosts).reduce((s, c) => s + c.total, 0);
  const totalValidEPDs    = existingEPDs + newEPDs + reworkEPDs;
  const membershipFee     = MEMBERSHIP_FEES[membershipGroup];
  const signFees          = calcSignFees(totalValidEPDs);
  const totalAnnualCosts  = membershipFee + signFees.total;

  return {
    provider:     'IBU',
    memberType:   'non-associate',
    companyName:  customerData.companyName,
    calculatedAt: new Date().toISOString(),
    inputs: { membershipGroup, existingEPDs, renewEPDs, newEPDs, newEPDsFromFamily, reworkEPDs, totalValidEPDsAfter: totalValidEPDs },
    oneTime: { items: verificationCosts, total: totalOneTimeCosts },
    annual: {
      items: {
        membershipFee: { total: membershipFee, label: `Mitgliedsbeitrag IBU (Gruppe F${membershipGroup})` },
        signFees:      { total: signFees.total, breakdown: signFees.breakdown, label: 'Zeichenentgelte (jährlich, 3-facher Satz)' },
      },
      total: totalAnnualCosts,
    },
    totalFirstYear: totalOneTimeCosts + totalAnnualCosts,
  };
}