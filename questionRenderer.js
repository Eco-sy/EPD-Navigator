/**
 * questionRenderer.js
 * Nimmt eine Frage vom QuestionEngine entgegen und stellt sie dar.
 * Kommuniziert Antworten zurück an den Engine über einen Callback.
 */

class QuestionRenderer {
  /**
   * @param {HTMLElement} container  - DOM-Element, in dem die Fragen gerendert werden
   * @param {Function} onAnswer      - Callback: wird mit (questionID, answer, nextQuestionID) aufgerufen
   */
  constructor(container, onAnswer) {
    this.container = container;
    this.onAnswer = onAnswer;
  }

  /**
   * Rendert eine Frage im Container.
   * Wird direkt vom QuestionEngine als `onQuestion`-Callback aufgerufen.
   *
   * @param {string} questionID   - ID der Frage
   * @param {Object} question     - Frage-Objekt aus der JSON
   */
  render(questionID, question) {
    // Container leeren
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "question-wrapper";
    wrapper.dataset.questionId = questionID;

    // Fragetext
    const textEl = document.createElement("p");
    textEl.className = "question-text";
    textEl.textContent = question.text;
    wrapper.appendChild(textEl);

    // Eingabebereich je nach Typ
    const type = question.type ?? "select";

    if (type === "select" && Array.isArray(question.options)) {
      // ── Optionsbuttons ──────────────────────────────────────────────────────
      const optionsEl = document.createElement("div");
      optionsEl.className = "question-options";

      question.options.forEach((option) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = option.label;

        btn.addEventListener("click", () => {
          this._markSelected(optionsEl, btn);
          // Kurze Verzögerung für visuelles Feedback, dann Callback
          setTimeout(() => {
            this.onAnswer(questionID, option.label, option.nextQuestionID ?? null);
          }, 180);
        });

        optionsEl.appendChild(btn);
      });

      wrapper.appendChild(optionsEl);

    } else if (type === "number") {
      // ── Zahlen-Eingabe ──────────────────────────────────────────────────────
      const inputWrapper = document.createElement("div");
      inputWrapper.className = "question-input-wrapper";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.className = "question-input";
      input.placeholder = "Zahl eingeben …";

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "confirm-btn";
      confirmBtn.textContent = "Bestätigen";

      confirmBtn.addEventListener("click", () => {
        const value = parseFloat(input.value);
        if (isNaN(value)) {
          input.classList.add("input-error");
          input.placeholder = "Bitte eine gültige Zahl eingeben!";
          return;
        }
        input.classList.remove("input-error");
        this.onAnswer(questionID, value, question.nextQuestionID ?? null);
      });

      // Auch Enter bestätigt
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") confirmBtn.click();
      });

      inputWrapper.appendChild(input);
      inputWrapper.appendChild(confirmBtn);
      wrapper.appendChild(inputWrapper);

    } else if (type === "text") {
      // ── Text-Eingabe ────────────────────────────────────────────────────────
      const inputWrapper = document.createElement("div");
      inputWrapper.className = "question-input-wrapper";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "question-input";
      input.placeholder = "Antwort eingeben …";

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "confirm-btn";
      confirmBtn.textContent = "Bestätigen";

      confirmBtn.addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
          input.classList.add("input-error");
          return;
        }
        input.classList.remove("input-error");
        this.onAnswer(questionID, value, question.nextQuestionID ?? null);
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") confirmBtn.click();
      });

      inputWrapper.appendChild(input);
      inputWrapper.appendChild(confirmBtn);
      wrapper.appendChild(inputWrapper);

    } else {
      // ── Fallback: unbekannter Typ ───────────────────────────────────────────
      const msg = document.createElement("p");
      msg.className = "question-error";
      msg.textContent = `Unbekannter Fragetyp: "${type}"`;
      wrapper.appendChild(msg);
    }

    this.container.appendChild(wrapper);

    // Einblend-Animation anstoßen
    requestAnimationFrame(() => wrapper.classList.add("visible"));
  }

  /**
   * Zeigt die Abschluss-Nachricht und die gesammelten Antworten.
   * @param {Object} answers
   */
  renderEnd(answers) {
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "question-wrapper end-screen";

    const heading = document.createElement("h2");
    heading.textContent = "Fragebogen abgeschlossen";
    wrapper.appendChild(heading);

    const summary = document.createElement("pre");
    summary.className = "answers-summary";
    summary.textContent = JSON.stringify(answers, null, 2);
    wrapper.appendChild(summary);

    this.container.appendChild(wrapper);
    requestAnimationFrame(() => wrapper.classList.add("visible"));
  }

  // ── Hilfsmethoden ─────────────────────────────────────────────────────────

  _markSelected(optionsEl, selectedBtn) {
    optionsEl.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("selected"));
    selectedBtn.classList.add("selected");
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  window.QuestionRenderer = QuestionRenderer;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = QuestionRenderer;
}
