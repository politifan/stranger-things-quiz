"use strict";

const { chapters, profiles, questions } = JSON.parse(document.querySelector("#quiz-data").textContent);
const byId = (id) => document.getElementById(id);
const storageKey = "hawkins-quiz-v1";
const chapterSteps = [...document.querySelectorAll(".route li")];
const answerLetters = ["А", "Б", "В", "Г"];
const play = byId("play");
const result = byId("result");
let answers = [];
let index = 0;
let finished = false;
let shareText = "";

try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.answers?.length <= questions.length && saved.answers.every(
        (answer, question) => Number.isInteger(answer) && answer >= 0 && answer < questions[question][1].length,
    )) {
        answers = saved.answers;
        index = Number.isInteger(saved.index) ? Math.max(0, Math.min(saved.index, answers.length, questions.length - 1)) : 0;
        finished = saved.finished === true && answers.length === questions.length;
    }
} catch {
    // The quiz also works when storage is unavailable.
}

function save() {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify({ answers, index, finished }));
    } catch {
        // Keep the current run in memory.
    }
}

function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

function renderQuestion(focus = true) {
    play.hidden = false;
    result.hidden = true;
    const [prompt, options] = questions[index];
    byId("question").textContent = prompt;
    byId("question-count").textContent = `ВОПРОС ${index + 1} / ${questions.length}`;
    byId("answered").textContent = `Отвечено ${answers.length}`;
    byId("progress").value = answers.length;
    byId("back").disabled = index === 0;
    byId("next").disabled = answers[index] === undefined;
    byId("next").textContent = index === questions.length - 1 ? "Узнать результат" : "Дальше";

    const act = Math.floor(index / 5);
    chapterSteps.forEach((step, i) => {
        if (i === act) step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
    });

    byId("answers").replaceChildren(...options.map(([text], i) => {
        const label = element("label", "", "option");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "choice";
        radio.value = i;
        radio.checked = answers[index] === i;
        const letter = element("span", answerLetters[i], "letter");
        letter.setAttribute("aria-hidden", "true");
        label.append(radio, letter, element("span", text));
        return label;
    }));

    if (focus) byId("question").focus({ preventScroll: true });
}

function rankProfiles() {
    const tally = Object.fromEntries(Object.keys(profiles).map(key => [key, { points: 0, direct: 0, recent: 0 }]));
    answers.forEach((answer, i) => {
        const [, primary, secondary] = questions[i][1][answer];
        tally[primary].points += 3;
        tally[primary].direct += 1;
        tally[primary].recent += 2 * 3 ** i;
        tally[secondary].points += 1;
        tally[secondary].recent += 3 ** i;
    });
    return Object.keys(tally).sort((a, b) =>
        tally[b].points - tally[a].points || tally[b].direct - tally[a].direct || tally[b].recent - tally[a].recent,
    );
}

function renderResult(focus = true) {
    const [first, second] = rankProfiles();
    const [name, headline, description, role, hint, trait, accent, initials] = profiles[first];
    const portrait = byId("portrait");
    portrait.style.setProperty("--accent", accent);
    const mark = element("span", initials, "monogram");
    mark.setAttribute("aria-hidden", "true");
    const title = element("h3", name);
    title.id = "result-title";
    title.tabIndex = -1;
    portrait.replaceChildren(
        mark, element("p", "ТВОЙ ПЕРСОНАЖ", "kicker"), title,
        element("p", headline, "result-headline"), element("p", description),
        element("h4", "Твоя роль в команде"), element("p", role),
        element("h4", "Что поможет в трудный момент"), element("p", hint),
        element("p", `Главная черта: ${trait}. Следом по совпадениям — ${profiles[second][0]}.`, "runner-up"),
    );
    chapterSteps.forEach(step => step.removeAttribute("aria-current"));
    shareText = `Мой персонаж из «Очень странных дел» — ${name}. ${headline}.`;
    byId("share-status").textContent = "";
    play.hidden = true;
    result.hidden = false;
    if (focus) title.focus({ preventScroll: true });
}

byId("answers").addEventListener("change", event => {
    if (event.target.name !== "choice") return;
    answers[index] = Number(event.target.value);
    byId("next").disabled = false;
    byId("answered").textContent = `Отвечено ${answers.length}`;
    byId("progress").value = answers.length;
    save();
});

byId("question-form").addEventListener("submit", event => {
    event.preventDefault();
    if (answers[index] === undefined) return;
    if (index === questions.length - 1) {
        finished = true;
        renderResult();
    } else {
        index += 1;
        renderQuestion();
    }
    save();
    byId("quiz-panel").scrollIntoView({ block: "nearest" });
});

byId("back").addEventListener("click", () => {
    if (index === 0) return;
    index -= 1;
    save();
    renderQuestion();
});

byId("restart").addEventListener("click", () => {
    answers = [];
    index = 0;
    finished = false;
    save();
    renderQuestion();
    byId("quiz-panel").scrollIntoView({ block: "nearest" });
});

byId("share").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(shareText);
        byId("share-status").textContent = "Результат скопирован.";
    } catch {
        byId("share-status").textContent = shareText;
    }
});

async function renderShow() {
    const show = byId("show");
    if (!show) return;
    try {
        const response = await fetch(show.dataset.url);
        if (!response.ok) return;
        const data = await response.json();
        if (!data.available) return;
        const source = element("a", "Данные TVmaze");
        source.href = data.url;
        const facts = [data.premiered?.slice(0, 4), data.rating == null ? null : `${data.rating} / 10`].filter(Boolean);
        show.replaceChildren(element("h3", data.name), element("p", facts.join(" · ")), source);
        show.hidden = false;
    } catch {
        // The optional show card is omitted if the API is unavailable.
    }
}

if (finished) renderResult(false);
else renderQuestion(false);
renderShow();
