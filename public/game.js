'use strict';

let currentUser = null;

async function api(path, opts = {}) {
  const { method, body } = opts;
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    method: method || 'GET',
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  location.reload();
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('auth-err');
  btn.disabled = true; btn.textContent = '…'; err.textContent = '';
  try {
    const { user } = await api('/auth/login', {
      method: 'POST',
      body: { username: document.getElementById('l-user').value, password: document.getElementById('l-pass').value },
    });
    currentUser = user;
    const returnTo = new URLSearchParams(location.search).get('return');
    if (returnTo) { location.href = returnTo; return; }
    showGame();
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
}

function renderPrompt(text) {
  return text.replace(/___/g, '<span class="blank">?</span>');
}

function showResult(answered, submitted) {
  const correct = answered.correct === 1 || answered.correct === true;
  const pts = answered.points;
  const html = `
    <div class="result-card ${correct ? 'result-correct' : 'result-wrong'}">
      <div class="result-header">${correct ? '✅ ¡Correcto!' : '❌ Incorrecto'}</div>
      ${pts > 0 ? `<div class="result-pts">+<strong>${pts} punto${pts !== 1 ? 's' : ''}</strong> ganado${pts !== 1 ? 's' : ''}</div>` : '<div class="result-pts">Sin puntos esta vez</div>'}
      ${!correct ? `<div class="result-answer">Tu respuesta: <strong>${answered.submitted_answer ?? submitted}</strong></div>` : ''}
      <div class="result-answer">Respuesta correcta: <strong>${answered.correctAnswer}</strong></div>
      <div class="result-explanation">${answered.explanation}</div>
    </div>
    <div class="answered-badge">🕐 Vuelve mañana para el siguiente reto</div>
  `;
  document.getElementById('answer-area').innerHTML = html;
}

async function submitAnswer() {
  const input = document.getElementById('answer-input');
  const answer = input.value.trim();
  if (!answer) return;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = '…';
  try {
    const questionId = parseInt(document.getElementById('q-card').dataset.qid, 10);
    const res = await api('/game/answer', { method: 'POST', body: { questionId, answer } });
    showResult({ ...res, submitted_answer: answer }, answer);
    loadScores();
    updateNavPts();
  } catch (ex) {
    btn.disabled = false; btn.textContent = 'Responder';
    if (ex.message === 'Ya respondiste hoy') {
      document.getElementById('answer-area').innerHTML = '<div class="answered-badge">🕐 Ya respondiste hoy — vuelve mañana</div>';
    }
  }
}

async function updateNavPts() {
  try {
    const { scores } = await api('/game/scores');
    const me = scores.find(s => s.username === currentUser.username);
    document.getElementById('nav-pts').textContent = me ? `${me.total_points} pts` : '0 pts';
  } catch {}
}

async function loadScores() {
  try {
    const { scores } = await api('/game/scores');
    const el = document.getElementById('scores-list');
    if (!scores.length) { el.innerHTML = '<div class="empty-scores">Aún no hay puntuaciones</div>'; return; }
    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = scores.map((s, i) => `
      <div class="score-row">
        <div class="score-pos">${medals[i] || i + 1}</div>
        <div class="score-name">${s.username}</div>
        <div>
          <div class="score-pts">${s.total_points} pts</div>
          <div class="score-meta">${s.correct_count}/${s.total_answered} correctas</div>
        </div>
      </div>`).join('');
  } catch {}
}

async function showGame() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('navbar').style.display = 'flex';
  document.getElementById('nav-username').textContent = currentUser.username;

  try {
    const { question, answered } = await api('/game/today');
    document.getElementById('q-card').dataset.qid = question.id;

    const diffEl = document.getElementById('diff-badge');
    diffEl.textContent = question.difficulty === 'hard' ? '🔴 Difícil · 3 pts' : '🟢 Media · 1 pt';
    diffEl.className = `diff-badge ${question.difficulty === 'hard' ? 'diff-hard' : 'diff-medium'}`;

    document.getElementById('q-day').textContent = formatDate(new Date());
    document.getElementById('q-prompt').innerHTML = renderPrompt(question.prompt);

    if (answered) {
      showResult(answered);
    } else {
      document.getElementById('answer-area').innerHTML = `
        <div class="answer-wrap">
          <input class="answer-input" id="answer-input" type="text" placeholder="Tu respuesta…" autocomplete="off" maxlength="20"
            onkeydown="if(event.key==='Enter') submitAnswer()">
          <button class="btn-submit" id="submit-btn" onclick="submitAnswer()">Responder</button>
        </div>`;
      setTimeout(() => document.getElementById('answer-input')?.focus(), 100);
    }
  } catch {
    document.getElementById('q-prompt').textContent = 'Error cargando la pregunta. Intenta de nuevo.';
  }

  loadScores();
  updateNavPts();
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { user } = await api('/auth/me');
    currentUser = user;
    showGame();
  } catch {
    document.getElementById('auth-screen').style.display = 'block';
  }
});
