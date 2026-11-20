import db from '../index.js';
import { lexicalTerms } from '../../utils/lexical-terms.js';

const MAX_QUERY_TERMS = 128;

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_recall_documents (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      round_index INTEGER NOT NULL,
      source_digest TEXT NOT NULL,
      body TEXT NOT NULL,
      doc_length INTEGER NOT NULL,
      PRIMARY KEY (session_id, round_index)
    );
    CREATE TABLE IF NOT EXISTS local_recall_terms (
      session_id TEXT NOT NULL,
      round_index INTEGER NOT NULL,
      term TEXT NOT NULL,
      frequency INTEGER NOT NULL,
      PRIMARY KEY (session_id, round_index, term),
      FOREIGN KEY (session_id, round_index) REFERENCES local_recall_documents(session_id, round_index) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_local_recall_terms_lookup
      ON local_recall_terms(session_id, term, round_index);
  `);
}

function syncSession(sessionId, units) {
  ensureSchema();
  const remove = db.prepare('DELETE FROM local_recall_documents WHERE session_id = ? AND round_index = ?');
  const insertDoc = db.prepare(`INSERT INTO local_recall_documents
    (session_id, round_index, source_digest, body, doc_length) VALUES (?, ?, ?, ?, ?)`);
  const insertTerm = db.prepare(`INSERT INTO local_recall_terms
    (session_id, round_index, term, frequency) VALUES (?, ?, ?, ?)`);
  const existing = db.prepare('SELECT round_index FROM local_recall_documents WHERE session_id = ?').all(sessionId);
  const versions = db.prepare('SELECT round_index, source_digest FROM local_recall_documents WHERE session_id = ?').all(sessionId);
  const versionByRound = new Map(versions.map((row) => [row.round_index, row.source_digest]));
  const validRounds = new Set(units.map((unit) => unit.round));
  db.transaction(() => {
    for (const row of existing) if (!validRounds.has(row.round_index)) remove.run(sessionId, row.round_index);
    for (const unit of units) {
      const body = unit.prompt.map((message) => `${message.role}：${message.content}`).join('\n');
      if (versionByRound.get(unit.round) === unit.digest) continue;
      remove.run(sessionId, unit.round);
      const terms = lexicalTerms(body);
      const frequencies = new Map();
      for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      insertDoc.run(sessionId, unit.round, unit.digest, body, terms.length);
      for (const [term, frequency] of frequencies) insertTerm.run(sessionId, unit.round, term, frequency);
    }
  })();
}

/** Rebuilds changed/deleted source versions before ranking; the index is disposable derived data. */
export function queryLocalRecall(sessionId, units, query, { limit = 24 } = {}) {
  syncSession(sessionId, units);
  const terms = [...new Set(lexicalTerms(query))].slice(0, MAX_QUERY_TERMS);
  if (!terms.length || !units.length) return [];
  const placeholders = terms.map(() => '?').join(',');
  const results = db.prepare(`
    WITH stats AS (
      SELECT COUNT(*) AS total_docs, AVG(doc_length) AS avg_length
      FROM local_recall_documents WHERE session_id = ?
    ), hits AS (
      SELECT t.session_id, t.round_index, d.doc_length, t.term, t.frequency,
        COUNT(*) OVER (PARTITION BY t.term) AS document_frequency
      FROM local_recall_terms t
      JOIN local_recall_documents d USING (session_id, round_index)
      WHERE t.session_id = ? AND t.term IN (${placeholders})
    )
    SELECT h.round_index AS round, d.source_digest,
      SUM(LOG(1.0 + (s.total_docs - h.document_frequency + 0.5) / (h.document_frequency + 0.5)) *
        (h.frequency * 2.2) / (h.frequency + 1.2 * (1 - 0.75 + 0.75 * h.doc_length / MAX(s.avg_length, 1)))) AS score
    FROM hits h
    JOIN local_recall_documents d USING (session_id, round_index)
    CROSS JOIN stats s
    GROUP BY h.round_index
    ORDER BY score DESC, h.round_index DESC
    LIMIT ?
  `).all(sessionId, sessionId, ...terms, limit);
  return results.filter((row) => row.score > 0);
}
