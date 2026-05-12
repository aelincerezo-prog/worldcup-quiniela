'use strict';
const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const { getDb }    = require('./database');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'quiniela-mundial-2026-secret-CHANGE-IN-PROD';
const COOKIE = 'qm_token';

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
});

// ── Auth helpers ─────────────────────────────────────────────────────────────
function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '7d' });
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function auth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

function sanitize(str) {
  return String(str || '').trim().substring(0, 200);
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = sanitize(username);
  if (user.length < 3 || user.length > 30)
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 30 caracteres' });
  if (!/^[\w\sáéíóúñÁÉÍÓÚÑüÜ]+$/u.test(user))
    return res.status(400).json({ error: 'Usuario solo puede contener letras, números y guiones bajos' });
  if (String(password).length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  const db = getDb();
  try {
    const hash  = bcrypt.hashSync(String(password), 12);
    const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    const role  = count === 0 ? 'admin' : 'user';
    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(user, hash, role);
    const newUser = { id: result.lastInsertRowid, username: user, role };
    setCookie(res, sign(newUser));
    res.status(201).json({ user: newUser });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(sanitize(username));
  if (!user || !bcrypt.compareSync(String(password), user.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  const payload = { id: user.id, username: user.username, role: user.role };
  setCookie(res, sign(payload));
  res.json({ user: payload });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// ── PHASES ────────────────────────────────────────────────────────────────────
app.get('/api/phases', auth, (req, res) => {
  const db = getDb();
  res.json({ phases: db.prepare('SELECT * FROM phases ORDER BY sort_order').all() });
});

// ── MATCHES ───────────────────────────────────────────────────────────────────
app.get('/api/matches', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.*, p.name AS phase_name, p.display_name AS phase_display, p.is_active AS phase_active
    FROM matches m JOIN phases p ON m.phase_id = p.id
    ORDER BY p.sort_order, m.match_date
  `).all();
  res.json({ matches: rows });
});

// ── PREDICTIONS ───────────────────────────────────────────────────────────────
app.get('/api/predictions', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pr.*,
           m.home_team, m.away_team, m.home_flag, m.away_flag,
           m.match_date, m.home_score AS real_home, m.away_score AS real_away,
           m.is_finished, m.group_name,
           p.display_name AS phase_display, p.is_active AS phase_active, p.sort_order AS phase_order
    FROM predictions pr
    JOIN matches m ON pr.match_id = m.id
    JOIN phases  p ON m.phase_id  = p.id
    WHERE pr.user_id = ?
    ORDER BY p.sort_order, m.match_date
  `).all(req.user.id);
  res.json({ predictions: rows });
});

app.post('/api/predictions', auth, (req, res) => {
  const { matchId, homeScore, awayScore } = req.body;
  if (matchId == null || homeScore == null || awayScore == null)
    return res.status(400).json({ error: 'Datos incompletos' });

  const home = parseInt(homeScore, 10);
  const away = parseInt(awayScore, 10);
  if (isNaN(home) || isNaN(away) || home < 0 || away < 0 || home > 30 || away > 30)
    return res.status(400).json({ error: 'Marcadores inválidos (0–30)' });

  const db    = getDb();
  const match = db.prepare(`
    SELECT m.*, p.is_active AS phase_active
    FROM matches m JOIN phases p ON m.phase_id = p.id
    WHERE m.id = ?
  `).get(parseInt(matchId, 10));

  if (!match)               return res.status(404).json({ error: 'Partido no encontrado' });
  if (!match.phase_active)  return res.status(403).json({ error: 'Esta fase aún no está activa' });
  if (match.is_finished)    return res.status(403).json({ error: 'El partido ya terminó' });

  const matchMs = new Date(match.match_date).getTime();
  if (isNaN(matchMs))       return res.status(500).json({ error: 'Fecha de partido inválida' });
  if (Date.now() >= matchMs - 10 * 60 * 1000)
    return res.status(403).json({ error: 'Ya no se aceptan pronósticos (cierre 10 min antes)' });

  try {
    db.prepare(`
      INSERT INTO predictions (user_id, match_id, home_score, away_score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, match_id) DO UPDATE SET
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        updated_at = datetime('now')
    `).run(req.user.id, match.id, home, away);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar el pronóstico' });
  }
});

// ── RANKING ───────────────────────────────────────────────────────────────────
app.get('/api/ranking', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.id, u.username,
           COALESCE(SUM(pr.points), 0)                          AS total_points,
           COUNT(CASE WHEN pr.points IS NOT NULL THEN 1 END)    AS scored,
           COUNT(CASE WHEN pr.points = 3         THEN 1 END)    AS exact,
           COUNT(CASE WHEN pr.points = 1         THEN 1 END)    AS correct
    FROM users u
    LEFT JOIN predictions pr ON u.id = pr.user_id
    GROUP BY u.id
    ORDER BY total_points DESC, exact DESC, u.username ASC
  `).all();
  res.json({ ranking: rows });
});

// ── PRIZES ────────────────────────────────────────────────────────────────────
app.get('/api/prizes', auth, (req, res) => {
  const db = getDb();
  res.json({ prizes: db.prepare('SELECT * FROM prizes ORDER BY position').all() });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

// Toggle phase active/inactive
app.put('/api/admin/phases/:id', auth, adminOnly, (req, res) => {
  const { isActive } = req.body;
  const db = getDb();
  const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!phase) return res.status(404).json({ error: 'Fase no encontrada' });
  db.prepare('UPDATE phases SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, phase.id);
  res.json({ ok: true });
});

// Set match result and calculate points
app.put('/api/admin/matches/:id/result', auth, adminOnly, (req, res) => {
  const { homeScore, awayScore } = req.body;
  const home = parseInt(homeScore, 10);
  const away = parseInt(awayScore, 10);
  if (isNaN(home) || isNaN(away) || home < 0 || away < 0)
    return res.status(400).json({ error: 'Marcadores inválidos' });

  const db      = getDb();
  const matchId = parseInt(req.params.id, 10);
  const match   = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  db.prepare('UPDATE matches SET home_score = ?, away_score = ?, is_finished = 1 WHERE id = ?')
    .run(home, away, matchId);

  const realSign = Math.sign(home - away);
  let stats = { exact: 0, correct: 0, wrong: 0 };

  const preds = db.prepare('SELECT * FROM predictions WHERE match_id = ?').all(matchId);
  const upd   = db.prepare('UPDATE predictions SET points = ? WHERE id = ?');
  for (const p of preds) {
    let pts = 0;
    if (p.home_score === home && p.away_score === away) {
      pts = 3; stats.exact++;
    } else if (Math.sign(p.home_score - p.away_score) === realSign) {
      pts = 1; stats.correct++;
    } else {
      stats.wrong++;
    }
    upd.run(pts, p.id);
  }
  res.json({ ok: true, stats, total: preds.length });
});

// Add a new match (for knockout rounds)
app.post('/api/admin/matches', auth, adminOnly, (req, res) => {
  const { phaseId, homeTeam, awayTeam, homeFlag, awayFlag, matchDate } = req.body;
  if (!phaseId || !homeTeam || !awayTeam || !matchDate)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  const db = getDb();
  const r  = db.prepare(`
    INSERT INTO matches (phase_id, home_team, away_team, home_flag, away_flag, match_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(phaseId, 10),
    sanitize(homeTeam), sanitize(awayTeam),
    sanitize(homeFlag || ''), sanitize(awayFlag || ''),
    sanitize(matchDate)
  );
  res.status(201).json({ ok: true, matchId: r.lastInsertRowid });
});

// Update match teams/date (before it's finished)
app.put('/api/admin/matches/:id', auth, adminOnly, (req, res) => {
  const { homeTeam, awayTeam, homeFlag, awayFlag, matchDate } = req.body;
  const db    = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!match)             return res.status(404).json({ error: 'Partido no encontrado' });
  if (match.is_finished)  return res.status(400).json({ error: 'No se puede editar un partido finalizado' });

  db.prepare(`
    UPDATE matches SET home_team=?, away_team=?, home_flag=?, away_flag=?, match_date=? WHERE id=?
  `).run(
    sanitize(homeTeam), sanitize(awayTeam),
    sanitize(homeFlag || ''), sanitize(awayFlag || ''),
    sanitize(matchDate), match.id
  );
  res.json({ ok: true });
});

// Delete match (non-finished only)
app.delete('/api/admin/matches/:id', auth, adminOnly, (req, res) => {
  const db    = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!match)            return res.status(404).json({ error: 'Partido no encontrado' });
  if (match.is_finished) return res.status(400).json({ error: 'No se puede eliminar un partido con resultado' });
  db.prepare('DELETE FROM predictions WHERE match_id = ?').run(match.id);
  db.prepare('DELETE FROM matches WHERE id = ?').run(match.id);
  res.json({ ok: true });
});

// Update prizes
app.put('/api/admin/prizes', auth, adminOnly, (req, res) => {
  const { prizes } = req.body;
  if (!Array.isArray(prizes)) return res.status(400).json({ error: 'Formato inválido' });
  const db  = getDb();
  const ups = db.prepare(`
    INSERT INTO prizes (position, description) VALUES (?, ?)
    ON CONFLICT(position) DO UPDATE SET description = excluded.description
  `);
  for (const p of prizes) {
    if (p.position && p.description)
      ups.run(parseInt(p.position, 10), sanitize(p.description));
  }
  res.json({ ok: true });
});

// List all users (admin)
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at,
           COALESCE(SUM(pr.points), 0) AS total_points
    FROM users u
    LEFT JOIN predictions pr ON u.id = pr.user_id
    GROUP BY u.id
    ORDER BY total_points DESC
  `).all();
  res.json({ users: rows });
});

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  getDb(); // ensure DB is initialized
  console.log(`⚽  Quiniela Mundial 2026  →  http://localhost:${PORT}`);
  console.log(`    El primer usuario registrado será administrador.`);
});
