let questions = {};
let answers = {};
let currentQuestion = "start";
let questionQueue = [];
let questionnaireFinished = false;

function getNextQuestionId(question, option) {
    const nextId = option && option.nextQuestionID ? option.nextQuestionID : question && question.nextQuestionID ? question.nextQuestionID : null;

    if (Array.isArray(nextId)) {
        questionQueue = nextId.slice(1);
        return nextId[0] || null;
    }

    if (questionQueue.length > 0) {
        return questionQueue.shift();
    }

    return nextId;
}

function showQuestion() {
    const container = document.getElementById("question-container");
    const submitButton = document.getElementById("submit-button");
    container.innerHTML = "";
    submitButton.disabled = true;

    const q = questions[currentQuestion];
    if (!q || currentQuestion === null || currentQuestion === "ENDE") {
        questionnaireFinished = true;
        const doneMessage = document.createElement("div");
        doneMessage.innerHTML = "<p><strong>Fragebogen abgeschlossen.</strong></p>";

        const summary = document.createElement("pre");
        summary.innerText = JSON.stringify(answers, null, 2);
        doneMessage.appendChild(summary);

        container.appendChild(doneMessage);
        submitButton.disabled = false;
        return;
    }

    const div = document.createElement("div");

    const label = document.createElement("p");
    label.innerText = q.text || "Frage nicht gefunden";
    div.appendChild(label);

    const type = q.type || "select";

    if (type === "select") {
        if (!Array.isArray(q.options)) {
            div.appendChild(document.createTextNode("Keine Antwortmöglichkeiten verfügbar."));
        } else {
            q.options.forEach(opt => {
                const btn = document.createElement("button");
                btn.innerText = opt.label || opt.value || "Antwort";

                btn.onclick = () => {
                    answers[currentQuestion] = opt.value !== undefined ? opt.value : opt.label;
                    const nextId = getNextQuestionId(q, opt);
                    currentQuestion = nextId;
                    showQuestion();
                };

                div.appendChild(btn);
            });
        }
    }

    if (type === "number" || type === "text") {
        const input = document.createElement("input");
        input.type = type;
        input.style.display = "block";
        input.style.marginBottom = "8px";

        const btn = document.createElement("button");
        btn.innerText = "Weiter";

        btn.onclick = () => {
            if (input.value === "") {
                alert("Bitte eine Antwort eingeben.");
                return;
            }
            answers[currentQuestion] = input.value;
            const nextId = getNextQuestionId(q);
            currentQuestion = nextId;
            showQuestion();
        };

        div.appendChild(input);
        div.appendChild(btn);
    }

    container.appendChild(div);
}

async function loadQuestions() {
    try {
        const response = await fetch("./fragenkatalog.json");
        if (!response.ok) {
            throw new Error(`Fehler beim Laden von fragenkatalog.json: ${response.status}`);
        }
        questions = await response.json();
    } catch (error) {
        const container = document.getElementById("question-container");
        container.innerHTML = `<p style="color:red;">${error.message}</p>`;
        console.error(error);
        return;
    }

    showQuestion();
}

function submitAnswers() {
    if (!questionnaireFinished) {
        alert("Bitte beantworten Sie zuerst alle Fragen.");
        return;
    }

    const stored = JSON.parse(localStorage.getItem("fragebogenAntworten") || "[]");
    stored.push({
        timestamp: new Date().toISOString(),
        answers,
    });
    localStorage.setItem("fragebogenAntworten", JSON.stringify(stored, null, 2));

    console.log("Antworten:", answers);
    alert("Antworten wurden gespeichert.");
}

window.addEventListener("DOMContentLoaded", loadQuestions);
