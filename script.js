async function loadQuestions() {
    const response = await fetch("fragenkatalog.json");
    const data = await response.json();
    return data;
}

let questions = {};

async function init() {
    questions = await loadQuestions();
    showQuestion();
}

init();
let answers = {};
let currentQuestion = "start";

function showQuestion() {
    const container = document.getElementById("question-container");
    container.innerHTML = "";

    const q = questions[currentQuestion];

    const div = document.createElement("div");

    const label = document.createElement("p");
    label.innerText = q.text;
    div.appendChild(label);

    if (q.type === "select") {
        q.options.forEach(opt => {
            const btn = document.createElement("button");
            btn.innerText = opt.label;

            btn.onclick = () => {
                answers[currentQuestion] = opt.value;
                currentQuestion = opt.next;
                showQuestion();
            };

            div.appendChild(btn);
        });
    }

    if (q.type === "number") {
        const input = document.createElement("input");
        input.type = "number";

        const btn = document.createElement("button");
        btn.innerText = "Weiter";

        btn.onclick = () => {
            answers[currentQuestion] = input.value;
            currentQuestion = q.next;
            showQuestion();
        };

        div.appendChild(input);
        div.appendChild(btn);
    }

    container.appendChild(div);
}

showQuestion();

function submitAnswers() {
    console.log("Antworten:", answers);
    alert("Antworten wurden gespeichert (siehe Konsole)");
}