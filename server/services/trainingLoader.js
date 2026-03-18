const fs = require('fs');
const path = require('path');

const TRAIN_DATA_DIR = path.join(__dirname, '../../train_data');
const MAX_CONTEXT_CHARS = parseInt(process.env.TRAINING_CONTEXT_MAX_CHARS || '60000', 10);
const MAX_JSONL_MATCHES = parseInt(process.env.TRAINING_JSONL_TOP_K || '5', 10);

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'build', 'built', 'by', 'can', 'could',
  'did', 'do', 'does', 'for', 'from', 'give', 'how', 'i', 'in', 'is', 'it', 'its',
  'make', 'made', 'me', 'my', 'of', 'on', 'or', 'our', 'please', 'related', 'show',
  'tell', 'that', 'the', 'their', 'them', 'these', 'this', 'to', 'us', 'was', 'we',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your',
]);

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function clip(text, maxChars) {
  const t = String(text || '');
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n...[truncated]` : t;
}

function tokenizeQuery(query) {
  const raw = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP_WORDS.has(w));

  return [...new Set(raw)];
}

function buildPhrases(tokens) {
  const phrases = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return phrases;
}

function scoreTextForQuery(text, tokens, phrases) {
  if (!tokens.length) return 0;

  const lower = String(text || '').toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (!lower.includes(token)) continue;
    if (token.length >= 7) score += 5;
    else if (token.length >= 5) score += 4;
    else score += 3;
  }

  for (const phrase of phrases) {
    if (lower.includes(phrase)) score += 6;
  }

  return score;
}

function firstHttpUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s)\]}"'<>]+/i);
  return m ? m[0] : '';
}

function buildRelevantExcerpt(text, tokens, phrases, maxChars = 6000) {
  const clean = normalizeWhitespace(text);
  if (!clean) return '';

  if (!tokens.length) {
    return clip(clean, maxChars);
  }

  const lower = clean.toLowerCase();
  let pos = -1;

  for (const phrase of phrases) {
    pos = lower.indexOf(phrase);
    if (pos >= 0) break;
  }

  if (pos < 0) {
    for (const token of tokens) {
      pos = lower.indexOf(token);
      if (pos >= 0) break;
    }
  }

  if (pos < 0) {
    return clip(clean, maxChars);
  }

  const start = Math.max(0, pos - 500);
  const end = Math.min(clean.length, start + maxChars);
  const excerpt = clean.slice(start, end);

  return start > 0 ? `...${excerpt}` : excerpt;
}

/**
 * Get list of available companies (folders in train_data)
 * Folders should be named with underscore prefix: _CompanyName
 */
function getCompanies() {
  if (!fs.existsSync(TRAIN_DATA_DIR)) {
    fs.mkdirSync(TRAIN_DATA_DIR, { recursive: true });
    return [];
  }

  const entries = fs.readdirSync(TRAIN_DATA_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith('_') && e.name !== '_default')
    .map((e) => ({
      id: e.name,
      name: e.name.replace(/^_/, '').replace(/_/g, ' '),
    }));
}

/**
 * Parse JSONL training examples and return context snippets.
 * For query-driven requests, only the top relevant entries are included.
 */
function buildJsonlContext(data, fileLabel, queryTokens) {
  const phrases = buildPhrases(queryTokens);
  const lines = String(data || '').split(/\r?\n/).filter((l) => l.trim());
  const entries = [];

  for (let i = 0; i < lines.length; i += 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      const msgList = Array.isArray(parsed.messages) ? parsed.messages : [];
      const userMsg = msgList.find((m) => m && m.role === 'user')?.content || '';
      const assistantMsg = msgList.find((m) => m && m.role === 'assistant')?.content || '';
      const sourceUrl =
        parsed?.source?.page_url ||
        parsed?.metadata?.source_url ||
        parsed?.url ||
        firstHttpUrl(assistantMsg);
      const sourceTitle =
        parsed?.source?.page_title ||
        parsed?.metadata?.source_title ||
        '';
      const combined = `${userMsg}\n${assistantMsg}\n${sourceUrl || ''}`.trim();

      if (!combined) continue;

      entries.push({
        idx: i + 1,
        score: scoreTextForQuery(combined, queryTokens, phrases),
        userMsg: normalizeWhitespace(userMsg),
        assistantExcerpt: buildRelevantExcerpt(assistantMsg || combined, queryTokens, phrases),
        sourceUrl: normalizeWhitespace(sourceUrl),
        sourceTitle: normalizeWhitespace(sourceTitle),
      });
    } catch {
      // Ignore malformed JSONL rows, keep processing valid rows.
    }
  }

  if (!entries.length) {
    return { priority: '', regular: '' };
  }

  const matched = queryTokens.length
    ? entries.filter((e) => e.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_JSONL_MATCHES)
    : [];

  const target = matched.length ? matched : entries.slice(0, 2);
  const text = target
    .map((e) => {
      const sourceLine = e.sourceUrl
        ? `Source page: ${e.sourceTitle ? `${e.sourceTitle} — ` : ''}${e.sourceUrl}`
        : null;
      const linesOut = [
        `--- ${fileLabel} :: entry ${e.idx} ---`,
        sourceLine,
        e.userMsg ? `User prompt: ${e.userMsg}` : null,
        `Knowledge excerpt: ${e.assistantExcerpt}`,
      ].filter(Boolean);
      return `${linesOut.join('\n')}\n`;
    })
    .join('\n');

  return matched.length
    ? { priority: text, regular: '' }
    : { priority: '', regular: text };
}

/**
 * Recursively read text content from a directory.
 * Supports: .txt, .md, .json, .jsonl
 */
function collectDirContent(dirPath, basePath, queryTokens, buckets) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectDirContent(fullPath, basePath, queryTokens, buckets);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.txt', '.md', '.json', '.jsonl'].includes(ext)) {
        try {
          const data = fs.readFileSync(fullPath, 'utf8');
          const label = path.relative(basePath, fullPath);

          if (ext === '.json') {
            try {
              const parsed = JSON.parse(data);
              buckets.regular.push(`\n--- ${label} ---\n${JSON.stringify(parsed, null, 2)}\n`);
            } catch {
              buckets.regular.push(`\n--- ${label} ---\n${data}\n`);
            }
          } else if (ext === '.jsonl') {
            if (/scraped_website\.jsonl$/i.test(entry.name)) {
              const lines = data.split(/\r?\n/).filter((l) => l.trim());
              const scrapedLines = [];
              const conversationalParts = [];
              const structuredParts = [];
              const docParts = [];
              const manualParts = [];

              for (const line of lines) {
                try {
                  const o = JSON.parse(line);
                  if (!o || typeof o !== 'object') continue;
                  if (o.type === 'conversational') {
                    if (o.text) conversationalParts.push(`Instruction: ${o.text}`);
                    else if (o.userMessage || o.assistantMessage) {
                      conversationalParts.push(`Q: ${o.userMessage || ''}\nA: ${o.assistantMessage || ''}`.trim());
                    }
                  } else if (o.type === 'structured' && o.data != null) {
                    structuredParts.push(typeof o.data === 'object' ? JSON.stringify(o.data) : String(o.data));
                  } else if (o.type === 'doc' && o.content != null) {
                    docParts.push(`Document (${o.name || 'doc'}): ${o.content}`);
                  } else if (o.type === 'manual' && o.content != null) {
                    manualParts.push(String(o.content));
                  } else if (o.messages && (o.source || o.system)) {
                    scrapedLines.push(line);
                  }
                } catch {
                  // skip malformed lines
                }
              }

              if (scrapedLines.length > 0) {
                const scrapedData = scrapedLines.join('\n');
                const { priority, regular } = buildJsonlContext(scrapedData, label, queryTokens);
                if (priority) buckets.priority.push(priority);
                if (regular) buckets.regular.push(regular);
              }
              if (conversationalParts.length > 0) {
                buckets.regular.push(`\n--- ${label} (Owner instructions / Q&A) ---\n${conversationalParts.join('\n\n')}\n`);
              }
              if (structuredParts.length > 0) {
                buckets.regular.push(`\n--- ${label} (Structured data) ---\n${structuredParts.join('\n')}\n`);
              }
              if (docParts.length > 0) {
                buckets.regular.push(`\n--- ${label} (Documents) ---\n${docParts.join('\n\n')}\n`);
              }
              if (manualParts.length > 0) {
                buckets.regular.push(`\n--- ${label} (Manual knowledge) ---\n${manualParts.join('\n\n')}\n`);
              }
            } else if (/conversational_instructions\.jsonl$/i.test(entry.name)) {
              const lines = data.split(/\r?\n/).filter((l) => l.trim());
              const parts = lines.map((line) => {
                try {
                  const o = JSON.parse(line);
                  if (o.text) return `Instruction: ${o.text}`;
                  if (o.userMessage || o.assistantMessage) {
                    return `Q: ${o.userMessage || ''}\nA: ${o.assistantMessage || ''}`.trim();
                  }
                  return line;
                } catch { return line; }
              });
              buckets.regular.push(`\n--- ${label} (Owner instructions / Q&A) ---\n${parts.join('\n\n')}\n`);
            } else if (/structured_data\.jsonl$/i.test(entry.name)) {
              const lines = data.split(/\r?\n/).filter((l) => l.trim());
              const parts = lines.map((line) => {
                try {
                  const o = JSON.parse(line);
                  return typeof o === 'object' ? (o.data != null ? JSON.stringify(o.data) : JSON.stringify(o)) : line;
                } catch { return line; }
              });
              buckets.regular.push(`\n--- ${label} (Structured data) ---\n${parts.join('\n')}\n`);
            } else {
              const { priority, regular } = buildJsonlContext(data, label, queryTokens);
              if (priority) buckets.priority.push(priority);
              if (regular) buckets.regular.push(regular);
            }
          } else if (/links\.txt$/i.test(entry.name) && /[|\t].*https?:\/\//m.test(data)) {
            // scraped_website_links.txt: Title | URL format — use for page redirects
            buckets.regular.push(
              `\n--- ${label} (Use these URLs when redirecting users to pages) ---\n${data}\n`
            );
          } else {
            buckets.regular.push(`\n--- ${label} ---\n${data}\n`);
          }
        } catch (err) {
          console.warn(`Could not read ${fullPath}:`, err.message);
        }
      }
    }
  }
}

/**
 * Load training context for a company
 * Returns concatenated text from all files in that company's folder
 */
function loadCompanyContext(companyId, userQuery = '') {
  const companyPath = path.join(TRAIN_DATA_DIR, companyId);
  if (!fs.existsSync(companyPath) || !fs.statSync(companyPath).isDirectory()) {
    return null;
  }

  const queryTokens = tokenizeQuery(userQuery);
  const buckets = { priority: [], regular: [] };

  collectDirContent(companyPath, companyPath, queryTokens, buckets);

  const context = `${buckets.priority.join('\n')}\n${buckets.regular.join('\n')}`.trim();
  return context ? clip(context, MAX_CONTEXT_CHARS).trim() : null;
}

module.exports = {
  getCompanies,
  loadCompanyContext,
  TRAIN_DATA_DIR,
};
