const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { URL } = require('url');

const MAX_PAGES = parseInt(process.env.SCRAPER_MAX_PAGES || '300', 10);
const REQUEST_TIMEOUT = 15000;
const REQUEST_DELAY = 350; // ms between requests — polite crawling

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

// ─── URL utilities ────────────────────────────────────────────────────────────

function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
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

function sameDomain(a, base) {
  try {
    return new URL(a).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
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
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AIChatBotScraper/1.0)',
          Accept: 'application/xml,text/xml,*/*',
        },
        maxRedirects: 3,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('xml')) return;

      const $ = cheerio.load(res.data, { xmlMode: true });
      const nestedSitemaps = [];
      $('sitemap loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && !seenSitemaps.has(loc)) nestedSitemaps.push(loc);
      });
      for (const loc of nestedSitemaps) {
        await parseSitemap(loc);
      }
      $('url loc').each((_, el) => {
        const loc = normalizeUrl($(el).text().trim(), url);
        if (loc && sameDomain(loc, rootUrl) && !seenUrls.has(loc)) {
          seenUrls.add(loc);
          urls.push(loc);
        }
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
  const res = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; AIChatBotScraper/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const ct = res.headers['content-type'] || '';
  if (!ct.includes('text/html')) return null;
  return res.data;
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
    `You are a helpful AI sales assistant and customer representative for ${companyName}. ` +
    `You help website visitors and customers with accurate, friendly answers using only the ` +
    `provided business knowledge. Be professional, concise, and always guide users toward ` +
    `taking action or booking a consultation.`;

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
    lines.push(
      JSON.stringify({
        system,
        source: {
          type: 'page',
          page_url: page.url,
          page_title: page.title,
        },
        messages: [
          {
            role: 'user',
            content: `What information is available on the "${page.title}" page?`,
          },
          {
            role: 'assistant',
            content: oneline(`Source URL: ${page.url}\n\n${page.cleanText}`),
          },
        ],
      })
    );
  }

  return lines.join('\n');
}

// ─── Job runner ───────────────────────────────────────────────────────────────

async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  job.startedAt = Date.now();

  const log = (msg) => {
    job.log.push(msg);
    // Keep log bounded to avoid memory bloat on huge sites
    if (job.log.length > 2000) job.log.shift();
  };

  try {
    const rootUrl = normalizeUrl(job.url, job.url);
    const visited = new Set();
    const queued = new Set();
    const queue = [];

    log(`Starting deep link crawl: ${rootUrl}`);

    // Phase 1: Root first, then priority seeds (contact-us, about, portfolio, etc.)
    queue.push(rootUrl);
    queued.add(rootUrl);
    const seedUrls = buildSeedUrls(rootUrl);
    for (const u of seedUrls) {
      if (u && !queued.has(u)) {
        queue.push(u);
        queued.add(u);
      }
    }

    // Phase 2: Sitemap discovery — add all URLs from sitemap.xml for deep coverage
    log(`Checking sitemap for full URL list…`);
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

    const scraped = [];

    while (queue.length > 0 && scraped.length < MAX_PAGES) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);

      if (!sameDomain(url, rootUrl)) continue;

      log(`[${scraped.length + 1}] Fetching: ${url}`);
      job.progress = { queued: queue.length, done: scraped.length };

      try {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY));
        const rawHtml = await fetchPage(url);

        if (!rawHtml) {
          log(`  → skipped (non-HTML or redirect)`);
          continue;
        }

        const $ = cheerio.load(rawHtml);
        const title =
          $('title').text().trim() ||
          $('h1').first().text().trim() ||
          url;

        // Discover links — a[href] and common data attributes
        const discoverHref = (href) => {
          if (
            !href ||
            href.startsWith('#') ||
            /^(mailto:|tel:|javascript:)/i.test(href)
          )
            return;
          const full = normalizeUrl(href, url);
          if (
            full &&
            !visited.has(full) &&
            !queued.has(full) &&
            sameDomain(full, rootUrl)
          ) {
            queue.push(full);
            queued.add(full);
          }
        };
        $('a[href]').each((_, el) => {
          discoverHref($(el).attr('href'));
          discoverHref($(el).attr('data-href'));
          discoverHref($(el).attr('data-link'));
        });
        $('[data-url]').each((_, el) => discoverHref($(el).attr('data-url')));

        scraped.push({ url, title, rawHtml });
        job.pages.push({ url, title });
        log(`  → OK: "${title}"`);
      } catch (err) {
        job.errors.push({ url, error: err.message });
        log(`  → error: ${err.message}`);
      }
    }

    if (scraped.length === 0) {
      throw new Error('No pages could be scraped. Check the URL and try again.');
    }

    log(`Crawl complete — ${scraped.length} pages. Analysing recurring blocks…`);

    // Identify global header/footer hashes
    const globalHashes = findGlobalHashes(scraped);
    log(`Found ${globalHashes.size} recurring header/footer block(s) — will deduplicate.`);

    // Extract global text (deduplicated)
    const globalText = extractGlobalText(scraped, globalHashes);

    // Extract clean per-page text
    for (const page of scraped) {
      page.cleanText = extractPageText(page.rawHtml, globalHashes);
      delete page.rawHtml; // free memory
    }

    log(`Building JSONL…`);
    const companyName =
      job.companyId.replace(/^_/, '').replace(/_/g, ' ').trim() ||
      new URL(rootUrl).hostname;

    job.jsonlContent = buildJsonlLines(scraped, globalText, companyName, rootUrl);
    const lineCount = job.jsonlContent.split('\n').filter(Boolean).length;

    job.status = 'completed';
    job.completedAt = Date.now();
    log(`Done! ${lineCount} JSONL lines generated from ${scraped.length} pages.`);
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    log(`Fatal error: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function createJob(url, companyId) {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
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
  });
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

module.exports = { createJob, getJob, runJob, getActiveJobForCompany };
