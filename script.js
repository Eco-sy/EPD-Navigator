/**
 * script.js – EPD Navigator
 * Fragebogen-Engine + IBU Gebührenberechnung
 *
 * Datenquellen:
 *   customer.json      → Stammdaten (simuliert CRM-Profil)
 *   fragenkatalog.json → EPD-Fragen (Aktualisierung, neue EPDs, Produktfamilie)
 *   ibu-calculator.js  → Berechnungslogik (muss vor script.js geladen sein)
 */

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
let questions             = {};
let answers               = {};
let currentQuestion       = "newEPDCount"; //Auf erste Frage initialisiert
let questionQueue         = [];
let questionnaireFinished = false;
let questionHistory = [];
let leitfaden = "https://www.eco-sy.com/epd-leitfaden"
let lang = new URLSearchParams(window.location.search).get("lang") || "de";
let local = {};

//---
// Load Translated String
//---
function t(key) {
  return local[key] ?? key;
}

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
  document.querySelector(".page-shell")?.classList.remove("result-mode");
  answers = {};
  currentQuestion = "newEPDCount";
  questionQueue = [];
  questionnaireFinished = false;
  questionHistory = [];
  showStartScreen();
}

function showStartScreen() {
  const container = document.getElementById("question-container");
  container.innerHTML = `<a href=${leitfaden} class="info-button" target="_blank">ⓘ<span class="info-tooltip">
        ${t("info.tooltip")}
    </span></a>`;

  const div = document.createElement("div");
  div.innerHTML = `
    <h3>${t("start.title")}</h3>
    <p style="font-weight:400; font-size:0.95rem; color:#64748b;">
      ${t("start.description")}
    </p>
    <button class="answer-button" id="start-btn">${t("start.button")}</button>
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
  // if (validation.min !== undefined) parts.push(`mindestens ${validation.min}`);
  // if (validation.max !== undefined) parts.push(`höchstens ${validation.max}`);
  if (validation.min !== undefined) parts.push(`${validation.min}`);
  if (validation.max !== undefined) parts.push(`${validation.max}`);

  // const rangeText = parts.length > 0 ? ` (${parts.join(" und ")})` : "";
  const rangeText = parts.length > 0 ? ` (${parts.join(" - ")})` : "";
  return validation.integer
    ? t("validation.wholeNumberWarning") + rangeText
    : t("validation.validInputWarning") + rangeText;
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
  const label = document.createElement("h3");
  label.innerText = q.text || t("error.questionNotFound");
  div.appendChild(label);

  const infoBtn = document.createElement("a");
  infoBtn.className = "info-button";
  infoBtn.setAttribute("href", leitfaden);
  infoBtn.setAttribute("target", "_blank");
  infoBtn.innerHTML = `ⓘ<span class="info-tooltip">
        ${t("info.tooltip")}
    </span>`;
  
  div.appendChild(infoBtn);

  function parseHint(text){
    return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  }

  if (q.hint) {
    const hint = document.createElement("p");
    hint.style.cssText = "font-size:0.875rem; color:#64748b; font-weight:400; margin:0;";
    // hint.innerText = q.hint;
    // hint.innerHTML = parseHint(q.hint);
    hint.innerHTML = q.hint;
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
  continueBtn.innerText = t("buttonLabel.continue");

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
  backBtn.innerText = t("buttonLabel.back");
  backBtn.disabled = questionHistory.length === 0;
  backBtn.onclick = () => {
    if (questionHistory.length === 0) return;
    currentQuestion = questionHistory.pop();
    showQuestion();
  };

  const skipBtn = document.createElement("button");
  skipBtn.className = "back-button skip-button";
  skipBtn.innerText = t("buttonLabel.skip");
  // skipBtn.disabled = questionHistory.length === 0;
  skipBtn.onclick = () => {
    answers[currentQuestion] = q.skipValue;
    questionHistory.push(currentQuestion);
    currentQuestion = q.skipNext ?? q.nextQuestionID ?? null;
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
  if (answers.ibuMembershipType == "associate") return "";
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
  const target = document.querySelector(".card");
  if (!target) return;

  const btn = document.getElementById("download-screenshot-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = t("buttonLabel.createScreenshot");
  }

  if (typeof html2canvas === "undefined") {
    alert(t("error.ScreenshotWarning"));
    if (btn) {
      btn.disabled = false;
      btn.textContent = t("buttonLabel.screenshot");
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
      link.download = "ecosy-epd-kostenvergleich.png";
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
        btn.textContent = t("buttonLabel.screenshot");
      }
    });
}

// ---------------------------------------------------------------------------
// Ergebnis-Seite rendern
// ---------------------------------------------------------------------------
function renderResult() {
  document.querySelector(".page-shell")?.classList.add("result-mode");
  
  const fmt = n =>
    new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n);

  const wrapper = document.createElement("div");
  wrapper.className = "summary-page";
  wrapper.innerHTML =`<img src="https://static.wixstatic.com/media/db9150_92bfb1a2f7da45a69e98ad8289f50dde~mv2.png/v1/fill/w_168,h_58,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Home.png">`
  
  const infoBtn = document.createElement("div");
  infoBtn.className = "info-button-end";
  infoBtn.innerHTML = `<p class="seen" style="font-weight:400; font-size:1.5vh; color:#64748b;">${t("info.desktop")}</p><a href=${leitfaden} target="_blank" class="info-button-end">ⓘ</a><span class="info-tooltip">${t("info.tooltip")}</span>`
  wrapper.appendChild(infoBtn);

  const providerGrid = document.createElement("div");
  providerGrid.className = "provider-grid";
  wrapper.appendChild(providerGrid);

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
    note.innerText = t("error.noEPDs");
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
    errMsg.innerText = t("error.calculationError") + err.message;
    wrapper.appendChild(errMsg);
    return wrapper;
  }
  if(result){
    const i = result.inputs;
    const costSectionIBU = document.createElement("div");
    costSectionIBU.className = "provider-box";
    // costSectionIBU.open = true; // erste Box standardmäßig aufgeklappt
    costSectionIBU.innerHTML = `
      <div class="provider-summary">
        <span>
          <span class="provider-summary-title">${t("ibu.title")}</span><br>
          <span class="provider-summary-sub">
            ${result.companyName}${i.membershipGroup ? ` · ${t("ibu.membershipGroup")} F${i.membershipGroup}` : ''}
             ${i.membershipType === 'associate' ? `· ${t("ibu.membershipType")}` : ''}
          </span>
        </span>
        <span class="provider-summary-total"><span style="color:#C3B7C7;">${fmt(result.oneTime.total)} *</span> <span style="color:#FFF;">+</span> ${fmt(result.projection[result.projection.length - 1].cumulative - result.oneTime.total)}</span>
      </div>
      <div class="provider-content">
        <p class="provider-meta">
          ${t("ibu.meta")}
        </p>

          <div class="metric-grid">
            ${metricCard(t("sectionLabel.oneTime"), fmt(result.oneTime.total), t("ibu.metricLabel.oneTime"))}
            ${metricCard(t("sectionLabel.yearlyCost"), fmt(result.annual.total), t("ibu.metricLabel.yearlyCost"))}
            ${metricCard(t("sectionLabel.totalFirstYear"), fmt(result.totalFirstYear), t("ibu.metricLabel.totalFirstYear"))}
            ${metricCard(t("sectionLabel.totalEPDsAfter"), i.totalValidEPDsAfter, t("ibu.metricLabel.totalEPDsAfter"))}
          </div>

        <div class="hidden">
          <div class="summary-item cost-section">
            <details class="cost-section">
              <summary class="cost-section-title">${t("sectionLabel.oneTime")}</summary>
              ${costTable(
                Object.values(result.oneTime.items)
                  .filter(x => x.count > 0)
                  .map(x => [`${t(x.label)} (${x.count} × ${fmt(x.unitCost)})`, fmt(x.total)])
              )}
            </details>
            <table class="cost-table">
              <tr class="cost-table-total">
                <td>${t("sectionLabel.oneTimeSum")}</td>
                <td>${fmt(result.oneTime.total)}</td>
              </tr>
            </table>
          </div>

          <div class="summary-item note-box note-ibu">
            <p>${t("ibu.noteBox")}</p>
          </div>
          
          <div class="summary-item cost-section">
            <details class="cost-section">
              <summary class="cost-section-title">
                <span>${t("sectionLabel.yearlyCost")}</span>
              </summary>
              ${costTable([
                [t(result.annual.items.membershipFee.label).replace("{group}", i.membershipGroup),
                result.annual.items.membershipFee.billedExternally ? '—' : fmt(result.annual.items.membershipFee.total)],
                ...buildSignFeeRows(result.annual.items.signFees.breakdown, fmt),
              ])}
            </details>
            <table class="cost-table">
              <tr class="cost-table-total">
                <td>${t("sectionLabel.yearlyCostSum")}</td>
                <td>${fmt(result.annual.total)}</td>
              </tr>
            </table>
          </div>

          <div class="summary-item cost-section">
            <p class="cost-section-title">${t("sectionLabel.fiveYearProjection")}</p>
            ${projectionTable(result.projection)}
          </div>      

          <div class="summary-item total-box">
            <div class="total-box-row">
              <span class="total-box-label">${t("sectionLabel.totalFirstYearAlt")}</span>
              <span class="total-box-amount">${fmt(result.totalFirstYear)}</span>
            </div>
            <div class="total-box-vat">
              <span>${t("sectionLabel.inclVatDE")}</span>
              <span>${fmt(result.totalFirstYear * 1.19)}</span>
            </div>
          </div>
        </div>
        </div>`;
    providerGrid.appendChild(costSectionIBU);
  }

  // ── Environdec ────────────────────────────────────────────────────────────
  let resultEnv;
  try {
    resultEnv = calculateEnvirondec(customerData, calcInput);
  } catch (err) {
    const errMsg = document.createElement("p");
    errMsg.style.cssText = "color:red; margin-top:12px;";
    errMsg.innerText = t("error.calculationError") + err.message;
    wrapper.appendChild(errMsg);
    // return wrapper;
  }

  if(resultEnv){
    const iEnv = resultEnv.inputs;
    const membershipTypeLabels = { micro: 'Micro Business', sme: 'Small & Medium Business', multinational: 'Multinational Business' };

    const costSectionEnv = document.createElement("div");
    costSectionEnv.className = "provider-box";
    // costSectionEnv.open = true; // zweite Box standardmäßig aufgeklappt
    costSectionEnv.innerHTML = `
      <div class="provider-summary">
        <span>
          <span class="provider-summary-title">${t("env.title")}</span><br>
          <span class="provider-summary-sub">
            ${resultEnv.companyName} · ${membershipTypeLabels[iEnv.membershipType]}
          </span>
        </span>
        <span class="provider-summary-total">${fmt(resultEnv.projection[result.projection.length - 1].cumulative)}</span>
      </div>
      <div class="provider-content">
        <p class="provider-meta">
        ${t("env.meta")}
        </p>

        <div class="metric-grid">
          ${metricCard(t("sectionLabel.oneTime"), fmt(resultEnv.oneTime.total), t("env.metricLabel.oneTime"))}
          ${metricCard(t("sectionLabel.yearlyCost"), fmt(resultEnv.annual.total), t("env.metricLabel.yearlyCost"))}
          ${metricCard(t("sectionLabel.totalFirstYear"), fmt(resultEnv.totalFirstYear), t("env.metricLabel.totalFirstYear"))}
          ${metricCard(t("sectionLabel.totalEPDsAfter"), iEnv.totalValidEPDsAfter, t("env.metricLabel.totalEPDsAfter"))}
        </div>
      <div class="hidden">
        <div class="summary-item cost-section">
          <details class="cost-section">
            <summary class="cost-section-title">
              <span class="cost-section-title">${t("sectionLabel.oneTime")}</span>
            </summary>
            ${costTable(buildEnvirondecRows(resultEnv.oneTime.newEPDs.breakdown, fmt))}
          </details>
            <table class="cost-table">
              <tr class="cost-table-total">
                <td>${t("sectionLabel.oneTimeSum")}</td>
                <td>${fmt(resultEnv.oneTime.total)}</td>
              </tr>
            </table>
        </div>

        <div class="summary-item note-box warning-box note-ibu">
            <p>${t("env.notebox")}</p>
        </div>

        <div class="summary-item cost-section">
        <details class="cost-section">
          <summary class="cost-section-title"><span class="cost-section-title">${t("sectionLabel.yearlyCost")}</span></summary>
          ${costTable([
            [resultEnv.annual.membershipFee.label, fmt(resultEnv.annual.membershipFee.total)],
          ])}
        </details>
          <table class="cost-table">
            <tr class="cost-table-total">
              <td>${t("sectionLabel.yearlyCostSum")}</td>
              <td>${fmt(resultEnv.annual.total)}</td>
            </tr>
          </table>
        </div>
        
        <div class="summary-item cost-section">
          <p class="cost-section-title">${t("sectionLabel.fiveYearProjection")}</p>
          ${projectionTable(resultEnv.projection)}
        </div>      

        <div class="summary-item total-box">
          <div class="total-box-row">
            <span class="total-box-label">${t("sectionLabel.totalFirstYearAlt")}</span>
            <span class="total-box-amount">${fmt(resultEnv.totalFirstYear)}</span>
          </div>
          <div class="total-box-vat">
            <span>${t("sectionLabel.inclVat")}</span>
            <span>${t("sectionLabel.inclVatUnkown")}</span>
          </div>
        </div>
      </div>
    </div>`;

    providerGrid.appendChild(costSectionEnv);
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
    errMsg.innerText = t("error.calculationError") + err.message;
    wrapper.appendChild(errMsg);
    // return wrapper;
  }
 
  if (resultHub){
    const noteBoxClass = resultHub.inputs.limitExceeded
      ? "summary-item note-box warning-box"
      : "summary-item note-box";

    const noteBoxContent = resultHub.inputs.limitExceeded
      ? t("hub.noteOverflow")
      : t("hub.note");

    const count = resultHub.inputs.limitExceeded
      ? resultHub.inputs.cappedCount
      : resultHub.inputs.requestedEPDs;

    const costSectionHub = document.createElement("div");
    costSectionHub.className = "provider-box";
    // costSectionHub.open = true;
    costSectionHub.innerHTML = `
      <div class="provider-summary">
        <span>
          <span class="provider-summary-title">${t("hub.title")}</span><br>
          <span class="provider-summary-sub">
            · ${resultHub.package.label}
          </span>
        </span>
        <span class="provider-summary-total">${fmt(resultHub.projection[result.projection.length - 1].cumulative)}</span>
      </div>
      <div class="provider-content">
        <p class="provider-meta">
          ${t("hub.meta")}
        </p>
  
        <div class="metric-grid">
          ${metricCard(t("sectionLabel.packagePrice"), fmt(resultHub.package.price), resultHub.package.label)}
          ${metricCard(t("sectionLabel.yearlyCost"), "—", t("hub.metricLabel.yearlyCost"))}
          ${metricCard(t("sectionLabel.pricePerEPD"), fmt(resultHub.package.pricePerEPD), t("hub.metricLabel.pricePerEPD").replace("{count}", count))}
          ${metricCard(t("sectionLabel.newEPDs"), (resultHub.inputs.limitExceeded ? resultHub.inputs.cappedCount : resultHub.inputs.requestedEPDs), resultHub.inputs.limitExceeded ? t("hub.metricLabel.newEPDsMax") : t("hub.metricLabel.newEPDsRequested"))}
        </div>
  
        
      <div class="hidden">
        <div class="summary-item cost-section">
          <p class="cost-section-title">Paketdetails</p>
          ${costTable([
            [t("hub.productTyp"), resultHub.inputs.complexity === "simple" ? "Simple Product" : "Complex Product"],
            [t("hub.requestedEPDs"), resultHub.inputs.requestedEPDs],
            [t("hub.packageStep"), resultHub.inputs.packageStep + " EPDs"],
            [t("hub.packagePrice"), fmt(resultHub.package.price)]
          ])}
        </div>
  
        <div class="${noteBoxClass}">
          <p>${noteBoxContent}</p>
        </div>

        <div class="summary-item cost-section">
          <p class="cost-section-title">${t("sectionLabel.fiveYearProjection")}</p>
          ${projectionTable(resultHub.projection)}
        </div>      

        <div class="summary-item total-box">
          <div class="total-box-row">
            <span class="total-box-label">${t("sectionLabel.totalFirstYearAlt")}</span>
            <span class="total-box-amount">${fmt(resultHub.totalFirstYear)}</span>
          </div>
          <div class="total-box-vat">
            <span>${t("sectionLabel.inclVat")}</span>
            <span>${t("sectionLabel.inclVatUnkown")}</span>
          </div>
        </div>
      </div>
      </div>`;
  
    providerGrid.appendChild(costSectionHub);
  }

  const actionRow = document.createElement("div");
  actionRow.className = "result-actions";

  const screenshotBtn = document.createElement("button");
  screenshotBtn.id = "download-screenshot-btn";
  screenshotBtn.setAttribute("data-html2canvas-ignore", "");
  screenshotBtn.className = "answer-button";
  screenshotBtn.innerText = t("buttonLabel.screenshot");
  screenshotBtn.onclick = downloadResultScreenshot;
  actionRow.appendChild(screenshotBtn);

  const restartBtn = document.createElement("button");
  restartBtn.className = "answer-button";
  restartBtn.innerText = t("buttonLabel.restart");
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

function costTable(rows) {
  const rowsHtml = rows.map(([l, v]) => `
    <tr>
      <td>${l}</td>
      <td>${v}</td>
    </tr>`).join("");
  return `
    <table class="cost-table">
      ${rowsHtml}
    </table>`;
}

function buildSignFeeRows(breakdown, fmt) {
  const rows = [];

  for (const item of breakdown.slice(0, 4)) {
    rows.push([`${t("ibu.label.labelingFee")} ${item.position}`, fmt(item.fee)]);
  }

  const group5to20 = breakdown.filter(item => item.position >= 5 && item.position <= 20);
  if (group5to20.length > 0) {
    const start = 5;
    const end = group5to20[group5to20.length - 1].position;
    const unitFee = group5to20[0].fee;
    rows.push([
      `${t("ibu.label.labelingFee")} ${start}–${end}`,
      `${t("label.perEPD")}` + fmt(unitFee)
    ]);
  }

  const group21Plus = breakdown.filter(item => item.position >= 21);
  if (group21Plus.length > 0) {
    const unitFee = group21Plus[0].fee;
    rows.push([
      `${t("ibu.label.labelingFee")} 21+`,
      fmt(unitFee)
    ]);
  }

  return rows;
}

function buildEnvirondecRows(breakdown, fmt) {
  const rows = [];

  const addGroup = (from, to, labelPrefix) => {
    const items = breakdown.filter(item => item.position >= from && item.position <= to);
    if (items.length === 0) return;

    const start = from;
    const end = items[items.length - 1].position;
    const fee = items[0].fee;

    const label = start === end
      ? `${labelPrefix} ${start}`
      : `${labelPrefix} ${start}–${end}`;

    rows.push([`${label}`, `${t("label.perEPD")}` + fmt(fee)]);
  };

  // EPD 1 individuell
  const first = breakdown.find(item => item.position === 1);
  if (first) {
    rows.push([`${t("label.verifyEPD")} 1`, fmt(first.fee)]);
  }

  addGroup(2, 4, t("label.verifyEPD"));
  addGroup(5, 99, t("label.verifyEPD"));
  addGroup(100, Infinity, t("label.verifyEPD"));

  return rows;
}

function projectionTable(projection) {
  const fmt = n => n === 0 ? "—"
    : new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n);

  const rows = projection.map(row => `
    <tr>
      <td>${t("label.year")}\u00A0${row.year}</td>
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
          <th>${t("label.oneTime")}</th>
          <th>${t("label.yearly")}</th>
          <th class="hidden">Gesamt</th>
          <th>${t("label.cumulated")}</th>
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
  alert("Antworten und Gebührenberechnung wurden gespeichert.");
}

// ---------------------------------------------------------------------------
// Laden – beide Quellen parallel fetchen
// ---------------------------------------------------------------------------

// ----
// Load Translationfile
// ---
async function loadLocale(lang = "de") {
  const res = await fetch(`./local/${lang}.json`);
  local = await res.json();
}

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
    await loadLocale(lang);
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
