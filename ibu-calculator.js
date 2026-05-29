/**
 * EPD Gebührenrechner – IBU (kein Verbandsmitglied)
 * Grundlage: IBU Gebührenordnung, gültig ab 01.09.2025
 *
 * Verwendung:
 *   import { calculateIBU } from './ibu-calculator.js';
 *   const result = calculateIBU(customerData, questionnaireAnswers);
 *
 * Oder als CommonJS:
 *   const { calculateIBU } = require('./ibu-calculator.js');
 */

// ---------------------------------------------------------------------------
// Stammdaten-Struktur (wird vom CRM / Fragebogen befüllt)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CustomerData
 * Stammdaten des Kunden – werden aus dem CRM vorgeladen.
 *
 * @property {string}   companyName             – Firmenname
 * @property {number}   membershipGroup         – IBU-Beitragsgruppe F1–F7 (Jahresumsatz)
 *                                                 Erlaubte Werte: 1 | 2 | 3 | 4 | 5 | 6 | 7
 * @property {number}   existingValidEPDs       – Anzahl bereits gültiger EPDs (aus CRM)
 */

/**
 * @typedef {Object} QuestionnaireAnswers
 * Antworten aus dem Kundenfragebogen.
 *
 * @property {boolean}  masterDataConfirmed     – Stammdaten korrekt? (Ja/Nein)
 * @property {number}   renewEPDs               – Anzahl bestehender EPDs, die verlängert werden sollen
 * @property {number}   newEPDs                 – Anzahl komplett neuer EPDs
 * @property {number}   newEPDsFromFamily       – davon: EPDs aus gleicher Produktfamilie
 *                                                 (basierend auf gleichem Hintergrundbericht,
 *                                                  gleichzeitig eingereicht; max. newEPDs - 1)
 * @property {number}   reworkEPDs              – Anzahl zu überarbeitender / aktualisierender EPDs
 */

// ---------------------------------------------------------------------------
// Konstanten – IBU Gebührenordnung §1 & §2
// ---------------------------------------------------------------------------

/** Jahresbeiträge nach Firmengrößengruppe (§ Mitgliedsbeitrag, kein Verband) */
const MEMBERSHIP_FEES = {
  1: 600,
  2: 900,
  3: 1200,
  4: 1950,
  5: 3300,
  6: 4450,
  7: 5400,
};

/**
 * Zeichenentgelt-Staffel für Nicht-Verbandsmitglieder (§ 2.1.d – 3-facher Satz)
 * Index = Position der EPD (1-basiert); Position 5+ → letzter Eintrag
 */
const SIGN_FEE_TIERS = [
  { from: 1, to: 1,    fee: 2880 },
  { from: 2, to: 2,    fee: 1440 },
  { from: 3, to: 3,    fee: 720  },
  { from: 4, to: 4,    fee: 540  },
  { from: 5, to: null, fee: 360  },
];

/** Einmalige Verifizierungsgebühren (§ 1.1) */
const ONE_TIME_FEES = {
  newEPD:          2700,  // Erstausstellung (§ 1.1.a)
  familyEPD:       500,   // weitere EPD aus gleicher Produktfamilie (§ 1.1.e)
  reworkEPD:       1500,  // Überarbeitung / Aktualisierung (§ 1.1.b)
  renewalEPD:      1500,  // Verlängerung = erneute Verifizierung (§ 1.1.b)
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Zeichenentgelt für eine EPD an Position `pos` (1-basiert).
 * @param {number} pos
 * @returns {number}
 */
function getSignFee(pos) {
  for (const tier of SIGN_FEE_TIERS) {
    if (pos >= tier.from && (tier.to === null || pos <= tier.to)) {
      return tier.fee;
    }
  }
  return SIGN_FEE_TIERS[SIGN_FEE_TIERS.length - 1].fee;
}

/**
 * Berechnet die Zeichenentgelte für alle EPDs eines Kunden.
 * Die Staffel baut auf der Gesamtzahl gültiger EPDs auf.
 *
 * @param {number} totalValidEPDs – Gesamtanzahl gültiger EPDs nach dem Vorgang
 * @returns {{ breakdown: Array<{position: number, fee: number}>, total: number }}
 */
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

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Berechnet die IBU-EPD-Gebühren für ein Unternehmen ohne Verbandsmitgliedschaft.
 *
 * @param {CustomerData}          customerData
 * @param {QuestionnaireAnswers}  answers
 * @returns {CalculationResult}
 */
function calculateIBU(customerData, answers) {

  // --- Eingaben validieren & bereinigen ---
  const membershipGroup = customerData.membershipGroup;
  if (!MEMBERSHIP_FEES[membershipGroup]) {
    throw new Error(`Ungültige Mitgliedschaftsgruppe: ${membershipGroup}. Erlaubt: 1–7.`);
  }

  const existingEPDs     = Math.max(0, customerData.existingValidEPDs ?? 0);
  const renewEPDs        = Math.max(0, answers.renewEPDs        ?? 0);
  const newEPDs          = Math.max(0, answers.newEPDs          ?? 0);
  const newEPDsFromFamily = Math.max(0, Math.min(answers.newEPDsFromFamily ?? 0, Math.max(0, newEPDs - 1)));
  const reworkEPDs       = Math.max(0, answers.reworkEPDs       ?? 0);

  // Anzahl "normaler" neuer EPDs (keine Produktfamilien-Folge-EPD)
  const normalNewEPDs = newEPDs - newEPDsFromFamily;

  // --- Einmalige Kosten ---
  const verificationCosts = {
    newEPDs: {
      count:    normalNewEPDs,
      unitCost: ONE_TIME_FEES.newEPD,
      total:    normalNewEPDs * ONE_TIME_FEES.newEPD,
      label:    'Erstausstellung neue EPDs',
    },
    familyEPDs: {
      count:    newEPDsFromFamily,
      unitCost: ONE_TIME_FEES.familyEPD,
      total:    newEPDsFromFamily * ONE_TIME_FEES.familyEPD,
      label:    'Weitere EPDs gleiche Produktfamilie',
    },
    reworkEPDs: {
      count:    reworkEPDs,
      unitCost: ONE_TIME_FEES.reworkEPD,
      total:    reworkEPDs * ONE_TIME_FEES.reworkEPD,
      label:    'Überarbeitung / Aktualisierung',
    },
    renewEPDs: {
      count:    renewEPDs,
      unitCost: ONE_TIME_FEES.renewalEPD,
      total:    renewEPDs * ONE_TIME_FEES.renewalEPD,
      label:    'Verlängerung bestehender EPDs',
    },
  };

  const totalOneTimeCosts = Object.values(verificationCosts)
    .reduce((sum, c) => sum + c.total, 0);

  // --- Jährliche Kosten ---
  // Gültige EPDs nach dem Vorgang:
  // bestehend + neue + überarbeitete (Verlängerungen ersetzen bestehende, keine Netto-Änderung)
  const totalValidEPDs = existingEPDs + newEPDs + reworkEPDs;
  // Hinweis: Verlängerungen (renewEPDs) erhalten bestehende EPDs, ändern die Gesamtzahl nicht.

  const membershipFee = MEMBERSHIP_FEES[membershipGroup];
  const signFees      = calcSignFees(totalValidEPDs);

  const annualCosts = {
    membershipFee: {
      total: membershipFee,
      label: `Mitgliedsbeitrag IBU (Gruppe F${membershipGroup})`,
    },
    signFees: {
      total:     signFees.total,
      breakdown: signFees.breakdown,
      label:     'Zeichenentgelte (jährlich, 3-facher Satz)',
    },
  };

  const totalAnnualCosts = membershipFee + signFees.total;

  // --- Ergebnis zusammenstellen ---
  return {
    /** Metadaten */
    provider:     'IBU',
    memberType:   'non-associate',
    companyName:  customerData.companyName,
    calculatedAt: new Date().toISOString(),

    /** Eingaben (bereinigt) */
    inputs: {
      membershipGroup,
      existingEPDs,
      renewEPDs,
      newEPDs,
      newEPDsFromFamily,
      reworkEPDs,
      totalValidEPDsAfter: totalValidEPDs,
    },

    /** Einmalige Kosten */
    oneTime: {
      items: verificationCosts,
      total: totalOneTimeCosts,
    },

    /** Jährliche Kosten */
    annual: {
      items: annualCosts,
      total: totalAnnualCosts,
    },

    /** Gesamtkosten Jahr 1 (einmalig + erste Jahresgebühren) */
    totalFirstYear: totalOneTimeCosts + totalAnnualCosts,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// ESM
export { calculateIBU, MEMBERSHIP_FEES, SIGN_FEE_TIERS, ONE_TIME_FEES };

// CommonJS (Node.js ohne ESM-Flag)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateIBU, MEMBERSHIP_FEES, SIGN_FEE_TIERS, ONE_TIME_FEES };
}
