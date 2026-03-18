const path = require('path');
const fs = require('fs');
const { createJob, getJob, runJob } = require('../services/scraperService');
const { TRAIN_DATA_DIR } = require('../services/trainingLoader');
const { mergeScrapedContent } = require('../services/trainingDataService');

/**
 * POST /api/scrape/start
 * Body: { url, companyId? }
 */
function start(req, res) {
  const { url, companyId } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return res.status(400).json({ error: 'Invalid URL — include protocol, e.g. https://example.com' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are allowed' });
  }

  const cid =
    companyId && companyId.trim()
      ? companyId.trim()
      : `_${parsed.hostname.replace(/[^a-z0-9]/gi, '_')}`;

  const jobId = createJob(url.trim(), cid);
  runJob(jobId).catch((err) =>
    console.error(`[scraper] job ${jobId} crashed:`, err.message)
  );

  res.json({ jobId, companyId: cid });
}

/**
 * GET /api/scrape/status/:jobId
 */
function status(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({
    id: job.id,
    status: job.status,
    pages: job.pages,
    errors: job.errors.slice(-20),
    log: job.log.slice(-100),
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    jsonlLines: job.jsonlContent
      ? job.jsonlContent.split('\n').filter(Boolean).length
      : 0,
  });
}

/**
 * GET /api/scrape/download/:jobId
 */
function download(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job is not complete yet' });
  }

  const filename = `${job.companyId}_scraped.jsonl`;
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(job.jsonlContent);
}

/**
 * POST /api/scrape/save/:jobId
 */
function save(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job is not complete yet' });
  }

  const dir = path.join(TRAIN_DATA_DIR, job.companyId);
  fs.mkdirSync(dir, { recursive: true });

  const { appended, skipped } = mergeScrapedContent(job.companyId, job.jsonlContent);

  const linksPath = path.join(dir, 'scraped_website_links.txt');
  const linkLines = (job.pages || [])
    .map((p) => {
      const title = String(p?.title || '').trim();
      const url = String(p?.url || '').trim();
      if (!url) return '';
      return title ? `${title} | ${url}` : url;
    })
    .filter(Boolean);
  const uniqueLinks = [...new Set(linkLines)];
  fs.writeFileSync(linksPath, uniqueLinks.join('\n'), 'utf8');

  res.json({
    saved: true,
    companyId: job.companyId,
    linesAppended: appended,
    linesSkipped: skipped,
    links: uniqueLinks.length,
  });
}

module.exports = { start, status, download, save };
