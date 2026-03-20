/**
 * Extract plain text from uploaded documents for training.
 * Supports: .txt, .md, .pdf, .doc, .docx, SQL/DDL and related text database dumps.
 */
const path = require('path');

let pdfParse = null;
let mammoth = null;

try {
  pdfParse = require('pdf-parse');
} catch (e) {
  // optional
}

try {
  mammoth = require('mammoth');
} catch (e) {
  // optional
}

/** Text-first extensions treated as UTF-8 schema / DDL / SQL knowledge */
const DB_TEXT_EXTENSIONS = new Set([
  '.sql',
  '.ddl',
  '.mysql',
  '.pgsql',
  '.cql',
  '.hql',
  '.tsql',
  '.prisma',
  '.graphql',
]);

function isSqliteBinary(buffer) {
  if (!buffer || buffer.length < 16) return false;
  return buffer.slice(0, 15).toString('ascii') === 'SQLite format 3';
}

/**
 * Whether this file should be stored as structured database knowledge (not generic "doc").
 */
function isDatabaseKnowledgeFile(originalName = '', mimeType = '') {
  const n = String(originalName || '').toLowerCase();
  const ext = path.extname(n);
  if (DB_TEXT_EXTENSIONS.has(ext)) return true;
  if (ext === '.sqlite' || ext === '.db') return true;
  const m = String(mimeType || '').toLowerCase();
  return m.includes('sql') || m === 'application/x-sql' || m === 'text/x-sql';
}

function extractFromBuffer(buffer, originalName = '', mimeType = '') {
  const ext = (originalName && originalName.includes('.'))
    ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase()
    : '';
  const mime = (mimeType || '').toLowerCase();

  if (isSqliteBinary(buffer) && (ext === '.sqlite' || ext === '.db' || ext === '')) {
    return Promise.reject(
      new Error(
        'Binary SQLite (.db) detected. Export schema as text (e.g. sqlite3 my.db ".schema" > schema.sql or use DB Browser Export → SQL), then upload the .sql file.'
      )
    );
  }

  if (DB_TEXT_EXTENSIONS.has(ext)) {
    return Promise.resolve(buffer.toString('utf8'));
  }

  if (ext === '.sqlite' || ext === '.db') {
    return Promise.resolve(buffer.toString('utf8'));
  }

  if (mime.includes('sql') || mime === 'text/x-sql') {
    return Promise.resolve(buffer.toString('utf8'));
  }

  if (ext === '.txt' || ext === '.md' || mime === 'text/plain' || mime === 'text/markdown') {
    return Promise.resolve(buffer.toString('utf8'));
  }

  if ((ext === '.pdf' || mime === 'application/pdf') && pdfParse) {
    return pdfParse(buffer).then((r) => r.text || '');
  }

  if ((ext === '.docx' || ext === '.doc' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') && mammoth) {
    return mammoth.extractRawText({ buffer }).then((r) => r.value || '');
  }

  return Promise.reject(new Error(`Unsupported format: ${ext || mime || 'unknown'}. Install pdf-parse and mammoth for PDF/DOCX.`));
}

module.exports = { extractFromBuffer, isDatabaseKnowledgeFile, isSqliteBinary };
