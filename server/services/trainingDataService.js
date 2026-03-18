/**
 * Training data: single file per company — scraped_website.jsonl.
 * All training methods (scrape, conversational, structured, documents, manual) write here.
 * Data is appended only if not already present (deduplicated by content key).
 */
const fs = require('fs');
const path = require('path');
const { TRAIN_DATA_DIR } = require('./trainingLoader');

const SCRAPED_FILE = 'scraped_website.jsonl';
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

/** Normalize object for stable JSON key (sort keys recursively). */
function normalizedForKey(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizedForKey);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = normalizedForKey(obj[k]);
  return out;
}

/** Content key for dedup: same logical content => same key. */
function getContentKey(parsed) {
  if (!parsed || typeof parsed !== 'object') return JSON.stringify(parsed);
  return JSON.stringify(normalizedForKey(parsed));
}

function getScrapedFilePath(companyId) {
  return path.join(getCompanyDir(companyId), SCRAPED_FILE);
}

/** Read existing lines from scraped_website.jsonl. */
function readScrapedLines(companyId) {
  const filePath = getScrapedFilePath(companyId);
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, 'utf8');
  return data.split(/\r?\n/).filter((l) => l.trim());
}

/** Append new entries to scraped_website.jsonl only if not already present. */
function appendToScrapedOnlyIfNew(companyId, entries) {
  if (!entries || entries.length === 0) return { appended: 0, skipped: 0 };
  const filePath = getScrapedFilePath(companyId);
  const existingLines = readScrapedLines(companyId);
  const existingKeys = new Set();
  for (const line of existingLines) {
    try {
      existingKeys.add(getContentKey(JSON.parse(line)));
    } catch {
      existingKeys.add(line);
    }
  }
  const toAppend = [];
  for (const entry of entries) {
    const line = typeof entry === 'string' ? entry : JSON.stringify(entry);
    try {
      const key = getContentKey(JSON.parse(line));
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toAppend.push(line);
    } catch {
      if (!existingKeys.has(line)) {
        existingKeys.add(line);
        toAppend.push(line);
      }
    }
  }
  if (toAppend.length > 0) {
    fs.appendFileSync(filePath, toAppend.join('\n') + (toAppend.length ? '\n' : ''), 'utf8');
  }
  return { appended: toAppend.length, skipped: entries.length - toAppend.length };
}

/**
 * Merge new scrape content into scraped_website.jsonl. Appends only lines not already present.
 */
function mergeScrapedContent(companyId, newJsonlContent) {
  const newLines = String(newJsonlContent || '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (newLines.length === 0) return { appended: 0, skipped: 0 };
  const filePath = getScrapedFilePath(companyId);
  const existingLines = readScrapedLines(companyId);
  const existingKeys = new Set();
  for (const line of existingLines) {
    try {
      existingKeys.add(getContentKey(JSON.parse(line)));
    } catch {
      existingKeys.add(line);
    }
  }
  const toAppend = [];
  for (const line of newLines) {
    try {
      const key = getContentKey(JSON.parse(line));
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toAppend.push(line);
    } catch {
      if (!existingKeys.has(line)) {
        existingKeys.add(line);
        toAppend.push(line);
      }
    }
  }
  if (toAppend.length > 0) {
    fs.appendFileSync(filePath, toAppend.join('\n') + '\n', 'utf8');
  }
  return { appended: toAppend.length, skipped: newLines.length - toAppend.length };
}

/**
 * Append one conversational entry to scraped_website.jsonl (only if not already present).
 */
function appendConversational(companyId, entry) {
  const line = {
    type: 'conversational',
    instruction: entry.type || 'instruction',
    text: entry.text,
    userMessage: entry.userMessage,
    assistantMessage: entry.assistantMessage,
    ts: entry.ts || new Date().toISOString(),
  };
  const { appended } = appendToScrapedOnlyIfNew(companyId, [line]);
  return appended;
}

/**
 * Save uploaded document: append as one entry to scraped_website.jsonl (only if not already present).
 */
function saveUploadedDoc(companyId, originalName, text) {
  const name = path.basename(originalName || 'doc', path.extname(originalName || ''));
  const line = {
    type: 'doc',
    name: safeFileName(name),
    content: String(text || '').trim(),
  };
  const { appended } = appendToScrapedOnlyIfNew(companyId, [line]);
  return appended ? SCRAPED_FILE : null;
}

/**
 * Append structured records to scraped_website.jsonl (only if not already present).
 */
function appendStructured(companyId, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const entries = rows.map((row) => ({
    type: 'structured',
    data: typeof row === 'object' && row !== null ? row : { value: String(row) },
  }));
  const { appended } = appendToScrapedOnlyIfNew(companyId, entries);
  return appended;
}

/**
 * Get manual knowledge: concatenated content of all type='manual' entries in scraped_website.jsonl.
 */
function getManualKnowledge(companyId) {
  const lines = readScrapedLines(companyId);
  const parts = [];
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      if (o && o.type === 'manual' && o.content != null) {
        parts.push(String(o.content));
      }
    } catch {
      // skip
    }
  }
  return parts.join('\n\n');
}

/**
 * Set manual knowledge: replace all type='manual' entries with one new entry (append-only if content not present).
 */
function setManualKnowledge(companyId, content) {
  const filePath = getScrapedFilePath(companyId);
  const lines = readScrapedLines(companyId);
  const filtered = lines.filter((line) => {
    try {
      const o = JSON.parse(line);
      return !(o && o.type === 'manual');
    } catch {
      return true;
    }
  });
  const newLine = { type: 'manual', content: String(content ?? '').trim() };
  const allLines = [...filtered];
  if (newLine.content) {
    const existingKeys = new Set();
    for (const l of allLines) {
      try {
        existingKeys.add(getContentKey(JSON.parse(l)));
      } catch {
        existingKeys.add(l);
      }
    }
    const key = getContentKey(newLine);
    if (!existingKeys.has(key)) {
      allLines.push(JSON.stringify(newLine));
    }
  }
  fs.writeFileSync(filePath, allLines.join('\n') + (allLines.length ? '\n' : ''), 'utf8');
}

/**
 * List training files for UI. Only scraped_website.jsonl and scraped_website_links.txt (+ any legacy files).
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
  mergeScrapedContent,
  readScrapedLines,
  SCRAPED_FILE,
  MANUAL_FILE,
  UPLOADED_DOCS_DIR,
};
