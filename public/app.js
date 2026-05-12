'use strict';

// ═══════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════
let currentUser   = null;
let allMatches    = [];
let allPhases     = [];
let myPredictions = {};   // matchId → prediction object
let rankingData   = [];
let prizesData    = [];
let activePhaseTab = null;
let activePredTab  = null;
let toastTimer     = null;

// ═══════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
    showApp();
  } catch {
    showAuth();
  }
});

// ═══════════════════════════════════════════════════════
// API Helper
// ═══════════════════════════════════════════════════════
async function api(path, opts = {}) {
  const { method, body, ...rest } = opts;
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    method: method || 'GET',
    body: body != null ? JSON.stringify(body) : undefined,
    ...rest,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

// ═══════════════════════════════════════════════════════
// Auth Flow
// ═══════════════════════════════════════════════════════
function showAuth() {
  document.getElementById('page-loader').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('page-loader').classList.add('hidden');
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('nav-username').textContent = currentUser.username;
  if (currentUser.role === 'admin')
    document.getElementById('admin-nav').classList.remove('hidden');
  navigate('home');
}

function switchAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('reg-form').classList.toggle('hidden',   tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-err');
  err.classList.add('hidden');
  btnLoading(btn, true);
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: {
        username: document.getElementById('l-user').value,
        password: document.getElementById('l-pass').value,
      },
    });
    currentUser = data.user;
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btnLoading(btn, false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn  = document.getElementById('reg-btn');
  const err  = document.getElementById('reg-err');
  const pass = document.getElementById('r-pass').value;
  const conf = document.getElementById('r-conf').value;
  err.classList.add('hidden');
  if (pass !== conf) {
    err.textContent = 'Las contraseñas no coinciden';
    err.classList.remove('hidden');
    return;
  }
  btnLoading(btn, true);
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: {
        username: document.getElementById('r-user').value,
        email:    document.getElementById('r-email').value,
        password: pass,
      },
    });
    currentUser = data.user;
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btnLoading(btn, false);
  }
}

async function handleLogout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  allMatches = []; allPhases = []; myPredictions = {}; rankingData = []; prizesData = [];
  document.getElementById('admin-nav').classList.add('hidden');
  showAuth();
}

// ═══════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === view);
  });
  document.getElementById(`view-${view}`)?.classList.remove('hidden');
  document.getElementById('nav-links').classList.remove('open');

  if      (view === 'home')        renderHome();
  else if (view === 'predictions') renderPredictions();
  else if (view === 'prizes')      renderPrizes();
  else if (view === 'admin')       renderAdmin();
  else if (view === 'profile')     renderProfile();
}

function toggleMenu() {
  document.getElementById('nav-links').classList.toggle('open');
}

// ═══════════════════════════════════════════════════════
// HOME VIEW
// ═══════════════════════════════════════════════════════
async function renderHome() {
  await Promise.all([loadRanking(), loadActivePhase()]);
}

async function loadActivePhase() {
  try {
    const [{ matches }, { phases }] = await Promise.all([api('/matches'), api('/phases')]);
    allMatches = matches;
    allPhases  = phases;
    const active = phases.find(p => p.is_active);
    const el     = document.getElementById('active-phase-matches');
    const title  = document.getElementById('active-phase-title');
    if (!active) {
      title.textContent = '📅 Fase Actual';
      el.innerHTML = '<div class="empty-state"><span class="empty-state-icon">⏳</span>Ninguna fase activa en este momento</div>';
      return;
    }
    title.textContent = `📅 ${active.display_name}`;
    const phaseMatches = matches.filter(m => m.phase_id === active.id);
    if (!phaseMatches.length) {
      el.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📭</span>No hay partidos en esta fase aún</div>';
      return;
    }
    const hasGroups = phaseMatches.some(m => m.group_name);
    if (hasGroups) {
      const byGroup = {};
      for (const m of phaseMatches) (byGroup[m.group_name || 'Otros'] = byGroup[m.group_name || 'Otros'] || []).push(m);
      el.innerHTML = Object.entries(byGroup).map(([g, ms]) => `
        <details class="group-accordion">
          <summary class="group-accordion-header">
            <span>Grupo ${g}</span>
            <span class="group-accordion-meta">${ms.filter(m => m.is_finished).length}/${ms.length} jugados</span>
          </summary>
          <div class="matches-grid group-accordion-body">${ms.map(m => homeMatchCard(m, active)).join('')}</div>
        </details>`).join('');
    } else {
      el.innerHTML = `<div class="matches-grid">${phaseMatches.map(m => homeMatchCard(m, active)).join('')}</div>`;
    }
  } catch {
    document.getElementById('active-phase-matches').innerHTML = '<p class="loading-text">Error cargando partidos</p>';
  }
}

function homeMatchCard(m, phase) {
  const status  = matchStatus(m, phase);
  const dateStr = formatDate(m.match_date);
  let scoreSection;
  if (m.is_finished) {
    scoreSection = `<div class="match-result">
      <span class="result-score">${m.home_score}</span>
      <span class="match-vs">—</span>
      <span class="result-score">${m.away_score}</span>
    </div>`;
  } else {
    scoreSection = `<p class="match-badge ${badgeClass(status)}" style="text-align:center;margin-top:.5rem">${badgeLabel(status)}</p>
      ${status === 'open' ? `<p class="deadline-ok" style="text-align:center">${deadlineLabel(m.match_date)}</p>` : ''}`;
  }
  return `<div class="match-card ${m.is_finished ? 'finished' : ''}">
    <div class="match-meta">
      ${m.group_name ? `<span class="match-group">Grupo ${esc(m.group_name)}</span>` : `<span class="match-group">${esc(m.phase_display || '')}</span>`}
      <span class="match-date">${dateStr}</span>
      <span class="match-badge ${badgeClass(status)}">${badgeLabel(status)}</span>
    </div>
    <div class="match-teams">
      <div class="team"><span class="team-flag">${m.home_flag || '🏳'}</span><span class="team-name">${esc(m.home_team)}</span></div>
      <span class="match-vs">VS</span>
      <div class="team"><span class="team-flag">${m.away_flag || '🏳'}</span><span class="team-name">${esc(m.away_team)}</span></div>
    </div>
    ${scoreSection}
  </div>`;
}

async function loadHomePrizes() {
  try {
    const { prizes } = await api('/prizes');
    prizesData = prizes;
    renderPrizesIn('home-prizes', prizes);
  } catch {}
}

function renderPrizesIn(containerId, prizes) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!prizes?.length) { el.innerHTML = '<p class="loading-text">Sin premios definidos aún</p>'; return; }
  const medalOf  = pos => pos <= 2 ? ['🥇','🥈'][pos-1] : '🥉';
  const labelOf  = pos => pos <= 2 ? `${ordinal(pos)} Lugar` : '3er Lugar';
  const stylePos = pos => pos <= 3 ? pos : 3;
  el.innerHTML = prizes.map(p => `
    <div class="prize-card prize-${stylePos(p.position)}">
      <div class="prize-medal">${medalOf(p.position)}</div>
      <div class="prize-info">
        <div class="prize-pos">${labelOf(p.position)}</div>
        <div class="prize-desc">${esc(p.description)}</div>
      </div>
    </div>`).join('');
}

// ── Ranking ──────────────────────────────────────────
async function loadRanking() {
  try {
    const { ranking } = await api('/ranking');
    rankingData = ranking;
    renderMyRankCard(ranking);
    renderFullRanking(ranking);
  } catch {
    document.getElementById('my-rank-card').innerHTML = '<p class="loading-text">Error cargando ranking</p>';
  }
}

function rankMedal(i) {
  // positions 0-based: 0=🥇 1=🥈 2=🥉 3=🥉 (two 3rd prizes) 4+=number
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2 || i === 3) return '🥉';
  return String(i + 1);
}

function renderMyRankCard(ranking) {
  const el  = document.getElementById('my-rank-card');
  el.classList.remove('skeleton-card');
  if (!ranking.length) {
    el.innerHTML = '<p class="loading-text">Sin participantes aún</p>';
    return;
  }
  const idx  = ranking.findIndex(u => u.id === currentUser.id);
  if (idx === -1) {
    el.innerHTML = '<p class="loading-text">Aún no tienes puntos registrados</p>';
    return;
  }
  const me     = ranking[idx];
  const medal  = rankMedal(idx);
  const isNum  = !isNaN(Number(medal));
  el.innerHTML = `
    <div class="my-rank-inner">
      <div class="my-rank-pos">
        <span class="my-rank-medal">${medal}</span>
        <span class="my-rank-place">${isNum ? ordinal(idx + 1) + ' lugar' : ordinal(idx + 1) + ' lugar'}</span>
      </div>
      <div class="my-rank-divider"></div>
      <div class="my-rank-pts">
        <span class="my-rank-pts-num">${me.total_points}</span>
        <span class="my-rank-pts-label">puntos</span>
      </div>
      <div class="my-rank-divider"></div>
      <div class="my-rank-stats">
        <span title="Marcador exacto">✓✓ <strong>${me.exact}</strong> exactos</span>
        <span title="Resultado correcto">✓ <strong>${me.correct}</strong> correctos</span>
      </div>
    </div>`;
}

function renderFullRanking(ranking) {
  const el = document.getElementById('full-ranking');
  if (!ranking.length) {
    el.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🏆</span>Aún no hay puntuaciones</div>';
    return;
  }
  el.innerHTML = `
    <div class="ranking-scroll-inner">
      <table class="rank-table">
        <thead><tr>
          <th class="rt-pos">#</th>
          <th>Participante</th>
          <th class="rt-pts">Pts</th>
          <th class="rt-exact">✓✓</th>
          <th class="rt-cor">✓</th>
        </tr></thead>
        <tbody>
          ${ranking.map((u, i) => `
            <tr class="${u.id === currentUser.id ? 'rt-me' : ''}">
              <td class="rt-pos">${rankMedal(i)}</td>
              <td class="rt-name">${esc(u.username)}${u.id === currentUser.id ? ' <span class="rt-you">(tú)</span>' : ''}</td>
              <td class="rt-pts">${u.total_points}</td>
              <td class="rt-exact">${u.exact}</td>
              <td class="rt-cor">${u.correct}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Matches ───────────────────────────────────────────
async function loadMatchesAndPhases() {
  try {
    const [mRes, phRes, prRes] = await Promise.all([
      api('/matches'),
      api('/phases'),
      api('/predictions'),
    ]);
    allMatches    = mRes.matches;
    allPhases     = phRes.phases;
    myPredictions = {};
    for (const p of prRes.predictions) myPredictions[p.match_id] = p;

    renderPhaseTabs();
  } catch {
    document.getElementById('matches-grid').innerHTML = '<p class="loading-text">Error cargando partidos</p>';
  }
}

function phaseIsVisible(ph) {
  // Show if active, or if it already has at least one finished match (past phase)
  if (ph.is_active) return true;
  return allMatches.some(m => m.phase_id === ph.id && m.is_finished);
}

function renderPhaseTabs() {
  const tabs = document.getElementById('phase-tabs');
  tabs.innerHTML = allPhases.map((ph) => {
    if (!phaseIsVisible(ph)) return '';
    return `<button
      class="phase-tab ${ph.is_active ? '' : 'inactive'} ${(activePhaseTab ?? firstActivePhaseId()) === ph.id ? 'active' : ''}"
      onclick="selectPhaseTab(${ph.id})">
      <span class="tab-dot"></span>${ph.display_name}
    </button>`;
  }).join('');

  if (!activePhaseTab) activePhaseTab = firstActivePhaseId() || allPhases[0]?.id;
  renderMatchesForPhase(activePhaseTab);
}

function firstActivePhaseId() {
  const active = allPhases.find(p => p.is_active);
  return active?.id || null;
}

function selectPhaseTab(phaseId) {
  activePhaseTab = phaseId;
  document.querySelectorAll('#phase-tabs .phase-tab').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset?.phaseId) === phaseId);
  });
  // re-render tabs to keep active class correct
  document.querySelectorAll('#phase-tabs .phase-tab').forEach(b => {
    const onClick = b.getAttribute('onclick');
    const id = parseInt(onClick.match(/\d+/)?.[0]);
    b.classList.toggle('active', id === phaseId);
  });
  renderMatchesForPhase(phaseId);
}

function renderMatchesForPhase(phaseId) {
  const grid = document.getElementById('matches-grid');
  if (!grid) return; // element removed from home redesign — safe to skip
  const phase = allPhases.find(p => p.id === phaseId);
  const matches = allMatches.filter(m => m.phase_id === phaseId);

  if (!matches.length) {
    grid.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📭</span>No hay partidos en esta fase aún</div>';
    return;
  }

  // Group by group_name for group stage
  const hasGroups = matches.some(m => m.group_name);
  if (hasGroups) {
    const byGroup = {};
    for (const m of matches) {
      const g = m.group_name || 'Otros';
      (byGroup[g] = byGroup[g] || []).push(m);
    }
    grid.innerHTML = Object.entries(byGroup).map(([g, ms]) => `
      <div style="grid-column:1/-1">
        <div class="group-header">Grupo ${g}</div>
        <div class="matches-grid" style="margin:0">
          ${ms.map(m => matchCard(m, myPredictions[m.id], phase)).join('')}
        </div>
      </div>
    `).join('');
  } else {
    grid.innerHTML = matches.map(m => matchCard(m, myPredictions[m.id], phase)).join('');
  }
}

function matchCard(m, pred, phase) {
  const status  = matchStatus(m, phase);
  const dateStr = formatDate(m.match_date);
  const savedHome = pred?.home_score ?? '';
  const savedAway = pred?.away_score ?? '';

  let scoreSection = '';
  if (m.is_finished) {
    scoreSection = `
      <div class="match-result">
        <span class="result-score">${m.home_score}</span>
        <span class="match-vs">—</span>
        <span class="result-score">${m.away_score}</span>
      </div>
      ${pred ? predCompare(pred, m) : '<p class="predict-info">Sin pronóstico</p>'}
    `;
  } else if (status === 'open') {
    scoreSection = `
      <div class="match-predict">
        <div class="predict-inputs">
          <input class="score-input" id="h${m.id}" type="number" min="0" max="30"
            value="${esc(String(savedHome))}" placeholder="0"
            onchange="autoSave(${m.id})">
          <span class="predict-sep">:</span>
          <input class="score-input" id="a${m.id}" type="number" min="0" max="30"
            value="${esc(String(savedAway))}" placeholder="0"
            onchange="autoSave(${m.id})">
          <button class="btn btn-primary btn-sm" onclick="savePrediction(${m.id})" id="save-btn-${m.id}">
            ${pred ? '✏️ Editar' : '💾 Guardar'}
          </button>
        </div>
        ${pred ? `<p class="predict-saved-label">Guardado: ${pred.home_score}–${pred.away_score}</p>` : ''}
        <p class="deadline-ok">${deadlineLabel(m.match_date)}</p>
      </div>`;
  } else if (status === 'closed') {
    scoreSection = `
      <p class="match-badge badge-closed" style="text-align:center">🔒 Pronósticos cerrados</p>
      ${pred ? `<p class="predict-saved-label" style="margin-top:.5rem;text-align:center">Tu pronóstico: ${pred.home_score}–${pred.away_score}</p>` : '<p class="predict-info">Sin pronóstico registrado</p>'}
    `;
  } else {
    scoreSection = pred
      ? `<div style="text-align:center;margin-top:.25rem">
           <p class="predict-saved-label" style="margin-bottom:.4rem">Tu pronóstico: ${pred.home_score}–${pred.away_score}</p>
           <p class="match-badge badge-inactive" style="display:inline-block">⏳ Fase no activa</p>
         </div>`
      : `<p class="match-badge badge-inactive" style="text-align:center">⏳ Sin pronóstico</p>`;
  }

  const resultClass = m.is_finished && pred
    ? (pred.points === 3 ? 'result-exact' : pred.points === 1 ? 'result-correct' : pred.points === 0 ? 'result-wrong' : '')
    : '';

  return `
    <div class="match-card ${m.is_finished ? 'finished' : ''} ${resultClass}">
      <div class="match-meta">
        ${m.group_name ? `<span class="match-group">Grupo ${esc(m.group_name)}</span>` : `<span class="match-group">${esc(m.phase_display || '')}</span>`}
        <span class="match-date">${dateStr}</span>
        <span class="match-badge ${badgeClass(status)}">${badgeLabel(status)}</span>
      </div>
      <div class="match-teams">
        <div class="team">
          <span class="team-flag">${m.home_flag || '🏳'}</span>
          <span class="team-name">${esc(m.home_team)}</span>
        </div>
        <span class="match-vs">VS</span>
        <div class="team">
          <span class="team-flag">${m.away_flag || '🏳'}</span>
          <span class="team-name">${esc(m.away_team)}</span>
        </div>
      </div>
      ${scoreSection}
    </div>`;
}

function predCompare(pred, m) {
  let pts = pred.points;
  let ptsClass = 'pts-pending', ptsLabel = '? pts';
  if (pts === 3)         { ptsClass = 'pts-3'; ptsLabel = '+3 pts ✓✓'; }
  else if (pts === 1)    { ptsClass = 'pts-1'; ptsLabel = '+1 pt  ✓';  }
  else if (pts === 0)    { ptsClass = 'pts-0'; ptsLabel = '0 pts  ✗';  }
  return `
    <div class="pred-compare">
      <span class="pred-label">Tu pronóstico:</span>
      <span class="pred-score">${pred.home_score}–${pred.away_score}</span>
      <span class="pred-pts ${ptsClass}">${ptsLabel}</span>
    </div>`;
}

// Save prediction
async function savePrediction(matchId) {
  const hEl = document.getElementById(`h${matchId}`);
  const aEl = document.getElementById(`a${matchId}`);
  const btn = document.getElementById(`save-btn-${matchId}`);
  if (!hEl || !aEl) return;
  const home = parseInt(hEl.value, 10);
  const away = parseInt(aEl.value, 10);
  if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
    showToast('Ingresa marcadores válidos (0–30)', 'error'); return;
  }
  btnLoading(btn, true);
  try {
    await api('/predictions', { method: 'POST', body: { matchId, homeScore: home, awayScore: away } });
    myPredictions[matchId] = { ...(myPredictions[matchId] || {}), match_id: matchId, home_score: home, away_score: away };
    showToast('¡Pronóstico guardado!', 'success');
    renderPredGrid(activePredTab);
  } catch (ex) {
    showToast(ex.message, 'error');
  } finally {
    btnLoading(btn, false);
  }
}

let autoSaveTimers = {};
function autoSave(matchId) {
  clearTimeout(autoSaveTimers[matchId]);
  autoSaveTimers[matchId] = setTimeout(() => savePrediction(matchId), 800);
}

// ═══════════════════════════════════════════════════════
// MY PREDICTIONS VIEW
// ═══════════════════════════════════════════════════════
async function renderPredictions() {
  const [mRes, phRes, prRes] = await Promise.all([
    api('/matches').catch(() => ({ matches: [] })),
    api('/phases').catch(() => ({ phases: [] })),
    api('/predictions').catch(() => ({ predictions: [] })),
  ]);
  allMatches    = mRes.matches;
  allPhases     = phRes.phases;
  myPredictions = {};
  for (const p of prRes.predictions) myPredictions[p.match_id] = p;

  const tabs = document.getElementById('pred-phase-tabs');
  const visiblePhases = allPhases.filter(ph => phaseIsVisible(ph) && allMatches.some(m => m.phase_id === ph.id));
  if (activePredTab === null && visiblePhases.length) activePredTab = visiblePhases[0].id;
  tabs.innerHTML = visiblePhases.map((ph) => {
    return `<button
      class="phase-tab ${ph.is_active ? '' : 'inactive'} ${activePredTab === ph.id ? 'active' : ''}"
      onclick="selectPredTab(${ph.id})">
      <span class="tab-dot"></span>${ph.display_name}
    </button>`;
  }).join('');

  if (!activePredTab) activePredTab = allPhases[0]?.id;
  renderPredGrid(activePredTab);
}

function selectPredTab(phaseId) {
  activePredTab = phaseId;
  document.querySelectorAll('#pred-phase-tabs .phase-tab').forEach(b => {
    const id = parseInt(b.getAttribute('onclick').match(/\d+/)?.[0]);
    b.classList.toggle('active', id === phaseId);
  });
  renderPredGrid(phaseId);
}

function renderPredGrid(phaseId) {
  const grid  = document.getElementById('pred-grid');
  const phase = allPhases.find(p => p.id === phaseId);
  const matches = allMatches.filter(m => m.phase_id === phaseId);
  if (!matches.length) {
    grid.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📭</span>Sin partidos en esta fase</div>';
    return;
  }
  const hasGroups = matches.some(m => m.group_name);
  if (hasGroups) {
    const byGroup = {};
    for (const m of matches) {
      const g = m.group_name || 'Otros';
      (byGroup[g] = byGroup[g] || []).push(m);
    }
    grid.innerHTML = Object.entries(byGroup).map(([g, ms]) => `
      <div style="grid-column:1/-1">
        <div class="group-header">Grupo ${g}</div>
        <div class="matches-grid" style="margin:0">
          ${ms.map(m => matchCard(m, myPredictions[m.id], phase)).join('')}
        </div>
      </div>
    `).join('');
  } else {
    grid.innerHTML = matches.map(m => matchCard(m, myPredictions[m.id], phase)).join('');
  }
}

// ═══════════════════════════════════════════════════════
// PRIZES VIEW
// ═══════════════════════════════════════════════════════
async function renderPrizes() {
  try {
    const { prizes } = await api('/prizes');
    prizesData = prizes;
    renderPrizesIn('prizes-list', prizes);
  } catch {
    document.getElementById('prizes-list').innerHTML = '<p class="loading-text">Error cargando premios</p>';
  }
}

// ═══════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════
async function renderAdmin() {
  const [phRes, usRes, prRes] = await Promise.all([
    api('/phases'),
    api('/admin/users'),
    api('/prizes'),
  ]);
  allPhases  = phRes.phases;
  prizesData = prRes.prizes;

  // Phase management
  const phEl = document.getElementById('admin-phases');
  phEl.innerHTML = `<div class="phases-list">${allPhases.map(ph => `
    <div class="phase-row">
      <span class="phase-row-name">${esc(ph.display_name)}</span>
      <span class="phase-status ${ph.is_active ? 'status-active' : 'status-inactive'}">${ph.is_active ? '✅ Activa' : '⏸ Inactiva'}</span>
      <button class="btn btn-sm ${ph.is_active ? 'btn-warning' : 'btn-primary'}"
        onclick="togglePhase(${ph.id}, ${ph.is_active})">
        ${ph.is_active ? 'Desactivar' : 'Activar'}
      </button>
    </div>`).join('')}</div>`;

  // Phase selects
  const opts = allPhases.map(ph => `<option value="${ph.id}">${esc(ph.display_name)}</option>`).join('');
  document.getElementById('result-phase-select').innerHTML = '<option value="">— Selecciona una fase —</option>' + opts;
  document.getElementById('am-phase').innerHTML = '<option value="">Seleccionar...</option>' + opts;

  // Prizes (positions 1–4)
  for (const p of prizesData) {
    const el = document.getElementById(`prize-${p.position}`);
    if (el) el.value = p.description;
  }

  // Users
  renderAdminUsers(usRes.users);
}

async function togglePhase(phaseId, currentlyActive) {
  try {
    await api(`/admin/phases/${phaseId}`, { method: 'PUT', body: { isActive: !currentlyActive } });
    showToast(`Fase ${currentlyActive ? 'desactivada' : 'activada'}`, 'success');
    renderAdmin();
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

async function loadResultMatches() {
  const phaseId = parseInt(document.getElementById('result-phase-select').value, 10);
  const el = document.getElementById('result-matches-list');
  if (!phaseId) { el.innerHTML = ''; return; }

  try {
    const { matches } = await api('/matches');
    const filtered = matches.filter(m => m.phase_id === phaseId);
    if (!filtered.length) {
      el.innerHTML = '<p class="loading-text">No hay partidos en esta fase</p>';
      return;
    }
    el.innerHTML = filtered.map(m => `
      <div class="result-match-row" id="rmr-${m.id}">
        <div class="result-match-header">
          <span class="result-match-teams">${m.home_flag} ${esc(m.home_team)} vs ${esc(m.away_team)} ${m.away_flag}</span>
          <span class="match-date">${formatDate(m.match_date)}</span>
          ${m.is_finished ? `<span class="finished-badge">✅ ${m.home_score}–${m.away_score}</span>` : ''}
        </div>
        <div class="result-inputs">
          <input class="score-input" id="rh${m.id}" type="number" min="0" max="30"
            value="${m.is_finished ? m.home_score : ''}" placeholder="Local">
          <span>:</span>
          <input class="score-input" id="ra${m.id}" type="number" min="0" max="30"
            value="${m.is_finished ? m.away_score : ''}" placeholder="Visita">
          <button class="btn btn-primary btn-sm" onclick="setResult(${m.id})">
            ${m.is_finished ? '🔄 Actualizar' : '✅ Registrar'}
          </button>
          ${m.is_finished
            ? `<button class="btn btn-ghost btn-sm" onclick="clearResult(${m.id})" title="Borra el marcador y los puntos calculados">🗑️ Limpiar</button>`
            : ''
          }
        </div>
      </div>`).join('');
  } catch (ex) {
    el.innerHTML = `<p class="loading-text">Error: ${esc(ex.message)}</p>`;
  }
}

async function setResult(matchId) {
  const home = parseInt(document.getElementById(`rh${matchId}`)?.value, 10);
  const away = parseInt(document.getElementById(`ra${matchId}`)?.value, 10);
  if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
    showToast('Ingresa marcadores válidos', 'error'); return;
  }
  try {
    const { stats, total } = await api(`/admin/matches/${matchId}/result`, {
      method: 'PUT', body: { homeScore: home, awayScore: away }
    });
    showToast(`Resultado ${home}–${away} registrado. ${total} pronósticos: ${stats.exact} exactos, ${stats.correct} correctos, ${stats.wrong} fallidos`, 'success');
    loadResultMatches();
    loadRanking();
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

async function deleteMatch(matchId) {
  if (!confirm('¿Eliminar este partido? También se borrarán los pronósticos.')) return;
  try {
    await api(`/admin/matches/${matchId}`, { method: 'DELETE' });
    showToast('Partido eliminado', 'success');
    loadResultMatches();
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

async function clearResult(matchId) {
  if (!confirm('¿Limpiar el resultado? Se borrarán el marcador y los puntos calculados, pero el partido sigue existiendo.')) return;
  try {
    await api(`/admin/matches/${matchId}/result`, { method: 'DELETE' });
    showToast('Resultado limpiado. Puedes volver a registrarlo.', 'success');
    loadResultMatches();
    loadRanking();
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

async function handleAddMatch(e) {
  e.preventDefault();
  const body = {
    phaseId:   document.getElementById('am-phase').value,
    homeTeam:  document.getElementById('am-home').value,
    awayTeam:  document.getElementById('am-away').value,
    homeFlag:  document.getElementById('am-home-flag').value,
    awayFlag:  document.getElementById('am-away-flag').value,
    matchDate: document.getElementById('am-date').value,
  };
  try {
    await api('/admin/matches', { method: 'POST', body });
    showToast('Partido añadido correctamente', 'success');
    e.target.reset();
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

async function handleUpdatePrizes(e) {
  e.preventDefault();
  const prizes = [1, 2, 3, 4].map(pos => ({
    position: pos,
    description: document.getElementById(`prize-${pos}`)?.value || '',
  })).filter(p => p.description);
  try {
    await api('/admin/prizes', { method: 'PUT', body: { prizes } });
    showToast('Premios actualizados', 'success');
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

function renderAdminUsers(users) {
  const el = document.getElementById('admin-users');
  if (!users.length) {
    el.innerHTML = '<p class="loading-text">Sin usuarios</p>'; return;
  }
  el.innerHTML = `<div class="users-table-wrap"><table class="users-table">
    <thead><tr>
      <th>#</th><th>Usuario</th><th>Correo</th><th>Rol</th><th>Puntos</th><th>Registro</th><th></th>
    </tr></thead>
    <tbody>${users.map((u, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(u.username)}</td>
        <td style="color:var(--text2);font-size:.82rem">${u.email ? `<a href="mailto:${esc(u.email)}" style="color:var(--primary)">${esc(u.email)}</a>` : '<span style="color:var(--text3)">—</span>'}</td>
        <td><span class="${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
        <td style="font-weight:700;color:var(--primary)">${u.total_points}</td>
        <td style="color:var(--text3);font-size:.8rem">${formatDate(u.created_at)}</td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="handleResetPassword(${u.id}, '${esc(u.username)}')">🔑 Reset</button>
          ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${esc(u.username)}')">🗑️</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('es', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

function matchStatus(m, phase) {
  if (m.is_finished) return 'finished';
  if (!phase?.is_active) return 'inactive';
  const ms  = new Date(m.match_date).getTime();
  const now = Date.now();
  if (now >= ms - 10 * 60 * 1000) return 'closed';
  return 'open';
}

function deadlineLabel(dateStr) {
  const ms  = new Date(dateStr).getTime();
  const rem = ms - Date.now() - 10 * 60 * 1000;
  if (rem <= 0) return '🔒 Cerrado';
  const h = Math.floor(rem / 3600000);
  const m = Math.floor((rem % 3600000) / 60000);
  if (h > 24) return `⏰ Cierre en ${Math.floor(h/24)}d ${h%24}h`;
  if (h > 0)  return `⏰ Cierre en ${h}h ${m}m`;
  return `⏰ Cierre en ${m} min`;
}

function badgeClass(status) {
  const map = { open:'badge-open', closed:'badge-closed', finished:'badge-finished', inactive:'badge-inactive' };
  return map[status] || 'badge-inactive';
}

function badgeLabel(status) {
  const map = { open:'🟢 Abierto', closed:'🔒 Cerrado', finished:'✅ Finalizado', inactive:'⏳ Inactivo' };
  return map[status] || status;
}

function ordinal(n) {
  return ['1er','2do','3ro','4to','5to'][n-1] || `${n}°`;
}

function showToast(msg, type = 'info') {
  clearTimeout(toastTimer);
  const el = document.getElementById('toast');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('hiding'); }, 260);
  }, 3500);
}

function btnLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('btn-loading', loading);
  btn.disabled = loading;
}

// Refresh ranking every 2 minutes while app is open
setInterval(() => {
  if (currentUser && !document.getElementById('view-home').classList.contains('hidden'))
    loadRanking();
}, 120_000);

// Re-render match cards every 60 s so "closed" status updates in real time
setInterval(() => {
  if (!currentUser) return;
  if (!document.getElementById('view-home').classList.contains('hidden'))
    loadActivePhase();
  if (!document.getElementById('view-predictions').classList.contains('hidden'))
    renderPredGrid(activePredTab);
}, 60_000);

// ═══════════════════════════════════════════════════════
// PROFILE VIEW
// ═══════════════════════════════════════════════════════
function renderProfile() {
  document.getElementById('p-email').value = currentUser.email || '';
  document.getElementById('profile-err').classList.add('hidden');
  document.getElementById('chpwd-err').classList.add('hidden');
  document.getElementById('chpwd-form').reset();
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const btn   = e.submitter;
  const err   = document.getElementById('profile-err');
  const email = document.getElementById('p-email').value.trim();
  err.classList.add('hidden');
  btnLoading(btn, true);
  try {
    const data = await api('/auth/profile', { method: 'PUT', body: { email } });
    currentUser = data.user;
    showToast('Correo actualizado', 'success');
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btnLoading(btn, false);
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const btn      = e.submitter;
  const err      = document.getElementById('chpwd-err');
  const current  = document.getElementById('cp-current').value;
  const newPwd   = document.getElementById('cp-new').value;
  const confirm  = document.getElementById('cp-conf').value;
  err.classList.add('hidden');
  if (newPwd !== confirm) {
    err.textContent = 'Las contraseñas no coinciden';
    err.classList.remove('hidden');
    return;
  }
  if (newPwd.length < 6) {
    err.textContent = 'La contraseña debe tener al menos 6 caracteres';
    err.classList.remove('hidden');
    return;
  }
  btnLoading(btn, true);
  try {
    await api('/auth/password', { method: 'PUT', body: { currentPassword: current, newPassword: newPwd } });
    document.getElementById('chpwd-form').reset();
    showToast('Contraseña actualizada', 'success');
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btnLoading(btn, false);
  }
}

async function handleResetPassword(userId, username) {
  const newPwd = prompt(`Nueva contraseña para "${username}" (mín. 6 caracteres):`);
  if (!newPwd) return;
  if (newPwd.length < 6) { showToast('Mínimo 6 caracteres', 'error'); return; }
  try {
    await api(`/admin/users/${userId}/reset-password`, { method: 'PUT', body: { newPassword: newPwd } });
    showToast(`Contraseña de ${username} restablecida`, 'success');
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`¿Eliminar a "${username}"? Se borrarán también todos sus pronósticos y puntos. Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/admin/users/${userId}`, { method: 'DELETE' });
    showToast(`Usuario "${username}" eliminado`, 'success');
    renderAdmin();
  } catch (ex) {
    showToast(ex.message, 'error');
  }
}

function showForgotMsg(e) {
  e.preventDefault();
  showToast('Contacta al administrador para restablecer tu contraseña', 'info');
}
