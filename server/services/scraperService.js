const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { URL } = require('url');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_PAGES_RAW = parseInt(process.env.SCRAPER_MAX_PAGES || '', 10);
const MAX_PAGES = Number.isFinite(MAX_PAGES_RAW) && MAX_PAGES_RAW > 0 ? MAX_PAGES_RAW : Infinity;
const MAX_EXTERNAL_PAGES = parseInt(process.env.SCRAPER_MAX_EXTERNAL_PAGES || '40', 10);
const REQUEST_TIMEOUT = 20000;
const REQUEST_DELAY = 350; // ms between requests — polite crawling
const READER_FALLBACK_PREFIX = process.env.SCRAPER_READER_FALLBACK_PREFIX || 'https://r.jina.ai/http://';
const BOT_BLOCK_STATUSES = new Set([403, 406, 409, 412, 418, 429, 451, 498, 499, 503]);

// Realistic browser User-Agent — avoids bot-detection blocks on most sites
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8,*;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

// ─── Charset / encoding helpers ──────────────────────────────────────────────

/**
 * Normalise charset labels that TextDecoder may not recognise directly.
 * The WHATWG Encoding spec covers most aliases; this handles the remainder.
 */
const CHARSET_ALIASES = {
  // Japanese
  'x-sjis': 'shift_jis',
  'csshiftjis': 'shift_jis',
  'ms932': 'shift_jis',
  'x-euc-jp': 'euc-jp',
  'cseucpkdfmtjapanese': 'euc-jp',
  // Chinese
  'csgb2312': 'gbk',
  'gb_2312': 'gbk',
  'chinese': 'gbk',
  'hz-gb-2312': 'gbk',
  // Korean
  'ks_c_5601-1987': 'euc-kr',
  'ks_c_5601-1989': 'euc-kr',
  'ksc5601': 'euc-kr',
  'ksc_5601': 'euc-kr',
  'windows-949': 'euc-kr',
  // Latin / Western
  'latin1': 'iso-8859-1',
  'latin-1': 'iso-8859-1',
  'iso8859-1': 'iso-8859-1',
  'unicode-1-1-utf-8': 'utf-8',
};

function normaliseCharset(raw) {
  if (!raw) return 'utf-8';
  const s = raw.toLowerCase().trim().replace(/\s/g, '');
  return CHARSET_ALIASES[s] || s;
}

/**
 * Detect page charset priority:
 *   1. Content-Type header charset param
 *   2. <meta charset="…">
 *   3. <meta http-equiv="Content-Type" content="…charset=…">
 *   4. <?xml …encoding="…"?>
 * Falls back to 'utf-8'.
 */
function detectCharset(contentTypeHeader, buf) {
  // 1. Content-Type header
  const ctMatch = (contentTypeHeader || '').match(/charset=([^\s;,]+)/i);
  if (ctMatch) return normaliseCharset(ctMatch[1]);

  // 2. Peek at first 4 KB decoded as Latin-1 (safe for all ASCII-compatible encodings)
  let preview = '';
  try {
    const slice = Buffer.isBuffer(buf) ? buf.slice(0, 4096) : Buffer.from(buf).slice(0, 4096);
    preview = new TextDecoder('latin1').decode(slice);
  } catch {
    return 'utf-8';
  }

  // 3. <meta charset="...">
  const m1 = preview.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i);
  if (m1) return normaliseCharset(m1[1]);

  // 4. <meta http-equiv="Content-Type" content="...charset=...">
  const m2 = preview.match(/content=["'][^"']*charset=([^"'\s;>]+)/i);
  if (m2) return normaliseCharset(m2[1]);

  // 5. XML encoding declaration
  const m3 = preview.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  if (m3) return normaliseCharset(m3[1]);

  return 'utf-8';
}

/**
 * Decode a Buffer/ArrayBuffer to a string using the detected charset.
 * Falls back gracefully to UTF-8 if the charset label is not supported.
 */
function decodeBuffer(buf, charset) {
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  }
}

// High-value paths to seed for deep coverage (contact, about, portfolio, etc.)
const PRIORITY_PATHS = [
  '/contact-us', '/contact', '/contacts', '/get-in-touch', '/reach-us',
  '/about-us', '/about', '/company', '/our-story',
  '/portfolio', '/projects', '/case-studies', '/work',
  '/career', '/careers', '/jobs', '/hiring', '/join-us',
  '/services', '/what-we-do', '/solutions',
  '/blog', '/blogs', '/insights', '/news', '/articles',
  '/pricing', '/plans', '/packages',
  '/team', '/our-team', '/leadership',
  '/faq', '/faqs', '/help', '/support',
];

// ─── In-memory job store ──────────────────────────────────────────────────────
const jobs = new Map();

function resolveDefaultJobStoreDir() {
  const configured = String(process.env.SCRAPER_JOB_STORE_DIR || '').trim();
  if (configured) return configured;

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'AIChatBot', 'scrape-jobs');
  }

  if (process.env.XDG_STATE_HOME) {
    return path.join(process.env.XDG_STATE_HOME, 'aichatbot', 'scrape-jobs');
  }

  if (process.env.HOME) {
    return path.join(process.env.HOME, '.local', 'state', 'aichatbot', 'scrape-jobs');
  }

  return path.join(os.tmpdir(), 'aichatbot', 'scrape-jobs');
}

const LEGACY_JOB_STORE_DIR = path.join(__dirname, '../../train_data/_scrape_jobs');
const JOB_STORE_DIR = resolveDefaultJobStoreDir();
const JOB_STORE_LOAD_DIRS = [...new Set([JOB_STORE_DIR, LEGACY_JOB_STORE_DIR])];

fs.mkdirSync(JOB_STORE_DIR, { recursive: true });

function jobFilePath(jobId) {
  return path.join(JOB_STORE_DIR, `${jobId}.json`);
}

function serializeJob(job) {
  return {
    id: job.id,
    url: job.url,
    companyId: job.companyId,
    status: job.status,
    pages: Array.isArray(job.pages) ? job.pages : [],
    errors: Array.isArray(job.errors) ? job.errors : [],
    log: Array.isArray(job.log) ? job.log : [],
    progress: job.progress || null,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    jsonlContent: job.jsonlContent || null,
    error: job.error || null,
    crawlState: job.crawlState || null,
  };
}

function persistJob(job) {
  try {
    fs.writeFileSync(jobFilePath(job.id), JSON.stringify(serializeJob(job)), 'utf8');
  } catch (err) {
    console.error('[scraper] persist job failed:', err.message);
  }
}

function loadPersistedJobs() {
  for (const directory of JOB_STORE_LOAD_DIRS) {
    let files = [];
    try {
      files = fs.readdirSync(directory);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(directory, file), 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed?.id || !parsed?.url || !parsed?.companyId || jobs.has(parsed.id)) continue;
        jobs.set(parsed.id, {
          id: parsed.id,
          url: parsed.url,
          companyId: parsed.companyId,
          status: parsed.status || 'pending',
          pages: Array.isArray(parsed.pages) ? parsed.pages : [],
          errors: Array.isArray(parsed.errors) ? parsed.errors : [],
          log: Array.isArray(parsed.log) ? parsed.log : [],
          progress: parsed.progress || null,
          startedAt: parsed.startedAt || null,
          completedAt: parsed.completedAt || null,
          jsonlContent: parsed.jsonlContent || null,
          error: parsed.error || null,
          crawlState: parsed.crawlState || null,
          runnerActive: false,
        });
      } catch {
        /* ignore malformed snapshots */
      }
    }
  }
}

// ─── URL utilities ────────────────────────────────────────────────────────────

function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/i.test(u.protocol)) return null;
    u.hash = '';
    // Normalise trailing slash (keep root / as-is)
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return null;
  }
}

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

function sameDomain(a, base) {
  try {
    const left = normalizeHostname(new URL(a).hostname);
    const right = normalizeHostname(new URL(base).hostname);
    return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
  } catch {
    return false;
  }
}

function isProbablyAssetUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return /\.(?:jpg|jpeg|png|gif|webp|svg|ico|css|js|map|xml|pdf|zip|rar|7z|mp3|wav|m4a|aac|ogg|flac|mp4|mov|avi|mkv|webm|m4v)$/i.test(pathname);
  } catch {
    return true;
  }
}

function shouldExploreExternalLink(url, rootUrl, contextText = '', sourceUrl = '') {
  if (sameDomain(url, rootUrl)) return true;
  if (isProbablyAssetUrl(url)) return false;

  const sourcePath = (() => {
    try { return new URL(sourceUrl || rootUrl).pathname.toLowerCase(); } catch { return ''; }
  })();
  const targetPath = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
  })();
  const signalText = `${contextText} ${sourcePath} ${targetPath}`.toLowerCase();

  return /portfolio|case[-\s]?stud|success[-\s]?stor|project|work|client|app|product|platform|demo|showcase/.test(signalText);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addDiscoveredUrl(href, base, rootUrl, seenUrls, urls) {
  const loc = normalizeUrl(href, base);
  if (loc && sameDomain(loc, rootUrl) && !seenUrls.has(loc)) {
    seenUrls.add(loc);
    urls.push(loc);
  }
}

function extractUrlsFromText(value, baseUrl) {
  const found = new Set();
  const source = String(value || '');
  if (!source) return [];

  for (const match of source.matchAll(/https?:\/\/[^\s'"`<>]+/g)) {
    const normalized = normalizeUrl(match[0], baseUrl);
    if (normalized) found.add(normalized);
  }

  for (const match of source.matchAll(/(?:location(?:\.href)?|window\.open|window\.location(?:\.assign|\.replace)?|href)\s*\(?\s*['"]([^'"]+)['"]/gi)) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (normalized) found.add(normalized);
  }

  return [...found];
}

function collectJsonLdUrls(node, baseUrl, urls = new Set()) {
  if (!node) return urls;
  if (Array.isArray(node)) {
    node.forEach((item) => collectJsonLdUrls(item, baseUrl, urls));
    return urls;
  }
  if (typeof node === 'object') {
    Object.entries(node).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const normalized = normalizeUrl(value, baseUrl);
        if (normalized && /(^url$|@id|sameas|item|mainentityofpage|contenturl|embedurl)/i.test(key)) {
          urls.add(normalized);
        }
      } else {
        collectJsonLdUrls(value, baseUrl, urls);
      }
    });
    return urls;
  }
  return urls;
}

function extractJsonLdUrls($, baseUrl) {
  const urls = new Set();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      collectJsonLdUrls(parsed, baseUrl, urls);
    } catch {
      for (const candidate of extractUrlsFromText(raw, baseUrl)) urls.add(candidate);
    }
  });
  return [...urls];
}

function shouldUseReaderFallback(err) {
  const status = err?.response?.status;
  return BOT_BLOCK_STATUSES.has(status);
}

function buildReaderFallbackUrl(url) {
  return `${READER_FALLBACK_PREFIX}${url}`;
}

function extractLinksFromMarkdown(markdown, baseUrl) {
  const urls = new Set();

  for (const match of markdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (normalized) urls.add(normalized);
  }
  for (const match of markdown.matchAll(/https?:\/\/[^\s)>\]]+/g)) {
    const normalized = normalizeUrl(match[0], baseUrl);
    if (normalized) urls.add(normalized);
  }

  return [...urls];
}

function extractReaderTitle(markdown, fallbackTitle) {
  const explicitTitle = markdown.match(/^Title:\s*(.+)$/mi)?.[1]?.trim();
  if (explicitTitle) return explicitTitle;

  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallbackTitle;
}

function stripReaderPreamble(markdown) {
  const normalized = String(markdown || '').replace(/\r/g, '');
  const marker = normalized.match(/\nMarkdown Content:\n/i);
  let content = marker
    ? normalized.slice(marker.index + marker[0].length)
    : normalized;

  content = content
    .split('\n')
    .filter((line) => !/^(Title:|URL Source:|Warning:)/i.test(line.trim()))
    .join('\n')
    .trim();

  return content;
}

async function fetchReaderFallback(url) {
  const res = await axios.get(buildReaderFallbackUrl(url), {
    timeout: REQUEST_TIMEOUT,
    responseType: 'text',
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'text/plain,text/markdown;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const markdown = String(res.data || '');
  const cleanText = stripReaderPreamble(markdown);
  if (!cleanText) return null;

  const title = extractReaderTitle(markdown, url);
  return {
    source: 'reader',
    title,
    rawHtml: `<html><head><title>${escapeHtml(title)}</title></head><body><main>${escapeHtml(cleanText)}</main></body></html>`,
    discoveredUrls: extractLinksFromMarkdown(markdown, url),
  };
}

// ─── Header/footer fingerprinting ────────────────────────────────────────────

const GLOBAL_SELECTORS = [
  'header', 'footer', 'nav',
  '.header', '.footer', '.nav', '.navbar', '.navigation', '.menu',
  '#header', '#footer', '#nav', '#navigation',
  '.site-header', '.site-footer', '.main-nav', '.top-bar',
];

function hashStr(str) {
  return crypto.createHash('md5').update(str.replace(/\s+/g, ' ').trim()).digest('hex');
}

/** Returns Map<hash → text> of all detected global-element blocks for one page */
function getBlockHashes(rawHtml) {
  const $ = cheerio.load(rawHtml);
  const hashes = new Map();
  for (const sel of GLOBAL_SELECTORS) {
    $(sel).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 30) {
        hashes.set(hashStr(text), text);
      }
    });
  }
  return hashes;
}

/**
 * Identify text-blocks that appear on ≥ 30% of pages (or at least 2).
 * These are site-wide (header/footer/nav) and should not repeat per page.
 */
function findGlobalHashes(pages) {
  const freq = new Map();
  for (const page of pages) {
    for (const h of getBlockHashes(page.rawHtml).keys()) {
      freq.set(h, (freq.get(h) || 0) + 1);
    }
  }
  const threshold = Math.max(2, Math.floor(pages.length * 0.3));
  return new Set(
    [...freq.entries()]
      .filter(([, cnt]) => cnt >= threshold)
      .map(([h]) => h)
  );
}

/** Collect the first occurrence of each global block (deduplicated). */
function extractGlobalText(pages, globalHashes) {
  const seen = new Set();
  const parts = [];
  for (const page of pages) {
    for (const [h, text] of getBlockHashes(page.rawHtml)) {
      if (globalHashes.has(h) && !seen.has(h)) {
        seen.add(h);
        parts.push(text);
      }
    }
  }
  return parts.join('\n\n');
}

/** Extract clean page text, stripping noise elements and global recurring blocks. */
function extractPageText(rawHtml, globalHashes) {
  const $ = cheerio.load(rawHtml);

  // Remove noise
  $(
    'script, style, noscript, svg, img, video, audio, iframe, ' +
    'object, embed, [aria-hidden="true"], [role="banner"], ' +
    '[role="navigation"]'
  ).remove();

  // Remove global recurring blocks
  for (const sel of GLOBAL_SELECTORS) {
    $(sel).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (globalHashes.has(hashStr(text))) {
        $(el).remove();
      }
    });
  }

  return $('body')
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractElementContext($, el, pageTitle = '') {
  const parts = [];
  if (pageTitle) parts.push(pageTitle);

  const direct = [
    $(el).text(),
    $(el).attr('title'),
    $(el).attr('aria-label'),
    $(el).attr('alt'),
    $(el).attr('class'),
  ].filter(Boolean).join(' ');
  if (direct) parts.push(direct);

  const heading = $(el).closest('section, article, li, div').find('h1, h2, h3, h4').slice(0, 3)
    .map((_, node) => $(node).text().trim())
    .get()
    .filter(Boolean)
    .join(' ');
  if (heading) parts.push(heading);

  const ancestorText = $(el).closest('section, article, li, div').text().replace(/\s+/g, ' ').trim();
  if (ancestorText) parts.push(ancestorText.slice(0, 280));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ─── Sitemap discovery (deep link crawl) ───────────────────────────────────────

async function fetchSitemapUrls(rootUrl) {
  const base = new URL(rootUrl);
  const sitemapPaths = [
    '/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml',
    '/sitemap1.xml', '/sitemap_1.xml', '/sitemap/index.xml',
  ];
  const seenSitemaps = new Set();
  const seenUrls = new Set();
  const urls = [];

  async function parseSitemap(url) {
    if (seenSitemaps.has(url)) return;
    seenSitemaps.add(url);
    try {
      const res = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        responseType: 'arraybuffer',
        headers: {
          ...BROWSER_HEADERS,
          'Accept': 'application/xml,text/xml,*/*',
        },
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('xml') && !ct.includes('text')) return;

      // Decode the buffer — sitemaps are almost always UTF-8 but handle others
      const charset = detectCharset(ct, res.data);
      const xmlText = decodeBuffer(res.data, charset);

      const $ = cheerio.load(xmlText, { xmlMode: true });
      const nestedSitemaps = [];
      $('sitemap loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && !seenSitemaps.has(loc)) nestedSitemaps.push(loc);
      });
      for (const loc of nestedSitemaps) {
        await parseSitemap(loc);
      }
      $('url').each((_, urlEl) => {
        const primaryLoc = $(urlEl).find('loc').first().text().trim();
        addDiscoveredUrl(primaryLoc, url, rootUrl, seenUrls, urls);

        $(urlEl)
          .find('xhtml\\:link[rel="alternate"], link[rel="alternate"], *[hreflang]')
          .each((__, altEl) => {
            addDiscoveredUrl($(altEl).attr('href'), url, rootUrl, seenUrls, urls);
          });
      });
    } catch { /* ignore */ }
  }

  for (const p of sitemapPaths) {
    const u = new URL(p, base).href;
    await parseSitemap(u);
    if (urls.length > 0) break;
  }
  return urls;
}

/** Build seed URLs from root + priority paths (contact-us, about, portfolio, etc.) */
function buildSeedUrls(rootUrl) {
  const base = new URL(rootUrl);
  const seeds = [];
  for (const p of PRIORITY_PATHS) {
    const u = new URL(p.startsWith('/') ? p : `/${p}`, base).href;
    seeds.push(normalizeUrl(u, rootUrl));
  }
  return seeds.filter(Boolean);
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

async function fetchPage(url) {
  try {
    const res = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      responseType: 'arraybuffer', // raw bytes — allows proper charset decoding
      headers: {
        ...BROWSER_HEADERS,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 8,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const ct = (res.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) return null;

    const charset = detectCharset(ct, res.data);
    return {
      source: 'direct',
      rawHtml: decodeBuffer(res.data, charset),
      discoveredUrls: [],
    };
  } catch (err) {
    if (!shouldUseReaderFallback(err)) throw err;

    const fallbackPage = await fetchReaderFallback(url);
    if (fallbackPage) return fallbackPage;
    throw err;
  }
}

// ─── JSONL builder ────────────────────────────────────────────────────────────

/**
 * Build Anthropic-format JSONL training data.
 *
 * Format per line:
 * { "system": "...", "messages": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}] }
 *
 * Rules:
 *  - Single line per conversation (no embedded newlines in content).
 *  - system:    AI persona.
 *  - user:      Realistic visitor question.
 *  - assistant: Ideal response using page content.
 */
function buildJsonlLines(pages, globalText, companyName, rootUrl) {
  const system =
    `You are a helpful AI assistant for ${companyName}. ` +
    `Answer visitors accurately using only the provided business knowledge. Be concise and professional. ` +
    `For retail or marketplace sites, guide users toward products, orders, delivery, or support. ` +
    `For service businesses, it is ok to guide toward contact or a meeting when relevant.`;

  const oneline = (s) => s.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const lines = [];

  // ── Global entry: site-wide brand / nav / contact (appears once) ────────────
  if (globalText.trim()) {
    lines.push(
      JSON.stringify({
        system,
        source: {
          type: 'site-global',
          page_url: rootUrl,
          page_title: 'Site-wide content',
        },
        messages: [
          {
            role: 'user',
            content: `Tell me about ${companyName} — its main sections, navigation, and how to get in touch.`,
          },
          {
            role: 'assistant',
            content: oneline(`Source URL: ${rootUrl}\n\n${globalText}`),
          },
        ],
      })
    );
  }

  // ── One entry per unique page ────────────────────────────────────────────────
  for (const page of pages) {
    if (!page.cleanText || page.cleanText.trim().length < 50) continue;
    const discoveredLinksText = Array.isArray(page.discoveredLinks) && page.discoveredLinks.length
      ? `\n\nDiscovered links on this page: ${page.discoveredLinks.join(' | ')}`
      : '';
    lines.push(
      JSON.stringify({
        system,
        source: {
          type: 'page',
          page_url: page.url,
          page_title: page.title,
          discovered_links: Array.isArray(page.discoveredLinks) ? page.discoveredLinks : [],
        },
        messages: [
          {
            role: 'user',
            content: `What information is available on the "${page.title}" page?`,
          },
          {
            role: 'assistant',
            content: oneline(`Source URL: ${page.url}\n\n${page.cleanText}${discoveredLinksText}`),
          },
        ],
      })
    );
  }

  return lines.join('\n');
}

function buildJobJsonlContent(job, pages, rootUrl) {
  if (!Array.isArray(pages) || !pages.length || !rootUrl) return null;
  const companyName =
    String(job?.companyId || '')
      .replace(/^_/, '')
      .replace(/_/g, ' ')
      .trim() || new URL(rootUrl).hostname;
  return buildJsonlLines(pages, '', companyName, rootUrl);
}

// ─── Job runner ───────────────────────────────────────────────────────────────

async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  if (job.runnerActive) return;
  job.runnerActive = true;

  if (job.status !== 'completed' && job.status !== 'failed') {
    job.status = 'running';
  }
  if (!job.startedAt) job.startedAt = Date.now();
  persistJob(job);

  const log = (msg) => {
    job.log.push(msg);
    // Keep log bounded to avoid memory bloat on huge sites
    if (job.log.length > 2000) job.log.shift();
    persistJob(job);
  };

  try {
    const rootUrl = normalizeUrl(job.url, job.url);
    if (!rootUrl) throw new Error('Invalid root URL');

    const state = job.crawlState || {};
    const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
    const queued = new Set(Array.isArray(state.queued) ? state.queued : []);
    const queue = Array.isArray(state.queue) ? state.queue : [];
    const externalQueued = new Set(Array.isArray(state.externalQueued) ? state.externalQueued : []);
    const scraped = Array.isArray(state.scrapedPages) ? state.scrapedPages : [];

    const syncState = () => {
      job.crawlState = {
        rootUrl,
        visited: [...visited],
        queued: [...queued],
        queue: [...queue],
        externalQueued: [...externalQueued],
        scrapedPages: scraped,
      };
      job.jsonlContent = buildJobJsonlContent(job, scraped, rootUrl);
      job.progress = { queued: queue.length, done: scraped.length };
      persistJob(job);
    };

    if (!queue.length && !visited.size && !scraped.length) {
      log(`Starting deep link crawl: ${rootUrl}`);
      // Phase 1: Root first, then priority seeds
      queue.push(rootUrl);
      queued.add(rootUrl);
      const seedUrls = buildSeedUrls(rootUrl);
      for (const u of seedUrls) {
        if (u && !queued.has(u)) {
          queue.push(u);
          queued.add(u);
        }
      }

      // Phase 2: Sitemap discovery
      log('Checking sitemap for full URL list…');
      const sitemapUrls = await fetchSitemapUrls(rootUrl);
      if (sitemapUrls.length > 0) {
        log(`Found ${sitemapUrls.length} URLs from sitemap — adding to queue.`);
        for (const u of sitemapUrls) {
          if (u && sameDomain(u, rootUrl) && !queued.has(u)) {
            queue.push(u);
            queued.add(u);
          }
        }
      }
      syncState();
    } else {
      log(`Resuming crawl: ${rootUrl} (done ${scraped.length}, queued ${queue.length})`);
      syncState();
    }

    while (queue.length > 0 && scraped.length < MAX_PAGES) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);

      if (!sameDomain(url, rootUrl)) continue;

      log(`[${scraped.length + 1}] Fetching: ${url}`);
      syncState();

      try {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY));
        const pageData = await fetchPage(url);
        const rawHtml = pageData?.rawHtml;

        if (!rawHtml) {
          log(`  → skipped (non-HTML or redirect)`);
          continue;
        }

        const $ = cheerio.load(rawHtml);
        const title =
          pageData.title ||
          $('title').text().trim() ||
          $('h1').first().text().trim() ||
          url;

        // Discover links — a[href] and common data attributes
        const discoverHref = (href, contextText = '') => {
          if (
            !href ||
            href.startsWith('#') ||
            /^(mailto:|tel:|javascript:)/i.test(href)
          )
            return;
          const full = normalizeUrl(href, url);
          if (!full || visited.has(full) || queued.has(full)) return;

          const isSameSite = sameDomain(full, rootUrl);
          if (!isSameSite) {
            if (!shouldExploreExternalLink(full, rootUrl, contextText, url)) return;
            if (!externalQueued.has(full) && externalQueued.size >= MAX_EXTERNAL_PAGES) return;
            externalQueued.add(full);
          }

          if (
            full
          ) {
            queue.push(full);
            queued.add(full);
          }
        };
        const pageDiscoveredLinks = new Set();
        $('a[href], area[href]').each((_, el) => {
          const contextText = extractElementContext($, el, title);
          const href = $(el).attr('href');
          const normalized = normalizeUrl(href, url);
          if (normalized && !isProbablyAssetUrl(normalized)) pageDiscoveredLinks.add(normalized);
          if ($(el).attr('data-href')) {
            const dataHref = normalizeUrl($(el).attr('data-href'), url);
            if (dataHref && !isProbablyAssetUrl(dataHref)) pageDiscoveredLinks.add(dataHref);
          }
          if ($(el).attr('data-link')) {
            const dataLink = normalizeUrl($(el).attr('data-link'), url);
            if (dataLink && !isProbablyAssetUrl(dataLink)) pageDiscoveredLinks.add(dataLink);
          }
          discoverHref($(el).attr('href'), contextText);
          discoverHref($(el).attr('data-href'), contextText);
          discoverHref($(el).attr('data-link'), contextText);
          discoverHref($(el).attr('data-url'), contextText);
        });
        $('[data-url],[data-href],[data-link],[data-target-url],[data-cta-link],[data-path]').each((_, el) => {
          const contextText = extractElementContext($, el, title);
          ['data-url', 'data-href', 'data-link', 'data-target-url', 'data-cta-link', 'data-path'].forEach((attrName) => {
            const normalized = normalizeUrl($(el).attr(attrName), url);
            if (normalized && !isProbablyAssetUrl(normalized)) pageDiscoveredLinks.add(normalized);
          });
          discoverHref($(el).attr('data-url'), contextText);
          discoverHref($(el).attr('data-href'), contextText);
          discoverHref($(el).attr('data-link'), contextText);
          discoverHref($(el).attr('data-target-url'), contextText);
          discoverHref($(el).attr('data-cta-link'), contextText);
          discoverHref($(el).attr('data-path'), contextText);
        });
        $('button[formaction], input[formaction], form[action]').each((_, el) => {
          const contextText = extractElementContext($, el, title);
          ['formaction', 'action'].forEach((attrName) => {
            const normalized = normalizeUrl($(el).attr(attrName), url);
            if (normalized && !isProbablyAssetUrl(normalized)) pageDiscoveredLinks.add(normalized);
          });
          discoverHref($(el).attr('formaction'), contextText);
          discoverHref($(el).attr('action'), contextText);
        });
        $('[onclick],[onmousedown],[onmouseup]').each((_, el) => {
          const contextText = extractElementContext($, el, title);
          for (const attrName of ['onclick', 'onmousedown', 'onmouseup']) {
            const attrValue = $(el).attr(attrName);
            for (const candidate of extractUrlsFromText(attrValue, url)) {
              if (!isProbablyAssetUrl(candidate)) pageDiscoveredLinks.add(candidate);
              discoverHref(candidate, contextText);
            }
          }
        });
        $('link[rel="alternate"][hreflang], link[rel="alternate"], link[rel="canonical"], link[rel="next"], link[rel="prev"]').each((_, el) => {
          const normalized = normalizeUrl($(el).attr('href'), url);
          if (normalized && !isProbablyAssetUrl(normalized)) pageDiscoveredLinks.add(normalized);
          discoverHref($(el).attr('href'), `${title} ${$(el).attr('rel') || ''}`);
        });
        $('[hreflang]').each((_, el) => {
          const contextText = extractElementContext($, el, title);
          discoverHref($(el).attr('href'), contextText);
          discoverHref($(el).attr('data-href'), contextText);
          discoverHref($(el).attr('data-link'), contextText);
        });
        $('img[src], img[srcset], picture source[srcset]').each((_, el) => {
          const contextText = [
            $(el).attr('alt'),
            $(el).attr('title'),
            $(el).attr('class'),
          ].filter(Boolean).join(' ');
          for (const candidate of extractUrlsFromText($(el).attr('src'), url)) discoverHref(candidate, contextText);
          const srcset = String($(el).attr('srcset') || '');
          srcset.split(',').forEach((part) => {
            const candidate = normalizeUrl(part.trim().split(/\s+/)[0], url);
            if (candidate && !isProbablyAssetUrl(candidate)) discoverHref(candidate, contextText);
          });
        });
        for (const discoveredUrl of extractJsonLdUrls($, url)) {
          if (!isProbablyAssetUrl(discoveredUrl)) pageDiscoveredLinks.add(discoveredUrl);
          discoverHref(discoveredUrl, 'jsonld');
        }
        for (const discoveredUrl of pageData.discoveredUrls || []) {
          if (!isProbablyAssetUrl(discoveredUrl)) pageDiscoveredLinks.add(discoveredUrl);
          discoverHref(discoveredUrl, 'reader-discovered');
        }

        scraped.push({
          url,
          title,
          cleanText: extractPageText(rawHtml, new Set()),
          discoveredLinks: [...pageDiscoveredLinks],
        });
        job.pages.push({ url, title });
        log(pageData.source === 'reader' ? `  → OK via reader fallback: "${title}"` : `  → OK: "${title}"`);
        syncState();
      } catch (err) {
        job.errors.push({ url, error: err.message });
        log(`  → error: ${err.message}`);
        syncState();
      }
    }

    if (scraped.length === 0) {
      throw new Error('No pages could be scraped. Check the URL and try again.');
    }

    log(`Crawl complete — ${scraped.length} pages. Building JSONL…`);
    job.jsonlContent = buildJobJsonlContent(job, scraped, rootUrl);
    const lineCount = job.jsonlContent.split('\n').filter(Boolean).length;

    job.status = 'completed';
    job.completedAt = Date.now();
    job.crawlState = null;
    log(`Done! ${lineCount} JSONL lines generated from ${scraped.length} pages.`);
    persistJob(job);
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    log(`Fatal error: ${err.message}`);
    persistJob(job);
  } finally {
    job.runnerActive = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function createJob(url, companyId) {
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    url,
    companyId,
    status: 'pending',
    pages: [],
    errors: [],
    log: [],
    progress: null,
    startedAt: null,
    completedAt: null,
    jsonlContent: null,
    error: null,
    crawlState: null,
    runnerActive: false,
  };
  jobs.set(jobId, job);
  persistJob(job);
  return jobId;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/** Returns the first active (pending or running) job for the company, if any. */
function getActiveJobForCompany(companyId) {
  for (const job of jobs.values()) {
    if (job.companyId === companyId && (job.status === 'pending' || job.status === 'running')) {
      return job;
    }
  }
  return null;
}

loadPersistedJobs();
for (const job of jobs.values()) {
  if (job.status === 'pending' || job.status === 'running') {
    setTimeout(() => {
      runJob(job.id).catch((err) => {
        console.error(`[scraper] resume job ${job.id} crashed:`, err.message);
      });
    }, 0);
  }
}

module.exports = { createJob, getJob, runJob, getActiveJobForCompany };
