/**
 * Training data file operations per company.
 * scraped_website.jsonl and scraped_website_links.txt are written only by website scrape.
 * Other modes append or create separate files so existing trained data is preserved.
 */
const fs = require('fs');
const path = require('path');
const { TRAIN_DATA_DIR } = require('./trainingLoader');

const CONVERSATIONAL_FILE = 'conversational_instructions.jsonl';
const STRUCTURED_FILE = 'structured_data.jsonl';
const MANUAL_FILE = 'manual_knowledge.txt';
const UPLOADED_DOCS_DIR = 'uploaded_docs';

function getCompanyDir(companyId) {
  const dir = path.join(TRAIN_DATA_DIR, companyId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFileName(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120) || 'unnamed';
}

/**
 * Append one entry to conversational training (owner instructions / Q&A).
 * Entry: { type: 'instruction'|'qa', text?: string, userMessage?: string, assistantMessage?: string, ts }
 */
function appendConversational(companyId, entry) {
  const dir = getCompanyDir(companyId);
  const filePath = path.join(dir, CONVERSATIONAL_FILE);
  const line = JSON.stringify({
    type: entry.type || 'instruction',
    text: entry.text,
    userMessage: entry.userMessage,
    assistantMessage: entry.assistantMessage,
    ts: entry.ts || new Date().toISOString(),
  }) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
}

/**
 * Save uploaded document text as a new file (append to training set).
 * Creates uploaded_docs/<safeName>.txt so multiple docs accumulate.
 */
function saveUploadedDoc(companyId, originalName, text) {
  const dir = getCompanyDir(companyId);
  const subDir = path.join(dir, UPLOADED_DOCS_DIR);
  fs.mkdirSync(subDir, { recursive: true });
  const base = path.basename(originalName || 'doc', path.extname(originalName || ''));
  const safe = safeFileName(base);
  const suffix = Date.now().toString(36);
  const fileName = `${safe}_${suffix}.txt`;
  const filePath = path.join(subDir, fileName);
  fs.writeFileSync(filePath, String(text || ''), 'utf8');
  return fileName;
}

/**
 * Append structured records to structured_data.jsonl (from CSV, Excel, or manual JSON).
 * Each row is one JSON object per line.
 */
function appendStructured(companyId, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const dir = getCompanyDir(companyId);
  const filePath = path.join(dir, STRUCTURED_FILE);
  const lines = rows.map((row) => {
    const obj = typeof row === 'object' && row !== null ? row : { value: String(row) };
    return JSON.stringify(obj) + '\n';
  });
  fs.appendFileSync(filePath, lines.join(''), 'utf8');
  return rows.length;
}

/**
 * Get manual knowledge content (FAQs, policies, etc.).
 */
function getManualKnowledge(companyId) {
  const dir = path.join(TRAIN_DATA_DIR, companyId);
  const filePath = path.join(dir, MANUAL_FILE);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Set manual knowledge (overwrites file).
 */
function setManualKnowledge(companyId, content) {
  const dir = getCompanyDir(companyId);
  const filePath = path.join(dir, MANUAL_FILE);
  fs.writeFileSync(filePath, String(content ?? ''), 'utf8');
}

/**
 * List training files for a company (for UI summary). Excludes raw binary.
 */
function listTrainingFiles(companyId) {
  const dir = path.join(TRAIN_DATA_DIR, companyId);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out = [];
  const scan = (d, prefix = '') => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) scan(path.join(d, e.name), rel);
      else if (['.txt', '.md', '.json', '.jsonl'].includes(path.extname(e.name).toLowerCase())) {
        const full = path.join(d, e.name);
        const stat = fs.statSync(full);
        out.push({ name: rel, size: stat.size });
      }
    }
  };
  scan(dir);
  return out;
}

module.exports = {
  getCompanyDir,
  appendConversational,
  saveUploadedDoc,
  appendStructured,
  getManualKnowledge,
  setManualKnowledge,
  listTrainingFiles,
  CONVERSATIONAL_FILE,
  STRUCTURED_FILE,
  MANUAL_FILE,
  UPLOADED_DOCS_DIR,
};
