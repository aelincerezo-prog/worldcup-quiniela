'use strict';
const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.NODE_ENV === 'production'
      ? '/app/data/quiniela.db'
      : path.join(__dirname, 'quiniela.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedData();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      email         TEXT,
      role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS phases (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    UNIQUE NOT NULL,
      display_name TEXT    NOT NULL,
      is_active    INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phase_id    INTEGER NOT NULL REFERENCES phases(id),
      group_name  TEXT,
      home_team   TEXT    NOT NULL,
      away_team   TEXT    NOT NULL,
      home_flag   TEXT    NOT NULL DEFAULT '',
      away_flag   TEXT    NOT NULL DEFAULT '',
      match_date  TEXT    NOT NULL,
      home_score  INTEGER,
      away_score  INTEGER,
      is_finished INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      match_id   INTEGER NOT NULL REFERENCES matches(id),
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      points     INTEGER,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, match_id)
    );

    CREATE TABLE IF NOT EXISTS prizes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      position    INTEGER UNIQUE NOT NULL,
      description TEXT    NOT NULL
    );
  `);
  // Migration: add email column if it doesn't exist yet
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
}

function seedData() {
  if (db.prepare('SELECT COUNT(*) as n FROM phases').get().n > 0) return;

  // Phases
  const insPhase = db.prepare(
    'INSERT INTO phases (name, display_name, is_active, sort_order) VALUES (?, ?, ?, ?)'
  );
  const phaseIds = {};
  for (const [name, label, active, order] of [
    ['group',          'Fase de Grupos',        1, 1],
    ['round_of_16',    'Dieciseisavos',          0, 2],
    ['quarter_finals', 'Cuartos de Final',       0, 3],
    ['semi_finals',    'Semifinales',            0, 4],
    ['third_place',    'Tercer Puesto',          0, 5],
    ['final',          'Final',                  0, 6],
  ]) {
    phaseIds[name] = insPhase.run(name, label, active, order).lastInsertRowid;
  }

  // Group stage matches  [homeTeam, homeFlag, awayTeam, awayFlag, date]
  const insMatch = db.prepare(`
    INSERT INTO matches (phase_id, group_name, home_team, away_team, home_flag, away_flag, match_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const gid = phaseIds['group'];

  const groups = {
    A: [
      ['México',         '🇲🇽', 'Polonia',        '🇵🇱', '2026-06-11T18:00'],
      ['Arabia Saudita', '🇸🇦', 'Islandia',       '🇮🇸', '2026-06-11T21:00'],
      ['México',         '🇲🇽', 'Islandia',       '🇮🇸', '2026-06-15T18:00'],
      ['Polonia',        '🇵🇱', 'Arabia Saudita', '🇸🇦', '2026-06-15T21:00'],
      ['Islandia',       '🇮🇸', 'Polonia',        '🇵🇱', '2026-06-19T18:00'],
      ['Arabia Saudita', '🇸🇦', 'México',         '🇲🇽', '2026-06-19T18:00'],
    ],
    B: [
      ['Argentina', '🇦🇷', 'Australia', '🇦🇺', '2026-06-12T13:00'],
      ['Francia',   '🇫🇷', 'Túnez',    '🇹🇳', '2026-06-12T16:00'],
      ['Argentina', '🇦🇷', 'Francia',   '🇫🇷', '2026-06-16T13:00'],
      ['Australia', '🇦🇺', 'Túnez',    '🇹🇳', '2026-06-16T16:00'],
      ['Francia',   '🇫🇷', 'Australia', '🇦🇺', '2026-06-20T13:00'],
      ['Túnez',    '🇹🇳', 'Argentina', '🇦🇷', '2026-06-20T13:00'],
    ],
    C: [
      ['España',     '🇪🇸', 'Japón',      '🇯🇵', '2026-06-12T19:00'],
      ['Alemania',   '🇩🇪', 'Costa Rica', '🇨🇷', '2026-06-12T22:00'],
      ['España',     '🇪🇸', 'Alemania',   '🇩🇪', '2026-06-16T19:00'],
      ['Japón',      '🇯🇵', 'Costa Rica', '🇨🇷', '2026-06-16T22:00'],
      ['Alemania',   '🇩🇪', 'Japón',      '🇯🇵', '2026-06-20T19:00'],
      ['Costa Rica', '🇨🇷', 'España',     '🇪🇸', '2026-06-20T19:00'],
    ],
    D: [
      ['Brasil',  '🇧🇷', 'Serbia',  '🇷🇸', '2026-06-13T13:00'],
      ['Suiza',   '🇨🇭', 'Camerún', '🇨🇲', '2026-06-13T16:00'],
      ['Brasil',  '🇧🇷', 'Suiza',   '🇨🇭', '2026-06-17T13:00'],
      ['Camerún', '🇨🇲', 'Serbia',  '🇷🇸', '2026-06-17T16:00'],
      ['Suiza',   '🇨🇭', 'Serbia',  '🇷🇸', '2026-06-21T13:00'],
      ['Camerún', '🇨🇲', 'Brasil',  '🇧🇷', '2026-06-21T13:00'],
    ],
    E: [
      ['Inglaterra',     '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Irán',          '🇮🇷', '2026-06-13T19:00'],
      ['Estados Unidos', '🇺🇸', 'Gales',         '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '2026-06-13T22:00'],
      ['Inglaterra',     '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Estados Unidos','🇺🇸', '2026-06-17T19:00'],
      ['Irán',           '🇮🇷', 'Gales',         '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '2026-06-17T22:00'],
      ['Irán',           '🇮🇷', 'Estados Unidos','🇺🇸', '2026-06-21T19:00'],
      ['Gales',          '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Inglaterra',    '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '2026-06-21T19:00'],
    ],
    F: [
      ['Bélgica', '🇧🇪', 'Canadá',  '🇨🇦', '2026-06-14T13:00'],
      ['Croacia', '🇭🇷', 'Senegal', '🇸🇳', '2026-06-14T16:00'],
      ['Bélgica', '🇧🇪', 'Croacia', '🇭🇷', '2026-06-18T13:00'],
      ['Canadá',  '🇨🇦', 'Senegal', '🇸🇳', '2026-06-18T16:00'],
      ['Croacia', '🇭🇷', 'Canadá',  '🇨🇦', '2026-06-22T13:00'],
      ['Senegal', '🇸🇳', 'Bélgica', '🇧🇪', '2026-06-22T13:00'],
    ],
    G: [
      ['Países Bajos', '🇳🇱', 'Ecuador',     '🇪🇨', '2026-06-14T19:00'],
      ['Portugal',     '🇵🇹', 'Ghana',        '🇬🇭', '2026-06-14T22:00'],
      ['Países Bajos', '🇳🇱', 'Portugal',     '🇵🇹', '2026-06-18T19:00'],
      ['Ecuador',      '🇪🇨', 'Ghana',        '🇬🇭', '2026-06-18T22:00'],
      ['Portugal',     '🇵🇹', 'Ecuador',      '🇪🇨', '2026-06-22T19:00'],
      ['Ghana',        '🇬🇭', 'Países Bajos', '🇳🇱', '2026-06-22T19:00'],
    ],
    H: [
      ['Uruguay',       '🇺🇾', 'Corea del Sur', '🇰🇷', '2026-06-15T13:00'],
      ['Colombia',      '🇨🇴', 'Qatar',         '🇶🇦', '2026-06-15T16:00'],
      ['Uruguay',       '🇺🇾', 'Colombia',      '🇨🇴', '2026-06-19T13:00'],
      ['Corea del Sur', '🇰🇷', 'Qatar',         '🇶🇦', '2026-06-19T16:00'],
      ['Colombia',      '🇨🇴', 'Corea del Sur', '🇰🇷', '2026-06-23T13:00'],
      ['Qatar',         '🇶🇦', 'Uruguay',       '🇺🇾', '2026-06-23T13:00'],
    ],
  };

  for (const [group, matches] of Object.entries(groups)) {
    for (const [ht, hf, at, af, date] of matches) {
      insMatch.run(gid, group, ht, at, hf, af, date);
    }
  }

  // Default prizes
  const insPrize = db.prepare('INSERT INTO prizes (position, description) VALUES (?, ?)');
  insPrize.run(1, '🥇 Primer Lugar — Premio por definir');
  insPrize.run(2, '🥈 Segundo Lugar — Premio por definir');
  insPrize.run(3, '🥉 Tercer Lugar — Premio por definir');
  insPrize.run(4, '🥉 Tercer Lugar — Premio por definir');
}

module.exports = { getDb };
