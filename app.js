/* ============================================================
   Румикуб — Подсчёт очков
   Файл: app.js — вся логика приложения
   ============================================================ */

// Инициализация аудиоконтекста для сигналов таймера без внешних файлов
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Звуковой сигнал. Остановка планируется по внутренним часам AudioContext,
// поэтому звук не «зависнет», даже если JS-поток заблокирован модальным окном.
function beep(duration, frequency, volume) {
    try {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        // Плавное затухание, чтобы не было щелчка в конце
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration / 1000);
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration / 1000 + 0.05);
    } catch (e) { console.log("Аудио не поддерживается до клика"); }
}

// === Состояние игры ===
let gameState = {
    players: [],      // Список имен
    scores: {},       // Объект: { Имя: [очки_раунд1, очки_раунд2, ...] }
    currentRound: 1,
    firstPlayerIndex: 0,
    currentPlayerIndex: 0,
    turnSeconds: 120  // время на один ход (секунды)
};

// Переменные таймера
let timerInterval = null;
let timeLeft = 120; // по умолчанию

// При загрузке страницы проверяем localStorage
window.onload = function () {
    const savedState = localStorage.getItem('rummikub_scores_state');
    if (savedState) {
        try {
            gameState = JSON.parse(savedState);
        } catch (e) {
            gameState = { players: [], scores: {}, currentRound: 1, firstPlayerIndex: 0, currentPlayerIndex: 0, turnSeconds: 120 };
        }
        if (!gameState.turnSeconds) gameState.turnSeconds = 120;
        if (gameState.players && gameState.players.length > 0) {
            showScreen('screen-totals');
            renderTotalsTable();
            return;
        }
    }
    generatePlayerInputs();
};

function saveToStorage() {
    localStorage.setItem('rummikub_scores_state', JSON.stringify(gameState));
}

// === Переключение экранов ===
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Кастомные уведомления вместо alert()
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { error: '❌', success: '✅', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// === Экран настройки ===
// Генерация полей ввода имен игроков и выбора первого ходящего
function generatePlayerInputs() {
    const count = parseInt(document.getElementById('player-count').value);
    const container = document.getElementById('players-fields-container');
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        const div = document.createElement('div');
        div.className = 'player-input-row';
        div.innerHTML = `
            <input type="radio" name="first-player-radio" value="${i - 1}" id="first-radio-${i}" ${i === 1 ? 'checked' : ''}>
            <label for="first-radio-${i}" class="first-player-label">первым</label>
            <input type="text" id="p-name-${i}" placeholder="Имя игрока ${i}">
        `;
        container.appendChild(div);
    }
}

// Случайный выбор первого ходящего на этапе настроек
function chooseRandomFirstPlayer() {
    const count = parseInt(document.getElementById('player-count').value);
    const randomIndex = Math.floor(Math.random() * count);
    const radios = document.getElementsByName('first-player-radio');
    if (radios[randomIndex]) radios[randomIndex].checked = true;
}

// Старт игры
function startGame() {
    const count = parseInt(document.getElementById('player-count').value);
    const players = [];
    const scores = {};
    for (let i = 1; i <= count; i++) {
        const input = document.getElementById(`p-name-${i}`);
        if (!input) {
            showToast('Пожалуйста, заполните имена всех игроков.', 'error');
            return;
        }
        const name = input.value.trim();
        if (!name) {
            showToast('Пожалуйста, заполните имена всех игроков.', 'error');
            input.focus();
            return;
        }
        if (players.includes(name)) {
            showToast('Имена игроков не должны повторяться.', 'error');
            return;
        }
        players.push(name);
        scores[name] = [];
    }
    const selectedRadio = document.querySelector('input[name="first-player-radio"]:checked');
    const firstIndex = selectedRadio ? parseInt(selectedRadio.value) : 0;
    const turnInput = document.getElementById('turn-time');
    const turnSeconds = turnInput ? Math.min(3600, Math.max(5, parseInt(turnInput.value, 10) || 120)) : 120;
    gameState.players = players;
    gameState.scores = scores;
    gameState.currentRound = 1;
    gameState.firstPlayerIndex = firstIndex;
    gameState.currentPlayerIndex = firstIndex;
    gameState.turnSeconds = turnSeconds;
    racks = {};
    enteredRacks = {};
    saveToStorage();
    initMatchScreen();
}

// === Экран матча ===
// Инициализация экрана матча
function initMatchScreen() {
    document.getElementById('round-number-display').innerText = gameState.currentRound;
    updateCurrentPlayerDisplay();
    showScreen('screen-match');
    showTurnConfirmation(); // ход начнётся только после нажатия «Начать ход»
}

function updateCurrentPlayerDisplay() {
    document.getElementById('current-player-name').innerText = gameState.players[gameState.currentPlayerIndex];
}

// Логика таймера
function startTimer() {
    clearInterval(timerInterval);
    timeLeft = gameState.turnSeconds || 120; // время на ход из настроек
    const halfTimeBeep = Math.round(timeLeft / 2); // секунда, на которой звучит сигнал середины
    const timerEl = document.getElementById('timer');
    timerEl.classList.remove('timer-warning');
    updateTimerText(timeLeft);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerText(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerEl.classList.remove('timer-warning');
            beep(500, 330, 0.4); // Короткий финальный сигнал
            showToast(`Время игрока ${gameState.players[gameState.currentPlayerIndex]} истекло!`, 'error');
            nextTurn(); // следующий игрок подтвердит начало своего хода кнопкой
        } else if (timeLeft === halfTimeBeep && halfTimeBeep > 10) {
            beep(250, 660, 0.3); // Сигнал на середине таймера
        } else if (timeLeft <= 10) {
            timerEl.classList.add('timer-warning');
            beep(100, 440, 0.2); // Короткие писки каждую секунду финала
        }
    }, 1000);
}

function updateTimerText(seconds) {
    const safeSeconds = Math.max(seconds, 0);
    const mins = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const secs = (safeSeconds % 60).toString().padStart(2, '0');
    document.getElementById('timer').innerText = `${mins}:${secs}`;
}

// Передача хода: таймер не запускается, пока следующий игрок не подтвердит ход
function nextTurn() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    updateCurrentPlayerDisplay();
    showTurnConfirmation();
}

// Остановка таймера
function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('timer-warning');
}

// Ожидание подтверждения начала хода следующего игрока
function showTurnConfirmation() {
    stopTimer();
    const confirmBtn = document.getElementById('confirm-turn-btn');
    const nextTurnBtn = document.getElementById('next-turn-btn');
    if (confirmBtn) confirmBtn.classList.remove('hidden');
    if (nextTurnBtn) nextTurnBtn.classList.add('hidden');
    const timerEl = document.getElementById('timer');
    if (timerEl) updateTimerText(gameState.turnSeconds || 120); // показать полное время
}

// Игрок на месте — запускаем таймер его хода
function confirmTurn() {
    const confirmBtn = document.getElementById('confirm-turn-btn');
    const nextTurnBtn = document.getElementById('next-turn-btn');
    if (confirmBtn) confirmBtn.classList.add('hidden');
    if (nextTurnBtn) nextTurnBtn.classList.remove('hidden');
    startTimer();
}

// === Выбор оставшихся фишек ===
// В комплекте Румикуба: 4 цвета × 13 номеров (по 2 копии) + 2 джокера
const TILE_COLORS = [
    { id: 'red',    name: 'Красные',  bg: '#e74c3c', fg: '#ffffff' },
    { id: 'blue',   name: 'Синие',    bg: '#3498db', fg: '#ffffff' },
    { id: 'yellow', name: 'Жёлтые',   bg: '#f1c40f', fg: '#2c3e50' },
    { id: 'black',  name: 'Чёрные',   bg: '#2c3e50', fg: '#ffffff' }
];
const TILE_VALUES = Array.from({ length: 13 }, (_, i) => i + 1);
const MAX_TILES_PER_CELL = 2;   // по 2 копии каждой фишки в комплекте
const MAX_JOKERS = 2;           // в комплекте 2 джокера
const JOKER_VALUE = 30;         // джокер = 30 очков

let racks = {};           // { индексИгрока: { counts, jokers } }
let enteredRacks = {};    // { индексИгрока: true } — подтверждён ли ввод фишек
let modalEditingIdx = null;
let modalRack = null;
let modalHistory = [];    // журнал действий в модалке для кнопки «Отменить»

function emptyRack() {
    const counts = {};
    TILE_COLORS.forEach(c => { counts[c.id] = new Array(13).fill(0); });
    return { counts: counts, jokers: 0 };
}

function getRack(idx) {
    if (!racks[idx]) racks[idx] = emptyRack();
    return racks[idx];
}

// Сумма очков за набор фишек: номер фишки + джокеры по 30
function calcRackTotal(rack) {
    let total = rack.jokers * JOKER_VALUE;
    TILE_COLORS.forEach(c => {
        rack.counts[c.id].forEach((count, i) => { total += count * (i + 1); });
    });
    return total;
}

// === Экран подсчёта очков ===
// Переход к экрану подсчета очков
function openEndRoundScreen() {
    clearInterval(timerInterval);
    const container = document.getElementById('scoring-inputs-container');
    container.innerHTML = '';
    gameState.players.forEach((player, idx) => {
        const card = document.createElement('div');
        card.className = 'score-input-card';
        card.id = `score-card-${idx}`;
        card.innerHTML = `
            <div class="winner-line" id="winner-line-${idx}">
                <label for="winner-${idx}">
                    <input type="radio" name="round-winner" id="winner-${idx}" value="${idx}" ${idx === 0 ? 'checked' : ''} onchange="toggleScoreInputs()">
                    <span class="winner-name">${player}</span>
                </label>
                <span class="winner-hint">(победитель — 0 очков)</span>
                <span class="winner-badge" id="winner-badge-${idx}">👑 Победитель</span>
            </div>
            <div class="rack-summary" id="rack-info-${idx}"></div>
            <button type="button" class="btn btn-secondary pick-tiles-btn" id="pick-btn-${idx}" onclick="openTilesModal(${idx})">🀄 Выбрать фишки</button>
        `;
        container.appendChild(card);
    });
    showScreen('screen-scoring');
    toggleScoreInputs();
}

function toggleScoreInputs() {
    const winnerRadio = document.querySelector('input[name="round-winner"]:checked');
    if (!winnerRadio) return;
    const winnerIdx = parseInt(winnerRadio.value);
    gameState.players.forEach((_, idx) => {
        const line = document.getElementById(`winner-line-${idx}`);
        const badge = document.getElementById(`winner-badge-${idx}`);
        const pickBtn = document.getElementById(`pick-btn-${idx}`);
        const rackInfo = document.getElementById(`rack-info-${idx}`);
        const isWinner = idx === winnerIdx;
        if (line) line.classList.toggle('is-winner', isWinner);
        if (badge) badge.style.display = isWinner ? 'inline-block' : 'none';
        if (pickBtn) pickBtn.disabled = isWinner;
        const card = document.getElementById(`score-card-${idx}`);
        if (card) card.classList.toggle('card-pending', !isWinner && !enteredRacks[idx]);
        if (rackInfo) {
            if (isWinner) {
                rackInfo.innerHTML = '<span style="color: #27ae60; font-weight: 600;">👑 Победитель — 0 очков</span>';
            } else if (enteredRacks[idx]) {
                rackInfo.innerHTML = renderRackSummary(idx);
            } else {
                rackInfo.innerHTML = '<span class="warning-hint">⚠️ Ещё не указаны фишки — нажмите «Выбрать фишки»</span>';
            }
        }
    });
}

// Сводка по оставшимся фишкам игрока (мини-фишки + итог)
function renderRackSummary(idx) {
    const rack = getRack(idx);
    if (calcRackTotal(rack) === 0 && rack.jokers === 0) {
        return '<span class="winner-rack-empty">Фишки не выбраны — 0 очков</span>';
    }
    let chipsHtml = '';
    TILE_COLORS.forEach(c => {
        rack.counts[c.id].forEach((count, i) => {
            if (count > 0) {
                const multi = count > 1 ? `×${count}` : '';
                chipsHtml += `<span class="mini-chip" style="background: ${c.bg}; color: ${c.fg};">${i + 1}${multi}</span>`;
            }
        });
    });
    for (let j = 0; j < rack.jokers; j++) {
        chipsHtml += '<span class="mini-chip joker-mini">J</span>';
    }
    const total = calcRackTotal(rack);
    return `<span class="rack-chips">${chipsHtml}</span><span class="rack-total">= ${total} очк.</span>`;
}

// === Модалка выбора фишек ===
function openTilesModal(idx) {
    modalEditingIdx = idx;
    modalRack = JSON.parse(JSON.stringify(getRack(idx)));
    modalHistory = [];
    document.getElementById('modal-player-name').innerText = gameState.players[idx];
    buildModalGrid();
    updateModalVisuals();
    document.getElementById('tiles-modal').classList.add('open');
}

function closeTilesModal() {
    document.getElementById('tiles-modal').classList.remove('open');
    modalEditingIdx = null;
    modalRack = null;
}

function buildModalGrid() {
    const grid = document.getElementById('modal-tile-grid');
    let html = '';
    TILE_COLORS.forEach(c => {
        html += `<div class="tile-color-section">
            <div class="tile-color-label" style="color: ${c.bg};">${c.name}</div>
            <div class="tile-steppers">`;
        TILE_VALUES.forEach(v => {
            html += `<span class="tile-stepper">
                <button type="button" class="tile-chip" style="--chip-bg: ${c.bg}; --chip-fg: ${c.fg};" onclick="addModalTile('${c.id}', ${v})">
                    ${v}<i class="tile-count" id="tile-badge-${c.id}-${v}"></i>
                </button>
                <button type="button" class="tile-minus" id="tile-minus-${c.id}-${v}" hidden onclick="removeModalTile('${c.id}', ${v})">−</button>
            </span>`;
        });
        html += `</div></div>`;
    });
    grid.innerHTML = html;
}

function pushModalHistory() {
    modalHistory.push(JSON.parse(JSON.stringify(modalRack)));
    if (modalHistory.length > 100) modalHistory.shift();
}

// Отмена последнего действия в модалке (ошибочно добавленная/убранная фишка и т.п.)
function undoModalAction() {
    if (modalHistory.length === 0) return;
    modalRack = modalHistory.pop();
    updateModalVisuals();
}

function addModalTile(colorId, value) {
    if (modalRack.counts[colorId][value - 1] < MAX_TILES_PER_CELL) {
        pushModalHistory();
        modalRack.counts[colorId][value - 1]++;
        updateModalVisuals();
    }
}

function removeModalTile(colorId, value) {
    if (modalRack.counts[colorId][value - 1] > 0) {
        pushModalHistory();
        modalRack.counts[colorId][value - 1]--;
        updateModalVisuals();
    }
}

function addModalJoker() {
    if (modalRack.jokers < MAX_JOKERS) {
        pushModalHistory();
        modalRack.jokers++;
        updateModalVisuals();
    }
}

function removeModalJoker() {
    if (modalRack.jokers > 0) {
        pushModalHistory();
        modalRack.jokers--;
        updateModalVisuals();
    }
}

function clearModalRack() {
    pushModalHistory();
    modalRack = emptyRack();
    updateModalVisuals();
}

function updateModalVisuals() {
    TILE_COLORS.forEach(c => {
        TILE_VALUES.forEach(v => {
            const count = modalRack.counts[c.id][v - 1];
            const badge = document.getElementById(`tile-badge-${c.id}-${v}`);
            const minus = document.getElementById(`tile-minus-${c.id}-${v}`);
            if (badge) {
                badge.textContent = count > 0 ? count : '';
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
            if (minus) minus.hidden = count === 0;
        });
    });
    const jokerBadge = document.getElementById('joker-count-badge');
    const jokerMinus = document.getElementById('joker-minus-btn');
    if (jokerBadge) {
        jokerBadge.textContent = modalRack.jokers > 0 ? modalRack.jokers : '';
        jokerBadge.style.display = modalRack.jokers > 0 ? 'flex' : 'none';
    }
    if (jokerMinus) jokerMinus.hidden = modalRack.jokers === 0;
    document.getElementById('modal-total-value').innerText = calcRackTotal(modalRack);
    const undoBtn = document.getElementById('undo-modal-btn');
    if (undoBtn) undoBtn.disabled = modalHistory.length === 0;
}

function saveModalRack() {
    if (modalEditingIdx === null) return;
    racks[modalEditingIdx] = JSON.parse(JSON.stringify(modalRack));
    enteredRacks[modalEditingIdx] = true; // игрок подтвердил ввод своих фишек
    closeTilesModal();
    toggleScoreInputs(); // перерисовать сводки на экране подсчёта
}

function backToMatch() {
    showScreen('screen-match');
    showTurnConfirmation(); // вернёмся в ожидание подтверждения хода
}

// === Расчёт очков по правилам Румикуб ===
function calculateAndSaveRound() {
    const winnerRadio = document.querySelector('input[name="round-winner"]:checked');
    if (!winnerRadio) {
        showToast('Выберите победителя раунда.', 'warning');
        return;
    }
    const winnerIdx = parseInt(winnerRadio.value);
    // Блокируем сохранение, пока кто-то из проигравших не указал свои фишки
    for (let idx = 0; idx < gameState.players.length; idx++) {
        if (idx !== winnerIdx && !enteredRacks[idx]) {
            showToast(`Игрок «${gameState.players[idx]}» ещё не указал свои фишки — откройте «Выбрать фишки» и нажмите «Готово».`, 'warning', 5000);
            const card = document.getElementById(`score-card-${idx}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }
    let losersTotalSum = 0;
    const roundResults = {};
    // Собираем отрицательные очки проигравших (суммы их оставшихся фишек)
    for (let idx = 0; idx < gameState.players.length; idx++) {
        const player = gameState.players[idx];
        if (idx !== winnerIdx) {
            const total = calcRackTotal(getRack(idx));
            roundResults[player] = -total;
            losersTotalSum += total;
        }
    }
    // Победитель получает сумму очков всех остальных со знаком плюс
    roundResults[gameState.players[winnerIdx]] = losersTotalSum;
    // Записываем в общую историю
    for (let player in roundResults) {
        gameState.scores[player].push(roundResults[player]);
    }
    saveToStorage();
    showToast(`Раунд ${gameState.currentRound} сохранён`, 'success');
    showScreen('screen-totals');
    renderTotalsTable();
}

// === Таблица результатов ===
function renderTotalsTable() {
    const table = document.getElementById('totals-table');
    let html = '';
    const roundsPlayed = gameState.players.reduce((max, p) => {
        const len = gameState.scores[p] ? gameState.scores[p].length : 0;
        return Math.max(max, len);
    }, 0);
    const totalRounds = Math.max(gameState.currentRound, roundsPlayed);

    // Шапка таблицы
    html += '<tr><th>Раунд</th>';
    gameState.players.forEach(p => { html += `<th>${p}</th>`; });
    html += '</tr>';

    // Строки по раундам
    for (let r = 0; r < totalRounds; r++) {
        html += `<tr><td>Р ${r + 1}</td>`;
        gameState.players.forEach(p => {
            const hasScore = gameState.scores[p] && gameState.scores[p].length > r;
            const score = hasScore ? gameState.scores[p][r] : 0;
            if (!hasScore) {
                html += '<td style="color: #bdc3c7;">—</td>';
            } else {
                const color = score > 0 ? 'green' : score < 0 ? 'red' : 'inherit';
                const sign = score > 0 ? '+' : '';
                html += `<td style="color: ${color}">${sign}${score}</td>`;
            }
        });
        html += '</tr>';
    }

    // Финальная строка общего итога
    html += '<tr class="total-row"><td>Всего</td>';
    gameState.players.forEach(p => {
        const total = gameState.scores[p] ? gameState.scores[p].reduce((sum, current) => sum + current, 0) : 0;
        const color = total > 0 ? 'green' : total < 0 ? 'red' : 'inherit';
        const sign = total > 0 ? '+' : '';
        html += `<td style="color: ${color}">${sign}${total}</td>`;
    });
    html += '</tr>';

    table.innerHTML = html;
}

// === Раунды и сброс ===
// Переход к следующему раунду
function startNextRound() {
    gameState.currentRound += 1;
    // По правилам, первый ход смещается по кругу к следующему игроку
    gameState.firstPlayerIndex = (gameState.firstPlayerIndex + 1) % gameState.players.length;
    gameState.currentPlayerIndex = gameState.firstPlayerIndex;
    racks = {};
    enteredRacks = {};
    saveToStorage();
    initMatchScreen();
}

// Полный сброс игры
function resetGame() {
    if (confirm('Вы уверены, что хотите сбросить текущую игру и начать заново?')) {
        clearInterval(timerInterval);
        localStorage.removeItem('rummikub_scores_state');
        gameState = { players: [], scores: {}, currentRound: 1, firstPlayerIndex: 0, currentPlayerIndex: 0, turnSeconds: 120 };
        racks = {};
        enteredRacks = {};
        document.getElementById('player-count').value = "4";
        const turnInput = document.getElementById('turn-time');
        if (turnInput) turnInput.value = "120";
        generatePlayerInputs();
        showScreen('screen-setup');
    }
}
