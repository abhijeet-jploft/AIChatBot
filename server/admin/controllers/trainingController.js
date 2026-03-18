const { createJob, getJob, runJob } = require('../../services/scraperService');
const { TRAIN_DATA_DIR } = require('../../services/trainingLoader');
const { setLastTrainingCompleted } = require('../../services/trainingNotificationStore');
const path = require('path');
const fs = require('fs');

async function startScrape(req, res) {
  try {
    const { url } = req.body;
    const companyId = req.adminCompanyId;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http and https URLs are allowed' });
    }

    const jobId = createJob(url.trim(), companyId);
    runJob(jobId).catch((err) =>
      console.error(`[admin scrape] job ${jobId} crashed:`, err.message)
    );

    res.json({ jobId, companyId });
  } catch (err) {
    console.error('[admin training] start scrape:', err);
    res.status(500).json({ error: err.message });
  }
}

async function scrapeStatus(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.companyId !== req.adminCompanyId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json({
    id: job.id,
    status: job.status,
    pages: job.pages,
    errors: job.errors?.slice(-20) || [],
    log: job.log?.slice(-100) || [],
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    jsonlLines: job.jsonlContent
      ? job.jsonlContent.split('\n').filter(Boolean).length
      : 0,
  });
}

async function scrapeSave(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.companyId !== req.adminCompanyId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job is not complete yet' });
  }

  const dir = path.join(TRAIN_DATA_DIR, job.companyId);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, 'scraped_website.jsonl');
  fs.writeFileSync(filePath, job.jsonlContent, 'utf8');

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

  setLastTrainingCompleted(job.companyId);

  res.json({
    saved: true,
    companyId: job.companyId,
    lines: job.jsonlContent.split('\n').filter(Boolean).length,
    links: uniqueLinks.length,
  });
}

module.exports = { startScrape, scrapeStatus, scrapeSave };
