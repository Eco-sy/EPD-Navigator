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
// let customerData          = {};   // wird aus customer.json geladen
let answers               = {};
let currentQuestion       = "start";
let questionQueue         = [];
let questionnaireFinished = false;
let questionHistory = [];

// ---------------------------------------------------------------------------
// Fragebogen-Engine
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

function restartQuestionnaire() {
  answers = {};
  currentQuestion = "start";
  questionQueue = [];
  questionnaireFinished = false;
  questionHistory = [];
  showStartScreen();
}

function showStartScreen() {
  const container = document.getElementById("question-container");
  container.innerHTML = "";

  const div = document.createElement("div");
  div.innerHTML = `
    <p>Willkommen beim EPD Kostenvergleich</p>
    <p style="font-weight:400; font-size:0.95rem; color:#64748b;">
      Beantworten Sie einige kurze Fragen und erhalten Sie eine individuelle
      Gebührenaufstellung für die Veröffentlichung oder Verlängerung Ihrer EPDs –
      für IBU, EPD International und EPD Hub im Vergleich.
    </p>
    <button class="answer-button" id="start-btn">Jetzt starten →</button>
  `;
  div.querySelector("#start-btn").addEventListener("click", showQuestion);

  container.appendChild(div);
}

function resolveValidationValue(value, answers, fallback = null) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const raw = answers[value.answerKey];
    const parsed = Number(raw);
    const baseValue = Number.isFinite(parsed) ? parsed : (value.fallback ?? fallback ?? 0);
    const cap = value.cap ?? null;
    return cap !== null && Number.isFinite(cap) ? Math.min(baseValue, cap) : baseValue;
  }

  return value ?? fallback;
}

function getInputValidation(question, answers) {
  const validation = question?.validation || {};
  const min = resolveValidationValue(validation.min, answers, validation.allowZero === false ? 1 : 0);
  const max = resolveValidationValue(validation.max, answers, null);
  return { ...validation, min, max };
}

function isInputValueValid(input, validation) {
  const rawValue = input.value.trim();
  if (rawValue === "") return false;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return false;
  if (validation.integer && !Number.isInteger(value)) return false;
  if (validation.min !== undefined && value < validation.min) return false;
  if (validation.max !== undefined && value > validation.max) return false;
  if (validation.allowZero === false && value === 0) return false;
  return true;
}

function getValidationMessage(validation) {
  const parts = [];
  if (validation.min !== undefined) parts.push(`mindestens ${validation.min}`);
  if (validation.max !== undefined) parts.push(`höchstens ${validation.max}`);

  const rangeText = parts.length > 0 ? ` (${parts.join(" und ")})` : "";
  return validation.integer
    ? `Bitte geben Sie eine ganze Zahl${rangeText} ein.`
    : `Bitte geben Sie einen gültigen Wert${rangeText} ein.`;
}

function showQuestion() {
  const container    = document.getElementById("question-container");
  // const submitButton = document.getElementById("submit-button");
  container.innerHTML = "";
  // submitButton.disabled = true;

  const q = questions[currentQuestion];
  if (!q || currentQuestion === null || currentQuestion === "ENDE") {
    questionnaireFinished = true;
    container.appendChild(renderResult());
    // submitButton.disabled = false;
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
        questionHistory.push(currentQuestion);
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
  const validation = getInputValidation(q, answers);

  if (type === "number") {
    input.min = String(validation.min ?? 0);
    input.step = validation.integer ? "1" : "any";
    input.inputMode = validation.integer ? "numeric" : "decimal";
    input.value = "";
    if (validation.max !== undefined) input.max = String(validation.max);
  }

  const continueBtn = document.createElement("button");
  continueBtn.className = "input-action-button";
  continueBtn.disabled = !isInputValueValid(input, validation);
  continueBtn.innerText = "Weiter";

  const feedback = document.createElement("p");
  feedback.className = "input-feedback";

  const updateButtonState = () => {
    const isValid = isInputValueValid(input, validation);
    input.classList.toggle("is-valid", isValid);
    input.classList.toggle("is-invalid", !isValid && input.value !== "");
    continueBtn.classList.toggle("is-valid", isValid);
    continueBtn.classList.toggle("is-invalid", !isValid && input.value !== "");
    feedback.textContent = isValid || input.value === "" ? "" : getValidationMessage(validation);
    feedback.style.color = isValid ? "#64748b" : "#dc2626";
    if (isValid){
      continueBtn.disabled = false;
    } else {
      continueBtn.disabled = true;
    }
  };

  continueBtn.onclick = () => {
    if (!isInputValueValid(input, validation)) {
      updateButtonState();
      alert(getValidationMessage(validation));
      return;
    }

    questionHistory.push(currentQuestion);
    answers[currentQuestion] = input.value;
    currentQuestion = getNextQuestionId(q);
    showQuestion();
  };

  input.addEventListener("input", updateButtonState);
  input.addEventListener("change", updateButtonState);
  input.addEventListener("keydown", e => { if (e.key === "Enter") continueBtn.click(); });

  inputRow.appendChild(input);
  inputRow.appendChild(continueBtn);
  inputRow.appendChild(feedback);
  div.appendChild(inputRow);
  updateButtonState();
}


  const backBtn = document.createElement("button");
  backBtn.className = "back-button";
  backBtn.innerText = "← Zurück";
  backBtn.disabled = questionHistory.length === 0;
  backBtn.onclick = () => {
    if (questionHistory.length === 0) return;
    currentQuestion = questionHistory.pop();
    showQuestion();
  };

  const skipBtn = document.createElement("button");
  skipBtn.className = "back-button skip-button";
  skipBtn.innerText = "Frage Überspringen";
  skipBtn.disabled = questionHistory.length === 0;
  skipBtn.onclick = () => {
    answers[currentQuestion] = q.skipValue;
    questionHistory.push(currentQuestion);
    currentQuestion = q.skipNext ?? q.nextQuestionID ?? null;
    console.log(answers);
    showQuestion();
  };

  const navrow = document.createElement("div");
  navrow.appendChild(backBtn);
  navrow.appendChild(skipBtn);
  div.appendChild(navrow);

  container.appendChild(div);
}

// ---------------------------------------------------------------------------
// Stammdaten aus Fragebogen-Antworten ableiten
// ---------------------------------------------------------------------------
function buildCustomerData() {
  return {
    companyName:              "",
    membershipType:           answers.ibuMembershipType || "non-associate",
    membershipGroup:          Number(assessIbuMembership()) || null,
    environdecMembershipType: assessEnvirondecMembership() || "sme",
    existingValidEPDs:        Number(answers.existingValidEPDs) || Number(answers.renewCount) || 0,
  };
}

function assessIbuMembership() {
  const revenue = Number(answers.yearlyRevenue);

  if (revenue <= 1) return "1"; // bis 1 Mio F1
  if (revenue <= 3) return "2"; // bis 3 Mio F2
  if (revenue <= 10) return "3"; // bis 10 Mio F3
  if (revenue <= 30) return "4"; // bis 30 Mio F4
  if (revenue <= 100) return "5"; // bis 100 Mio F5
  if (revenue <= 300) return "6"; // bis 300 Mio F6
  return "7"; // über 300 Mio F7
}

function assessEnvirondecMembership() {
  const employees = answers.amountEmployees;

  if (employees <= 10) return "micro"; // 1-10 Mitarbeiter
  if (employees <= 250) return "sme"; // 11-250 Mitarbeiter
  return "multinational"; // Über 250 Mitarbeiter
}

// ---------------------------------------------------------------------------
// Fragebogen-Antworten → calculateIBU/calculateEnvirondec/EPD International-Eingaben mappen
// ---------------------------------------------------------------------------
function mapToCalculatorInput() {
  return {
    renewEPDs:         Number(answers.renewCount)   || 0,
    newEPDs:           Number(answers.newEPDCount)  || 0,
    newEPDsFromFamily: Number(answers.familyEPD)    || 0,
    reworkEPDs:        0,
    epdHubComplexity:  answers.epdHubComplexity,
  };
}

// ---------------------------------------------------------------------------
// Screenshot erstellen
// ---------------------------------------------------------------------------
function downloadResultScreenshot() {
  const target = document.querySelector(".summary-page");
  if (!target) return;

  const btn = document.getElementById("download-screenshot-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Wird erstellt…";
  }

  if (typeof html2canvas === "undefined") {
    alert("Screenshot-Funktion ist momentan nicht verfügbar.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Screenshot herunterladen";
    }
    return;
  }

  html2canvas(target, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true
  })
    .then(canvas => {
      const link = document.createElement("a");
      link.download = "epd-ergebnis.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    })
    .catch(err => {
      console.error("Screenshot fehlgeschlagen:", err);
      alert("Der Screenshot konnte nicht erstellt werden.");
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Screenshot herunterladen";
      }
    });
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
  // const summaryHeader = document.createElement("div");
  // summaryHeader.className = "summary-header";
  // summaryHeader.innerHTML = `
  //   <p>Fragebogen abgeschlossen</p>
  //   <p>Ihre Antworten im Überblick.</p>`;
  // wrapper.appendChild(summaryHeader);

  // const summaryList = document.createElement("div");
  // summaryList.className = "summary-list";
  // Object.entries(answers).forEach(([qId, val]) => {
  //   const item = document.createElement("div");
  //   item.className = "summary-item";
  //   item.innerHTML = `
  //     <p class="summary-question">${questions[qId]?.text || qId}</p>
  //     <div class="summary-answer">${String(val)}</div>`;
  //   summaryList.appendChild(item);
  // });
  // wrapper.appendChild(summaryList);

  // ── Prüfen ob Berechnung sinnvoll ist ──────────────────────────────────
  // Berechnung nur wenn mindestens eine EPD-Angabe gemacht wurde
  const calcInput = mapToCalculatorInput();
  const hasEPDInput = calcInput.renewEPDs > 0 || calcInput.newEPDs > 0;

  if (!hasEPDInput) {
    const note = document.createElement("p");
    note.style.cssText = "color:#64748b; font-size:0.9rem; margin-top:16px;";
    note.innerText = "Keine Gebührenberechnung – es wurden keine EPDs angegeben.";
    wrapper.appendChild(note);
    // return wrapper;
  }

  // ── Gebührenberechnung ──────────────────────────────────────────────────
  const customerData = buildCustomerData();
  // ── IBU ────────────────────────────────────────────────────────────
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
  if(result){
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
        <span class="provider-summary-total"><span style="color:#F252A7;">${fmt(result.oneTime.total)}</span> + ${fmt(result.projection[result.projection.length - 1].cumulative - result.oneTime.total)} *</span>
      </summary>
      <div class="provider-content">
        <p class="provider-meta">
          Netto zzgl. 19 % MwSt. · Gebührenordnung ab 01.09.2025
        </p>

          <div class="metric-grid">
            ${metricCard("Einmalige Kosten",  `<span style="color:#F252A7;">${fmt(result.oneTime.total)}</span>`,  "Verifizierung & Bearbeitung")}
            ${metricCard("Jährliche Kosten",  fmt(result.annual.total),   "Mitglied + Zeichenentgelte")}
            ${metricCard("Gesamt Jahr 1",     fmt(result.totalFirstYear), "Einmalig + erste Jahresgebühren")}
            ${metricCard("EPDs nach Vorgang", i.totalValidEPDsAfter,      "Gültige Deklarationen")}
          </div>

          <div class="summary-item cost-section">
            <p class="cost-section-title">Einmalige Kosten (Verifizierung)</p>
            ${costTable(
              Object.values(result.oneTime.items)
                .filter(x => x.count > 0)
                .map(x => [`${x.label} (${x.count} × ${fmt(x.unitCost)})`, fmt(x.total)]),
              ["Summe einmalig", fmt(result.oneTime.total)]
            )}
          </div>

          <div class="summary-item cost-section">
            <p class="cost-section-title">Jährliche Kosten</p>
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

          <div class="summary-item cost-section">
            <p class="cost-section-title">5-Jahres-Projektion</p>
            ${projectionTable(result.projection)}
          </div>      

          <div class="summary-item total-box">
            <div class="total-box-row">
              <span class="total-box-label">Gesamt Jahr 1 (netto)</span>
              <span class="total-box-amount">${fmt(result.totalFirstYear)}</span>
            </div>
            <div class="total-box-vat">
              <span>inkl. 19 % MwSt.</span>
              <span>${fmt(result.totalFirstYear * 1.19)}</span>
            </div>
          </div>
        </div>`;
    wrapper.appendChild(costSection);
  }

  // ── Environdec ────────────────────────────────────────────────────────────
  let resultEnv;
  try {
    resultEnv = calculateEnvirondec(customerData, calcInput);
  } catch (err) {
    const errMsg = document.createElement("p");
    errMsg.style.cssText = "color:red; margin-top:12px;";
    errMsg.innerText = "EPD International – Fehler bei der Berechnung: " + err.message;
    wrapper.appendChild(errMsg);
    // return wrapper;
  }

  if(resultEnv){
    const iEnv = resultEnv.inputs;
    const membershipTypeLabels = { micro: 'Micro Business', sme: 'Small & Medium Business', multinational: 'Multinational Business' };

    const costSectionEnv = document.createElement("details");
    costSectionEnv.className = "provider-box";
    costSectionEnv.open = false; // zweite Box standardmäßig zugeklappt
    costSectionEnv.innerHTML = `
      <summary class="provider-summary">
        <span>
          <span class="provider-summary-title">EPD International</span><br>
          <span class="provider-summary-sub">
            ${resultEnv.companyName} · ${membershipTypeLabels[iEnv.membershipType]}
          </span>
        </span>
        <span class="provider-summary-total">${fmt(resultEnv.projection[result.projection.length - 1].cumulative)}</span>
      </summary>
      <div class="provider-content">
        <p class="provider-meta">
          Netto zzgl. MwSt.
        </p>

        <div class="metric-grid">
          ${metricCard("Einmalige Kosten",  fmt(resultEnv.oneTime.total))}
          ${metricCard("Jährliche Kosten",  fmt(resultEnv.annual.total),   "Jahresmitgliedschaft")}
          ${metricCard("Gesamt Jahr 1",     fmt(resultEnv.totalFirstYear), "Einmalig + erste Jahresgebühren")}
          ${metricCard("EPDs nach Vorgang", iEnv.totalValidEPDsAfter,      "Gültige Deklarationen")}
        </div>

        <div class="summary-item cost-section">
          <p class="cost-section-title">Einmalige Kosten</p>
          ${costTable([
            ...resultEnv.oneTime.newEPDs.breakdown.map(({ position, fee }) =>
              [`Neue EPD (Position ${position})`, fmt(fee)]
            ),
            ...resultEnv.oneTime.renewEPDs.breakdown.map(({ position, fee }) =>
              [`Verlängerung (Position ${position})`, fmt(fee)]
            ),
          ], ["Summe einmalig", fmt(resultEnv.oneTime.total)])}
        </div>

        <div class="summary-item cost-section">
          <p class="cost-section-title">Jährliche Kosten</p>
          ${costTable([
            [resultEnv.annual.membershipFee.label, fmt(resultEnv.annual.membershipFee.total)],
          ], ["Summe jährlich", fmt(resultEnv.annual.total)])}
        </div>
        
        <div class="summary-item cost-section">
          <p class="cost-section-title">5-Jahres-Projektion</p>
          ${projectionTable(resultEnv.projection)}
        </div>      

        <div class="summary-item total-box">
          <div class="total-box-row">
            <span class="total-box-label">Gesamt Jahr 1 (netto)</span>
            <span class="total-box-amount">${fmt(resultEnv.totalFirstYear)}</span>
          </div>
          <div class="total-box-vat">
            <span>inkl. MwSt.</span>
            <span>Steuersatz abhängig vom Land</span>
          </div>
        </div>
      </div>`;

    wrapper.appendChild(costSectionEnv);
  }
  // ── EPD Hub ───────────────────────────────────────────────────────────────
  let resultHub;
  try {
    const epdHubCount = calcInput.newEPDs > 0 ? calcInput.newEPDs : calcInput.renewEPDs;
    resultHub = calculateEPDHub(customerData, {
      epdHubComplexity: answers.epdHubComplexity,
      newEPDs:          epdHubCount,
    });
  } catch (err) {
    const errMsg = document.createElement("p");
    errMsg.style.cssText = "color:red; margin-top:12px;";
    errMsg.innerText = "EPD Hub – Fehler bei der Berechnung: " + err.message;
    wrapper.appendChild(errMsg);
    // return wrapper;
  }
 
  if (resultHub){
    const costSectionHub = document.createElement("details");
    costSectionHub.className = "provider-box";
    costSectionHub.open = false;
    costSectionHub.innerHTML = `
      <summary class="provider-summary">
        <span>
          <span class="provider-summary-title">EPD Hub</span><br>
          <span class="provider-summary-sub">
            ${resultHub.package.label}
          </span>
        </span>
        <span class="provider-summary-total">${fmt(resultHub.projection[result.projection.length - 1].cumulative)}</span>
      </summary>
      <div class="provider-content">
        <p class="provider-meta">
          Netto zzgl. MwSt. · Paketpreis inkl. Verifizierung & Publishing
        </p>
  
        <div class="metric-grid">
          ${metricCard("Paketpreis",       fmt(resultHub.package.price),       resultHub.package.label)}
          ${metricCard("Ø pro EPD",        fmt(resultHub.package.pricePerEPD), "bei " + resultHub.inputs.packageStep + " EPDs im Paket")}
          ${metricCard("Neue EPDs",        resultHub.inputs.newEPDs,           "Angefragte Menge")}
          ${metricCard("Jährliche Kosten", "—",                                "Kein Mitgliedsbeitrag")}
        </div>
  
        <div class="summary-item cost-section">
          <p class="cost-section-title">Paketdetails</p>
          ${costTable([
            ["Produkttyp",      resultHub.inputs.complexity === "simple" ? "Simple Product" : "Complex Product"],
            ["Angefragte EPDs", resultHub.inputs.newEPDs],
            ["Paketstufe",      "bis " + resultHub.inputs.packageStep + " EPDs"],
          ], ["Paketpreis gesamt", fmt(resultHub.package.price)])}
        </div>
  
        <div class="summary-item note-box">
          <p>${resultHub.package.note}</p>
        </div>

        <div class="summary-item cost-section">
          <p class="cost-section-title">5-Jahres-Projektion</p>
          ${projectionTable(resultHub.projection)}
        </div>      

        <div class="summary-item total-box">
          <div class="total-box-row">
            <span class="total-box-label">Gesamtpreis (netto)</span>
            <span class="total-box-amount">${fmt(resultHub.totalFirstYear)}</span>
          </div>
          <div class="total-box-vat">
            <span>inkl. MwSt.</span>
            <span>Steuersatz abhängig vom Land</span>
          </div>
        </div>
      </div>`;
  
    wrapper.appendChild(costSectionHub);
  }

  const actionRow = document.createElement("div");
  actionRow.className = "result-actions";

  const screenshotBtn = document.createElement("button");
  screenshotBtn.id = "download-screenshot-btn";
  screenshotBtn.setAttribute("data-html2canvas-ignore", "");
  screenshotBtn.className = "back-button";
  screenshotBtn.innerText = "Screenshot herunterladen";
  screenshotBtn.onclick = downloadResultScreenshot;
  actionRow.appendChild(screenshotBtn);

  const restartBtn = document.createElement("button");
  restartBtn.className = "back-button";
  restartBtn.innerText = "Neustart";
  restartBtn.setAttribute("data-html2canvas-ignore", "");
  restartBtn.onclick = restartQuestionnaire;
  actionRow.appendChild(restartBtn);

  wrapper.appendChild(actionRow);
  return wrapper;
}

function metricCard(label, value, sub) {
  return `
    <div class="summary-item metric-card">
      <p class="metric-card-label">${label}</p>
      <p class="metric-card-value">${value}</p>
      <p class="metric-card-sub">${sub}</p>
    </div>`;
}

function costTable(rows, totalRow) {
  const rowsHtml = rows.map(([l, v]) => `
    <tr>
      <td>${l}</td>
      <td>${v}</td>
    </tr>`).join("");
  return `
    <table class="cost-table">
      ${rowsHtml}
      <tr class="cost-table-total">
        <td>${totalRow[0]}</td>
        <td>${totalRow[1]}</td>
      </tr>
    </table>`;
}

function projectionTable(projection) {
  const fmt = n => n === 0 ? "—"
    : new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n);

  const rows = projection.map(row => `
    <tr>
      <td>Jahr ${row.year}</td>
      <td>${fmt(row.oneTime)}</td>
      <td>${fmt(row.annual)}</td>
      <td class="col-total">${fmt(row.total)}</td>
      <td class="col-cumulative">${fmt(row.cumulative)}</td>
    </tr>`).join("");

  return `
    <table class="projection-table">
      <thead>
        <tr>
          <th></th>
          <th>Einmalig</th>
          <th>Jährlich</th>
          <th>Gesamt</th>
          <th>Kumuliert</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
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
  
  const customerData = buildCustomerData();
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
    // const [questionsRes, customerRes] = await Promise.all([
    //   fetch("./fragenkatalog.json"),
    //   fetch("./customer.json"),
    // ]);
    // if (!questionsRes.ok) throw new Error(`fragenkatalog.json: ${questionsRes.status}`);
    // if (!customerRes.ok)  throw new Error(`customer.json: ${customerRes.status}`);

    // questions    = await questionsRes.json();
    // customerData = await customerRes.json();
    const res = await fetch("./fragenkatalog.json");
    if (!res.ok) throw new Error(`fragenkatalog.json: ${res.status}`);
    questions = await res.json();

  } catch (error) {
    document.getElementById("question-container").innerHTML =
      `<p style="color:red;">${error.message}</p>`;
    console.error(error);
    return;
  }
  showStartScreen();
}

window.addEventListener("DOMContentLoaded", loadData);
