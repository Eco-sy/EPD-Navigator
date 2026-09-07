/**
 * epdglobal-calculator.js
 * EPD-Global Gebührenrechner 
 *
 */

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

// 10Mio NOK ~ 925.695,80 € (04.09.2026)
// EPD Global hat seine Preise von NOK in € um ein Zehntel reduziert
// Dementsprechend wird die für die Kategorisierung der Mitgliedschaft
// wahrscheinlich die gleiche metric benutzt
const EPDGLOBAL_MEMBERSHIP_FEE = {
  small: 350, // <10 Mio NOK Annual Turnover (1 Mio €)
  big: 800, // >10 Mio NOK Annual Turnover (1 Mio €)
};

const ANNUAL_REGESTRATION_FEE = 480;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function getMembershipRating(yearlyRevenue){
  if (yearlyRevenue <= 1) return "small";
  return "big";
}

const oneTimeCosts = 0;
  //Platzhalter
  //EPD Global hat bisher keine Einmaligen Kosten
  //Falls sich dies ändern sollte werden diese hier berechnet

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

function calculateEPDGlobal(customerData, answers){
  const membershipType = getMembershipRating(answers.yearlyRevenue);
  const membershipFee = EPDGLOBAL_MEMBERSHIP_FEE[membershipType];
  const regestrationFee = ANNUAL_REGESTRATION_FEE;
  const newEPD = Math.max(0, Number(answers.newEPDs) || 0);
  const totalAnnualCosts = membershipFee + ANNUAL_REGESTRATION_FEE;
  const totalOneTimeCosts = oneTimeCosts;
  const totalFirstYear = totalAnnualCosts + totalOneTimeCosts;

  const projection = Array.from({length: 5}, (_, idx) => ({
    year: idx + 1,
    oneTime: idx===0 ? totalOneTimeCosts : 0,
    annual: totalAnnualCosts,
    total: (idx===0 ? totalOneTimeCosts : 0) + totalAnnualCosts,
    cumulative: totalOneTimeCosts + (totalAnnualCosts * (idx + 1))
  }));

  // return {
  //   provider: 'EPD Global',
  //   inputs: {
  //     newEPDs,
  //     membershipType,
  //   },
  //   annual: {
  //     membershipFee
  //   },
  //   totalFirstYear: membershipFee
  // }
  return {
    inputs: { membershipType, membershipFee, newEPD,},
    oneTime:  { price: totalOneTimeCosts},
    annual:   { total: totalAnnualCosts, membershipFee, regestrationFee},
    totalFirstYear: {price: totalFirstYear},
    projection,
    };
}