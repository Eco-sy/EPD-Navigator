/**
 * script.js – EPD Navigator
 * Fragebogen-Engine + IBU Gebührenberechnung
 *
 * Datenquellen:
 *   customer.json      → Stammdaten (simuliert CRM-Profil)
 *   fragenkatalog.json → EPD-Fragen (Verlängerungen, neue EPDs, Produktfamilie)
 *   ibu-calculator.js  → Berechnungslogik (muss vor script.js geladen sein)
 */

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
let questions             = {};
let customerData          = {};   // wird aus customer.json geladen
let answers               = {};
let currentQuestion       = "start";
let questionQueue         = [];
let questionnaireFinished = false;

// ---------------------------------------------------------------------------
// Fragebogen-Engine  (unverändert zu deiner ursprünglichen Logik)
// ---------------------------------------------------------------------------
function getNextQuestionId(question, option) {
  const nextId = option?.nextQuestionID ?? question?.nextQuestionID ?? null;
  if (Array.isArray(nextId)) {
    questionQueue = nextId.slice(1);
    return nextId[0] ?? null;
  }
  if (questionQueue.length > 0) return questionQueue.shift();
  return nextId;
}

function showQuestion() {
  const container    = document.getElementById("question-container");
  const submitButton = document.getElementById("submit-button");
  container.innerHTML = "";
  submitButton.disabled = true;

  const q = questions[currentQuestion];
  if (!q || currentQuestion === null || currentQuestion === "ENDE") {
    questionnaireFinished = true;
    container.appendChild(renderResult());
    submitButton.disabled = false;
    return;
  }

  const div   = document.createElement("div");
  const label = document.createElement("p");
  label.innerText = q.text || "Frage nicht gefunden";
  div.appendChild(label);

  if (q.hint) {
    const hint = document.createElement("p");
    hint.style.cssText = "font-size:0.875rem; color:#64748b; font-weight:400; margin:0;";
    hint.innerText = q.hint;
    div.appendChild(hint);
  }

  const type = q.type || "select";

  if (type === "select") {
    (q.options || []).forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "answer-button";
      btn.innerText = opt.label;
      btn.onclick = () => {
        answers[currentQuestion] = opt.value !== undefined ? opt.value : opt.label;
        currentQuestion = getNextQuestionId(q, opt);
        showQuestion();
      };
      div.appendChild(btn);
    });
  }

  if (type === "number" || type === "text") {
    const inputRow = document.createElement("div");
    inputRow.className = "input-row";

    const input = document.createElement("input");
    input.type = type;
    if (type === "number") { input.min = "0"; input.value = "0"; }
    if (currentQuestion === "extendEPD") {input.max = customerData.existingValidEPDs;}

    const btn = document.createElement("button");
    btn.innerText = "Weiter";
    btn.onclick = () => {
      if (input.value === "") { alert("Bitte eine Antwort eingeben."); return; }
      answers[currentQuestion] = input.value;
      currentQuestion = getNextQuestionId(q);
      showQuestion();
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });

    inputRow.appendChild(input);
    inputRow.appendChild(btn);
    div.appendChild(inputRow);
  }

  container.appendChild(div);
}

// ---------------------------------------------------------------------------
// Fragebogen-Antworten → calculateIBU-Eingaben mappen
//
// Fragebogen liefert z.B.:
//   { start:"Ja", existingDATA:"Ja", existingEPD:"Beides", extendEPD:"2",
//     newEPD:"3", familyEPD:"1" }
//
// customerData kommt aus customer.json und enthält:
//   { companyName, membershipGroup, existingValidEPDs }
// ---------------------------------------------------------------------------
function mapToCalculatorInput() {
  return {
    renewEPDs:         Number(answers.extendEPD) || 0,
    newEPDs:           Number(answers.newEPD)    || 0,
    newEPDsFromFamily: Number(answers.familyEPD) || 0,
    reworkEPDs:        0,   // noch kein Fragebogen-Feld; bei Bedarf ergänzen
  };
}

// ---------------------------------------------------------------------------
// Ergebnis-Seite rendern
// ---------------------------------------------------------------------------
function renderResult() {
  const fmt = n =>
    new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n);

  const wrapper = document.createElement("div");
  wrapper.className = "summary-page";

  // ── Antwortzusammenfassung ──────────────────────────────────────────────
  const summaryHeader = document.createElement("div");
  summaryHeader.className = "summary-header";
  summaryHeader.innerHTML = `
    <p>Fragebogen abgeschlossen</p>
    <p>Ihre Antworten im Überblick.</p>`;
  wrapper.appendChild(summaryHeader);

  const summaryList = document.createElement("div");
  summaryList.className = "summary-list";
  Object.entries(answers).forEach(([qId, val]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `
      <p class="summary-question">${questions[qId]?.text || qId}</p>
      <div class="summary-answer">${String(val)}</div>`;
    summaryList.appendChild(item);
  });
  wrapper.appendChild(summaryList);

  // ── Prüfen ob Berechnung sinnvoll ist ──────────────────────────────────
  // Berechnung nur wenn mindestens eine EPD-Angabe gemacht wurde
  const calcInput = mapToCalculatorInput();
  const hasEPDInput = calcInput.renewEPDs > 0 || calcInput.newEPDs > 0;

  if (!hasEPDInput) {
    const note = document.createElement("p");
    note.style.cssText = "color:#64748b; font-size:0.9rem; margin-top:16px;";
    note.innerText = "Keine Gebührenberechnung – es wurden keine EPDs angegeben.";
    wrapper.appendChild(note);
    return wrapper;
  }

  // ── Gebührenberechnung ──────────────────────────────────────────────────
  let result;
  try {
    result = calculateIBU(customerData, calcInput);
  } catch (err) {
    const errMsg = document.createElement("p");
    errMsg.style.color = "red";
    errMsg.innerText = "Fehler bei der Berechnung: " + err.message;
    wrapper.appendChild(errMsg);
    return wrapper;
  }

  const i = result.inputs;

const costSection = document.createElement("details");
costSection.className = "provider-box";
costSection.open = false; // erste/einzige Box standardmäßig zugeklappt
costSection.innerHTML = `
  <summary class="provider-summary">
    <span>
      <span class="provider-summary-title">IBU EPD-Programm</span><br>
      <span class="provider-summary-sub">
        ${result.companyName}${i.membershipGroup ? ` · Mitgliedsgruppe F${i.membershipGroup}` : ''}
        · ${i.membershipType === 'associate' ? 'Verbandsmitglied' : 'Kein Verbandsmitglied'}
      </span>
    </span>
    <span class="provider-summary-total">${fmt(result.totalFirstYear)}</span>
  </summary>
  <div class="provider-content">
    <p style="color:#94a3b8; margin:0 0 20px; font-size:0.8rem;">
      Netto zzgl. 19 % MwSt. · Gebührenordnung ab 01.09.2025
    </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px;">
        ${metricCard("Einmalige Kosten",  fmt(result.oneTime.total),  "Verifizierung & Bearbeitung")}
        ${metricCard("Jährliche Kosten",  fmt(result.annual.total),   "Mitglied + Zeichenentgelte")}
        ${metricCard("Gesamt Jahr 1",     fmt(result.totalFirstYear), "Einmalig + erste Jahresgebühren")}
        ${metricCard("EPDs nach Vorgang", i.totalValidEPDsAfter,      "Gültige Deklarationen")}
      </div>

      <div class="summary-item" style="margin-bottom:14px;">
        <p class="summary-question" style="margin-bottom:12px;">Einmalige Kosten (Verifizierung)</p>
        ${costTable(
          Object.values(result.oneTime.items)
            .filter(x => x.count > 0)
            .map(x => [`${x.label} (${x.count} × ${fmt(x.unitCost)})`, fmt(x.total)]),
          ["Summe einmalig", fmt(result.oneTime.total)]
        )}
      </div>

      <div class="summary-item" style="margin-bottom:14px;">
        <p class="summary-question" style="margin-bottom:12px;">Jährliche Kosten</p>
        ${costTable([
          [
            result.annual.items.membershipFee.label,
            result.annual.items.membershipFee.billedExternally ? '—' : fmt(result.annual.items.membershipFee.total)
          ],
          ...result.annual.items.signFees.breakdown.map(({ position, fee }) =>
            [`Zeichenentgelt EPD ${position}`, fmt(fee) + " / Jahr"]
          ),
        ], ["Summe jährlich", fmt(result.annual.total)])}
      </div>

      <div class="summary-item" style="border:2px solid #2563eb;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px;">
          <span style="font-weight:700; font-size:1rem; color:#0f172a;">Gesamt Jahr 1 (netto)</span>
          <span style="font-weight:700; font-size:1.4rem; color:#2563eb;">${fmt(result.totalFirstYear)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:6px; color:#64748b; font-size:0.875rem;">
          <span>inkl. 19 % MwSt.</span>
          <span>${fmt(result.totalFirstYear * 1.19)}</span>
        </div>
      </div>
    </div>`;

  wrapper.appendChild(costSection);
  // ── Environdec ────────────────────────────────────────────────────────────
  let resultEnv;
  try {
    resultEnv = calculateEnvirondec(customerData, calcInput);
  } catch (err) {
    const errMsg = document.createElement("p");
    errMsg.style.cssText = "color:red; margin-top:12px;";
    errMsg.innerText = "Environdec – Fehler bei der Berechnung: " + err.message;
    wrapper.appendChild(errMsg);
    return wrapper;
  }

  const iEnv = resultEnv.inputs;
  const membershipTypeLabels = { micro: 'Micro Business', sme: 'Small & Medium Business', multinational: 'Multinational Business' };

  const costSectionEnv = document.createElement("details");
  costSectionEnv.className = "provider-box";
  costSectionEnv.open = false; // zweite Box standardmäßig zugeklappt
  costSectionEnv.innerHTML = `
    <summary class="provider-summary">
      <span>
        <span class="provider-summary-title">Environdec</span><br>
        <span class="provider-summary-sub">
          ${resultEnv.companyName} · ${membershipTypeLabels[iEnv.membershipType]}
        </span>
      </span>
      <span class="provider-summary-total">${fmt(resultEnv.totalFirstYear)}</span>
    </summary>
    <div class="provider-content">
      <p style="color:#94a3b8; margin:0 0 20px; font-size:0.8rem;">
        Netto zzgl. MwSt.
      </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px;">
        ${metricCard("Einmalige Kosten",  fmt(resultEnv.oneTime.total),  "Verifizierung (gestaffelt)")}
        ${metricCard("Jährliche Kosten",  fmt(resultEnv.annual.total),   "Jahresmitgliedschaft")}
        ${metricCard("Gesamt Jahr 1",     fmt(resultEnv.totalFirstYear), "Einmalig + erste Jahresgebühren")}
        ${metricCard("EPDs nach Vorgang", iEnv.totalValidEPDsAfter,      "Gültige Deklarationen")}
      </div>

      <div class="summary-item" style="margin-bottom:14px;">
        <p class="summary-question" style="margin-bottom:12px;">Einmalige Kosten (Verifizierung)</p>
        ${costTable([
          ...resultEnv.oneTime.newEPDs.breakdown.map(({ position, fee }) =>
            [`Neue EPD (Position ${position})`, fmt(fee)]
          ),
          ...resultEnv.oneTime.renewEPDs.breakdown.map(({ position, fee }) =>
            [`Verlängerung (Position ${position})`, fmt(fee)]
          ),
        ], ["Summe einmalig", fmt(resultEnv.oneTime.total)])}
      </div>

      <div class="summary-item" style="margin-bottom:14px;">
        <p class="summary-question" style="margin-bottom:12px;">Jährliche Kosten</p>
        ${costTable([
          [resultEnv.annual.membershipFee.label, fmt(resultEnv.annual.membershipFee.total)],
        ], ["Summe jährlich", fmt(resultEnv.annual.total)])}
      </div>

      <div class="summary-item" style="border:2px solid #2563eb;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px;">
          <span style="font-weight:700; font-size:1rem; color:#0f172a;">Gesamt Jahr 1 (netto)</span>
          <span style="font-weight:700; font-size:1.4rem; color:#2563eb;">${fmt(resultEnv.totalFirstYear)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:6px; color:#64748b; font-size:0.875rem;">
          <span>inkl. MwSt.</span>
          <span>Steuersatz abhängig vom Land</span>
        </div>
      </div>
    </div>`;

  wrapper.appendChild(costSectionEnv);
  return wrapper;
}

function metricCard(label, value, sub) {
  return `
    <div class="summary-item" style="text-align:center;">
      <p style="margin:0 0 4px; font-size:0.75rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">${label}</p>
      <p style="margin:0 0 2px; font-size:1.25rem; font-weight:700; color:#0f172a;">${value}</p>
      <p style="margin:0; font-size:0.75rem; color:#94a3b8;">${sub}</p>
    </div>`;
}

function costTable(rows, totalRow) {
  const rowsHtml = rows.map(([l, v]) => `
    <tr>
      <td style="padding:5px 0; color:#475569; font-size:0.875rem;">${l}</td>
      <td style="padding:5px 0; text-align:right; font-size:0.875rem;">${v}</td>
    </tr>`).join("");
  return `
    <table style="width:100%; border-collapse:collapse;">
      ${rowsHtml}
      <tr style="border-top:1px solid #e2e8f0;">
        <td style="padding:8px 0 0; font-weight:700; color:#0f172a;">${totalRow[0]}</td>
        <td style="padding:8px 0 0; text-align:right; font-weight:700; color:#0f172a;">${totalRow[1]}</td>
      </tr>
    </table>`;
}

// ---------------------------------------------------------------------------
// Absenden
// ---------------------------------------------------------------------------
function submitAnswers() {
  if (!questionnaireFinished) {
    alert("Bitte beantworten Sie zuerst alle Fragen.");
    return;
  }
  const entry = {
    timestamp:   new Date().toISOString(),
    customerData,
    answers,
    calculation: calculateIBU(customerData, mapToCalculatorInput()),
  };
  const stored = JSON.parse(localStorage.getItem("fragebogenAntworten") || "[]");
  stored.push(entry);
  localStorage.setItem("fragebogenAntworten", JSON.stringify(stored, null, 2));
  console.log("Gespeicherter Eintrag:", entry);
  alert("Antworten und Gebührenberechnung wurden gespeichert.");
}

// ---------------------------------------------------------------------------
// Laden – beide Quellen parallel fetchen
// ---------------------------------------------------------------------------
async function loadData() {
  try {
    const [questionsRes, customerRes] = await Promise.all([
      fetch("./fragenkatalog.json"),
      fetch("./customer.json"),
    ]);
    if (!questionsRes.ok) throw new Error(`fragenkatalog.json: ${questionsRes.status}`);
    if (!customerRes.ok)  throw new Error(`customer.json: ${customerRes.status}`);

    questions    = await questionsRes.json();
    customerData = await customerRes.json();

  } catch (error) {
    document.getElementById("question-container").innerHTML =
      `<p style="color:red;">${error.message}</p>`;
    console.error(error);
    return;
  }
  showQuestion();
}

window.addEventListener("DOMContentLoaded", loadData);
