'use strict';
const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const { getDb }    = require('./database');
const { scheduleDailyBackup, runBackup } = require('./backup');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'quiniela-mundial-2026-secret-CHANGE-IN-PROD';
const COOKIE = 'qm_token';

// ── Security middleware ──────────────────────────────────────────────────────
app.set('trust proxy', 1); // Railway / Render sit behind a reverse proxy
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

// datetime-local inputs produce strings without timezone (e.g. "2026-06-28T13:00").
// Node.js on Railway (UTC) would treat them as UTC; we want Mexico CDT (UTC-5).
function normalizeMatchDate(dateStr) {
  const d = sanitize(dateStr);
  if (d && !d.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(d))
    return d + ':00-06:00';
  return d;
}

function parseMxDate(str) {
  if (!str) return NaN;
  if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str))
    return new Date(str + ':00-06:00').getTime();
  return new Date(str).getTime();
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = sanitize(username);
  if (user.length < 3 || user.length > 30)
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 30 caracteres' });
  if (!/^[\w\sáéíóúñÁÉÍÓÚÑüÜ]+$/u.test(user))
    return res.status(400).json({ error: 'Usuario solo puede contener letras, números y guiones bajos' });
  if (String(password).length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  const emailVal = sanitize(email || '');
  if (!emailVal) return res.status(400).json({ error: 'El correo electrónico es requerido' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal))
    return res.status(400).json({ error: 'Formato de correo inválido' });

  const db = getDb();
  try {
    const hash  = bcrypt.hashSync(String(password), 12);
    const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    const role  = count === 0 ? 'admin' : 'user';
    const result = db.prepare('INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)').run(user, hash, emailVal, role);
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
  const db   = getDb();
  const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// Update own email
app.put('/api/auth/profile', auth, (req, res) => {
  const { email } = req.body;
  const emailVal  = sanitize(email || '');
  if (!emailVal)
    return res.status(400).json({ error: 'El correo es requerido' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal))
    return res.status(400).json({ error: 'Formato de correo inválido' });
  const db = getDb();
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(emailVal, req.user.id);
  const updated = db.prepare('SELECT id,username,email,role FROM users WHERE id=?').get(req.user.id);
  res.json({ ok: true, user: updated });
});

// Change own password (requires current password)
app.put('/api/auth/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Faltan campos' });
  if (String(newPassword).length < 6)
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(currentPassword), user.password_hash))
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(newPassword), 12), req.user.id);
  res.json({ ok: true });
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

  const matchMs = parseMxDate(match.match_date);
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
    normalizeMatchDate(matchDate)
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
    normalizeMatchDate(matchDate), match.id
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

// Clear a match result (resets to unfinished, nulls out scores and points)
app.delete('/api/admin/matches/:id/result', auth, adminOnly, (req, res) => {
  const db    = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!match)             return res.status(404).json({ error: 'Partido no encontrado' });
  if (!match.is_finished) return res.status(400).json({ error: 'El partido no tiene resultado registrado' });
  db.prepare('UPDATE matches SET home_score = NULL, away_score = NULL, is_finished = 0 WHERE id = ?').run(match.id);
  db.prepare('UPDATE predictions SET points = NULL WHERE match_id = ?').run(match.id);
  res.json({ ok: true });
});

// Seed real World Cup 2026 group stage matches
app.post('/api/admin/seed-matches', auth, adminOnly, (req, res) => {
  const db = getDb();

  const MATCHES = [
    // ── GRUPO A: México, Sudáfrica, Corea del Sur, Chequia ──────────────
    ['A','México','🇲🇽','Sudáfrica','🇿🇦','2026-06-11T19:00:00.000Z'],
    ['A','Corea del Sur','🇰🇷','Chequia','🇨🇿','2026-06-12T02:00:00.000Z'],
    ['A','Chequia','🇨🇿','Sudáfrica','🇿🇦','2026-06-18T16:00:00.000Z'],
    ['A','México','🇲🇽','Corea del Sur','🇰🇷','2026-06-19T01:00:00.000Z'],
    ['A','Chequia','🇨🇿','México','🇲🇽','2026-06-25T01:00:00.000Z'],
    ['A','Sudáfrica','🇿🇦','Corea del Sur','🇰🇷','2026-06-25T01:00:00.000Z'],
    // ── GRUPO B: Canadá, Bosnia y Herz., Qatar, Suiza ───────────────────
    ['B','Canadá','🇨🇦','Bosnia y Herz.','🇧🇦','2026-06-12T19:00:00.000Z'],
    ['B','Qatar','🇶🇦','Suiza','🇨🇭','2026-06-13T19:00:00.000Z'],
    ['B','Suiza','🇨🇭','Bosnia y Herz.','🇧🇦','2026-06-18T19:00:00.000Z'],
    ['B','Canadá','🇨🇦','Qatar','🇶🇦','2026-06-18T22:00:00.000Z'],
    ['B','Suiza','🇨🇭','Canadá','🇨🇦','2026-06-24T19:00:00.000Z'],
    ['B','Bosnia y Herz.','🇧🇦','Qatar','🇶🇦','2026-06-24T19:00:00.000Z'],
    // ── GRUPO C: Brasil, Marruecos, Haití, Escocia ──────────────────────
    ['C','Brasil','🇧🇷','Marruecos','🇲🇦','2026-06-13T22:00:00.000Z'],
    ['C','Haití','🇭🇹','Escocia','🏴󠁧󠁢󠁳󠁣󠁴󠁿','2026-06-14T01:00:00.000Z'],
    ['C','Escocia','🏴󠁧󠁢󠁳󠁣󠁴󠁿','Marruecos','🇲🇦','2026-06-19T22:00:00.000Z'],
    ['C','Brasil','🇧🇷','Haití','🇭🇹','2026-06-20T00:30:00.000Z'],
    ['C','Escocia','🏴󠁧󠁢󠁳󠁣󠁴󠁿','Brasil','🇧🇷','2026-06-24T22:00:00.000Z'],
    ['C','Marruecos','🇲🇦','Haití','🇭🇹','2026-06-24T22:00:00.000Z'],
    // ── GRUPO D: EE.UU., Paraguay, Australia, Türkiye ───────────────────
    ['D','EE.UU.','🇺🇸','Paraguay','🇵🇾','2026-06-13T01:00:00.000Z'],
    ['D','Australia','🇦🇺','Türkiye','🇹🇷','2026-06-14T04:00:00.000Z'],
    ['D','EE.UU.','🇺🇸','Australia','🇦🇺','2026-06-19T19:00:00.000Z'],
    ['D','Türkiye','🇹🇷','Paraguay','🇵🇾','2026-06-20T03:00:00.000Z'],
    ['D','Türkiye','🇹🇷','EE.UU.','🇺🇸','2026-06-26T02:00:00.000Z'],
    ['D','Paraguay','🇵🇾','Australia','🇦🇺','2026-06-26T02:00:00.000Z'],
    // ── GRUPO E: Alemania, Curazao, Costa de Marfil, Ecuador ────────────
    ['E','Alemania','🇩🇪','Curazao','🇨🇼','2026-06-14T17:00:00.000Z'],
    ['E','Costa de Marfil','🇨🇮','Ecuador','🇪🇨','2026-06-14T23:00:00.000Z'],
    ['E','Alemania','🇩🇪','Costa de Marfil','🇨🇮','2026-06-20T20:00:00.000Z'],
    ['E','Ecuador','🇪🇨','Curazao','🇨🇼','2026-06-21T00:00:00.000Z'],
    ['E','Curazao','🇨🇼','Costa de Marfil','🇨🇮','2026-06-25T20:00:00.000Z'],
    ['E','Ecuador','🇪🇨','Alemania','🇩🇪','2026-06-25T20:00:00.000Z'],
    // ── GRUPO F: Países Bajos, Japón, Suecia, Túnez ─────────────────────
    ['F','Países Bajos','🇳🇱','Japón','🇯🇵','2026-06-14T20:00:00.000Z'],
    ['F','Suecia','🇸🇪','Túnez','🇹🇳','2026-06-15T02:00:00.000Z'],
    ['F','Países Bajos','🇳🇱','Suecia','🇸🇪','2026-06-20T17:00:00.000Z'],
    ['F','Túnez','🇹🇳','Japón','🇯🇵','2026-06-21T04:00:00.000Z'],
    ['F','Japón','🇯🇵','Suecia','🇸🇪','2026-06-25T23:00:00.000Z'],
    ['F','Túnez','🇹🇳','Países Bajos','🇳🇱','2026-06-25T23:00:00.000Z'],
    // ── GRUPO G: Bélgica, Egipto, Irán, Nueva Zelanda ───────────────────
    ['G','Bélgica','🇧🇪','Egipto','🇪🇬','2026-06-15T19:00:00.000Z'],
    ['G','Irán','🇮🇷','Nueva Zelanda','🇳🇿','2026-06-16T01:00:00.000Z'],
    ['G','Bélgica','🇧🇪','Irán','🇮🇷','2026-06-21T19:00:00.000Z'],
    ['G','Nueva Zelanda','🇳🇿','Egipto','🇪🇬','2026-06-22T01:00:00.000Z'],
    ['G','Egipto','🇪🇬','Irán','🇮🇷','2026-06-27T03:00:00.000Z'],
    ['G','Nueva Zelanda','🇳🇿','Bélgica','🇧🇪','2026-06-27T03:00:00.000Z'],
    // ── GRUPO H: España, Cabo Verde, Arabia Saudita, Uruguay ────────────
    ['H','España','🇪🇸','Cabo Verde','🇨🇻','2026-06-15T16:00:00.000Z'],
    ['H','Arabia Saudita','🇸🇦','Uruguay','🇺🇾','2026-06-15T22:00:00.000Z'],
    ['H','España','🇪🇸','Arabia Saudita','🇸🇦','2026-06-21T16:00:00.000Z'],
    ['H','Uruguay','🇺🇾','Cabo Verde','🇨🇻','2026-06-21T22:00:00.000Z'],
    ['H','Cabo Verde','🇨🇻','Arabia Saudita','🇸🇦','2026-06-27T00:00:00.000Z'],
    ['H','Uruguay','🇺🇾','España','🇪🇸','2026-06-27T00:00:00.000Z'],
    // ── GRUPO I: Francia, Senegal, Irak, Noruega ────────────────────────
    ['I','Francia','🇫🇷','Senegal','🇸🇳','2026-06-16T19:00:00.000Z'],
    ['I','Irak','🇮🇶','Noruega','🇳🇴','2026-06-16T22:00:00.000Z'],
    ['I','Francia','🇫🇷','Irak','🇮🇶','2026-06-22T21:00:00.000Z'],
    ['I','Noruega','🇳🇴','Senegal','🇸🇳','2026-06-23T00:00:00.000Z'],
    ['I','Noruega','🇳🇴','Francia','🇫🇷','2026-06-26T19:00:00.000Z'],
    ['I','Senegal','🇸🇳','Irak','🇮🇶','2026-06-26T19:00:00.000Z'],
    // ── GRUPO J: Argentina, Argelia, Austria, Jordania ──────────────────
    ['J','Argentina','🇦🇷','Argelia','🇩🇿','2026-06-17T01:00:00.000Z'],
    ['J','Austria','🇦🇹','Jordania','🇯🇴','2026-06-17T04:00:00.000Z'],
    ['J','Argentina','🇦🇷','Austria','🇦🇹','2026-06-22T17:00:00.000Z'],
    ['J','Jordania','🇯🇴','Argelia','🇩🇿','2026-06-23T03:00:00.000Z'],
    ['J','Argelia','🇩🇿','Austria','🇦🇹','2026-06-28T02:00:00.000Z'],
    ['J','Jordania','🇯🇴','Argentina','🇦🇷','2026-06-28T02:00:00.000Z'],
    // ── GRUPO K: Portugal, RD Congo, Uzbekistán, Colombia ───────────────
    ['K','Portugal','🇵🇹','RD Congo','🇨🇩','2026-06-17T17:00:00.000Z'],
    ['K','Uzbekistán','🇺🇿','Colombia','🇨🇴','2026-06-18T02:00:00.000Z'],
    ['K','Portugal','🇵🇹','Uzbekistán','🇺🇿','2026-06-23T17:00:00.000Z'],
    ['K','Colombia','🇨🇴','RD Congo','🇨🇩','2026-06-24T02:00:00.000Z'],
    ['K','Colombia','🇨🇴','Portugal','🇵🇹','2026-06-27T23:30:00.000Z'],
    ['K','RD Congo','🇨🇩','Uzbekistán','🇺🇿','2026-06-27T23:30:00.000Z'],
    // ── GRUPO L: Inglaterra, Croacia, Ghana, Panamá ─────────────────────
    ['L','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿','Croacia','🇭🇷','2026-06-17T20:00:00.000Z'],
    ['L','Ghana','🇬🇭','Panamá','🇵🇦','2026-06-17T23:00:00.000Z'],
    ['L','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿','Ghana','🇬🇭','2026-06-23T20:00:00.000Z'],
    ['L','Panamá','🇵🇦','Croacia','🇭🇷','2026-06-23T23:00:00.000Z'],
    ['L','Panamá','🇵🇦','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿','2026-06-27T21:00:00.000Z'],
    ['L','Croacia','🇭🇷','Ghana','🇬🇭','2026-06-27T21:00:00.000Z'],
  ];

  try {
    // Delete all predictions and matches, keep phases
    db.prepare('DELETE FROM predictions').run();
    db.prepare('DELETE FROM matches').run();

    // Get or create Fase de Grupos phase
    let phase = db.prepare("SELECT * FROM phases WHERE name = 'group'").get();
    if (!phase) {
      db.prepare("INSERT INTO phases (name, display_name, is_active, order_num) VALUES ('group','Fase de Grupos',1,1)").run();
      phase = db.prepare("SELECT * FROM phases WHERE name = 'group'").get();
    }
    const phaseId = phase.id;

    const ins = db.prepare(`
      INSERT INTO matches (phase_id, group_name, home_team, home_flag, away_team, away_flag, match_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAll = db.transaction(() => {
      for (const [g, ht, hf, at, af, date] of MATCHES) {
        ins.run(phaseId, g, ht, hf, at, af, date);
      }
    });
    insertAll();

    res.json({ ok: true, inserted: MATCHES.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
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
    SELECT u.id, u.username, u.email, u.role, u.created_at,
           COALESCE(SUM(pr.points), 0) AS total_points
    FROM users u
    LEFT JOIN predictions pr ON u.id = pr.user_id
    GROUP BY u.id
    ORDER BY total_points DESC
  `).all();
  res.json({ users: rows });
});

// Delete a user and all their predictions/points (admin)
app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const db     = getDb();
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user.id)
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('DELETE FROM predictions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true, username: user.username });
});

// Reset a user's password (admin)
app.put('/api/admin/users/:id/reset-password', auth, adminOnly, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const db   = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

// One-time admin setup (only works when SETUP_TOKEN env var is set)
app.post('/api/setup', async (req, res) => {
  const token = process.env.SETUP_TOKEN;
  if (!token) return res.status(404).json({ error: 'Not found' });
  if (req.body.token !== token) return res.status(401).json({ error: 'Token inválido' });

  const { username, password, email } = req.body;
  if (!username || !password || !email)
    return res.status(400).json({ error: 'Faltan campos: username, password, email' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  const db   = getDb();
  const hash = await bcrypt.hash(String(password), 12);
  db.prepare('DELETE FROM predictions').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('INSERT INTO users (username, password_hash, email, role) VALUES (?,?,?,?)')
    .run(String(username), hash, String(email), 'admin');
  console.log(`[SETUP] Admin creado: ${username}`);
  res.json({ ok: true, message: `Admin "${username}" creado. Elimina SETUP_TOKEN de Railway ahora.` });
});

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manual backup endpoint (admin only — useful for testing)
app.post('/api/admin/backup', auth, adminOnly, async (req, res) => {
  try {
    await runBackup();
    res.json({ ok: true, message: 'Backup iniciado (revisa los logs del servidor)' });
  } catch (e) {
    console.error('[backup] Error en backup manual:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  getDb(); // ensure DB is initialized
  console.log(`⚽  Quiniela Mundial 2026  →  http://localhost:${PORT}`);
  console.log(`    El primer usuario registrado será administrador.`);
  // Schedule automatic daily DB backup to GitHub at 03:00 UTC
  scheduleDailyBackup(3, 0);
});
