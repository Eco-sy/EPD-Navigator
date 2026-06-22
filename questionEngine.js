/**
 * questionEngine.js
 * Liest die Fragen-JSON und ermittelt die nächste(n) Frage(n).
 * Gibt die Frage(n) an den QuestionRenderer weiter.
 */

class QuestionEngine {
  /**
   * @param {Object} questionsJSON  - Das eingelesene JSON-Objekt mit allen Fragen
   * @param {Function} onQuestion   - Callback: wird mit (questionID, questionObject) aufgerufen
   * @param {Function} onEnd        - Callback: wird aufgerufen wenn der Fragebogen endet
   */
  constructor(questionsJSON, onQuestion, onEnd) {
    this.questions = questionsJSON;
    this.onQuestion = onQuestion;
    this.onEnd = onEnd;

    // Stack für mehrere parallele Pfade (z.B. bei nextQuestionID: ["extendEPD", "newEPD"])
    this.questionQueue = [];

    // Bereits gestellte Fragen (verhindert Endlosschleifen)
    this.visitedQuestions = new Set();

    // Gesammelte Antworten
    this.answers = {};
  }

  /**
   * Startet den Fragebogen mit der ersten Frage ("start").
   */
  start() {
    this.visitedQuestions.clear();
    this.questionQueue = [];
    this.answers = {};
    this._loadQuestion("start");
  }

  /**
   * Wird aufgerufen, wenn der Nutzer eine Antwort gegeben hat.
   * @param {string} questionID   - ID der beantworteten Frage
   * @param {*} answer            - Die Antwort (label bei Options, Wert bei number/text)
   * @param {string|null} nextID  - Optionale nextQuestionID aus der gewählten Option
   */
  answer(questionID, answer, nextID = null) {
    // Antwort speichern
    this.answers[questionID] = answer;

    const question = this.questions[questionID];
    if (!question) {
      console.error(`[QuestionEngine] Frage "${questionID}" nicht gefunden.`);
      return;
    }

    // nextQuestionID bestimmen:
    // Priorität 1: nextID aus der gewählten Option (kann String oder Array sein)
    // Priorität 2: nextQuestionID direkt an der Frage (z.B. bei type: number)
    const resolvedNext = nextID !== null ? nextID : question.nextQuestionID ?? null;

    if (resolvedNext === null) {
      console.warn(`[QuestionEngine] Keine nextQuestionID für Frage "${questionID}" gefunden.`);
      return;
    }

    this._processNext(resolvedNext);
  }

  /**
   * Verarbeitet eine oder mehrere nextQuestionIDs.
   * @param {string|string[]} nextID
   */
  _processNext(nextID) {
    if (Array.isArray(nextID)) {
      // Mehrere Folgefragen: alle in die Queue legen
      // Erste sofort laden, Rest in den Stack
      const [first, ...rest] = nextID;
      // Rest hinten in die Queue
      this.questionQueue.push(...rest);
      this._loadQuestion(first);
    } else {
      this._loadQuestion(nextID);
    }
  }

  /**
   * Lädt eine einzelne Frage und übergibt sie dem Renderer.
   * Holt danach ggf. die nächste aus der Queue.
   * @param {string} questionID
   */
  _loadQuestion(questionID) {
    // Abbruchbedingung: ENDE
    if (questionID === "ENDE") {
      // Gibt es noch Fragen in der Queue?
      if (this.questionQueue.length > 0) {
        const nextInQueue = this.questionQueue.shift();
        this._loadQuestion(nextInQueue);
        return;
      }
      // Wirkliches Ende
      if (typeof this.onEnd === "function") {
        this.onEnd(this.answers);
      }
      return;
    }

    // Schon besucht? Überspringen und weiter in der Queue
    if (this.visitedQuestions.has(questionID)) {
      console.warn(`[QuestionEngine] Frage "${questionID}" wurde bereits gestellt, überspringe.`);
      if (this.questionQueue.length > 0) {
        this._loadQuestion(this.questionQueue.shift());
      }
      return;
    }

    const question = this.questions[questionID];
    if (!question) {
      console.error(`[QuestionEngine] Frage "${questionID}" existiert nicht in der JSON.`);
      return;
    }

    this.visitedQuestions.add(questionID);

    // Frage an den Renderer übergeben
    if (typeof this.onQuestion === "function") {
      this.onQuestion(questionID, question);
    }
  }

  /**
   * Gibt alle bisher gesammelten Antworten zurück.
   * @returns {Object}
   */
  getAnswers() {
    return { ...this.answers };
  }

  /**
   * Setzt den Engine-Zustand zurück (für Neustart).
   */
  reset() {
    this.questionQueue = [];
    this.visitedQuestions.clear();
    this.answers = {};
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────
// Browser (global)
if (typeof window !== "undefined") {
  window.QuestionEngine = QuestionEngine;
}
// Node.js / ES-Module
if (typeof module !== "undefined" && module.exports) {
  module.exports = QuestionEngine;
}
