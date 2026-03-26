const { createJob, getJob, runJob } = require('../../services/scraperService');
const { TRAIN_DATA_DIR } = require('../../services/trainingLoader');
const { setLastTrainingCompleted } = require('../../services/trainingNotificationStore');
const { appendSystemLog } = require('../../services/adminLogStore');
const {
  appendConversational,
  saveUploadedDoc,
  appendDatabaseKnowledge,
  saveUploadedMedia,
  appendJsonlLinesOnlyIfNew,
  appendStructured,
  getManualKnowledge,
  setManualKnowledge,
  listTrainingFiles,
  mergeScrapedContent,
} = require('../../services/trainingDataService');
const { extractFromBuffer, isDatabaseKnowledgeFile } = require('../../services/documentExtractor');
const { transcribeMediaFiles } = require('../../services/mediaTranscriptionService');
const CompanyAdmin = require('../models/CompanyAdmin');
const {
  buildAdminVisibilityPayload,
  hasAnyTrainingModuleAccess,
  isTrainingModuleAllowed,
} = require('../../services/adminSettingsAccess');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

function assertTrainingModule(req, res, company, moduleKey) {
  const av = buildAdminVisibilityPayload(company);
  if (isTrainingModuleAllowed(av, moduleKey)) return true;
  res.status(403).json({ error: 'This training area is managed by the super admin for this company.' });
  return false;
}

function assertAnyTrainingAccess(req, res, company) {
  const av = buildAdminVisibilityPayload(company);
  if (hasAnyTrainingModuleAccess(av)) return true;
  res.status(403).json({ error: 'Training is managed by the super admin for this company.' });
  return false;
}

async function startScrape(req, res) {
  try {
    const { url } = req.body;
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'scrape')) return;

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
    appendSystemLog('error', `Training scrape start: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

async function scrapeStatus(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.companyId !== req.adminCompanyId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const company = await CompanyAdmin.findByCompanyId(job.companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!assertTrainingModule(req, res, company, 'scrape')) return;
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
  try {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.companyId !== req.adminCompanyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const company = await CompanyAdmin.findByCompanyId(job.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'scrape')) return;
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

    setLastTrainingCompleted(job.companyId);

    res.json({
      saved: true,
      companyId: job.companyId,
      linesAppended: appended,
      linesSkipped: skipped,
      links: uniqueLinks.length,
    });
  } catch (err) {
    console.error('[admin training] scrape save:', err);
    appendSystemLog('error', `Training save: ${err.message}`, { jobId: req.params.jobId, companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── Conversational training (append instructions / Q&A) ───────────────────
async function saveConversational(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'conversational')) return;
    const { text, userMessage, assistantMessage } = req.body || {};
    const type = text ? 'instruction' : 'qa';
    appendConversational(companyId, {
      type,
      text: text ? String(text).trim() : undefined,
      userMessage: userMessage ? String(userMessage).trim() : undefined,
      assistantMessage: assistantMessage ? String(assistantMessage).trim() : undefined,
    });
    setLastTrainingCompleted(companyId);
    res.json({ saved: true, mode: 'conversational' });
  } catch (err) {
    console.error('[admin training] conversational:', err);
    appendSystemLog('error', `Training conversational: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── Document upload (PDF, DOCX, TXT — append as new files) ─────────────────
async function saveDocuments(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    let needsDb = false;
    let needsDoc = false;
    for (const f of files) {
      if (isDatabaseKnowledgeFile(f.originalname, f.mimetype)) needsDb = true;
      else needsDoc = true;
    }
    if (needsDb && !assertTrainingModule(req, res, company, 'database')) return;
    if (needsDoc && !assertTrainingModule(req, res, company, 'documents')) return;
    const saved = [];
    for (const f of files) {
      const text = await extractFromBuffer(f.buffer, f.originalname, f.mimetype);
      if (isDatabaseKnowledgeFile(f.originalname, f.mimetype)) {
        const { appended, skipped } = appendDatabaseKnowledge(companyId, [
          { title: f.originalname || 'SQL', content: text },
        ]);
        saved.push({
          originalName: f.originalname,
          savedAs: 'scraped_website.jsonl',
          mode: 'database',
          appended: appended > 0,
          skipped,
        });
      } else {
        const name = saveUploadedDoc(companyId, f.originalname, text);
        if (name) saved.push({ originalName: f.originalname, savedAs: name, mode: 'doc', appended: true });
        else saved.push({ originalName: f.originalname, savedAs: 'scraped_website.jsonl', mode: 'doc', appended: false });
      }
    }
    setLastTrainingCompleted(companyId);
    res.json({ saved: true, mode: 'documents', files: saved });
  } catch (err) {
    console.error('[admin training] documents:', err);
    appendSystemLog('error', `Training documents: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── Database / SQL training (schema, DDL, paste + uploads) ────────────────
async function saveDatabase(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'database')) return;
    const files = req.files || [];
    const title = req.body?.title != null ? String(req.body.title).trim() : '';
    const content = req.body?.content != null ? String(req.body.content).trim() : '';

    const entries = [];
    if (content) {
      entries.push({ title: title || 'Pasted database knowledge', content });
    }
    for (const f of files) {
      const text = await extractFromBuffer(f.buffer, f.originalname, f.mimetype);
      entries.push({ title: f.originalname || 'upload', content: text });
    }

    if (!entries.length) {
      return res.status(400).json({ error: 'Add schema/SQL text or upload file(s)' });
    }

    const { appended, skipped } = appendDatabaseKnowledge(companyId, entries);
    setLastTrainingCompleted(companyId);
    res.json({
      saved: true,
      mode: 'database',
      appended,
      skipped,
      filesProcessed: files.length,
    });
  } catch (err) {
    console.error('[admin training] database:', err);
    appendSystemLog('error', `Training database: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── Media training (images, audio, video) ──────────────────────────────────
async function saveMedia(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'media')) return;
    const files = req.files || [];
    const transcript = req.body?.transcript != null ? String(req.body.transcript) : '';
    const jsonlContent = req.body?.jsonlContent != null ? String(req.body.jsonlContent) : '';
    if (!files.length) {
      return res.status(400).json({ error: 'No media files uploaded' });
    }

    const saved = [];
    for (const f of files) {
      const result = saveUploadedMedia(companyId, f, transcript);
      saved.push({
        originalName: f.originalname,
        mediaType: result.mediaType,
        storedAs: result.savedName,
        appended: Boolean(result.appended),
      });
    }

    let appended = 0;
    let skipped = 0;
    if (jsonlContent.trim()) {
      const merged = appendJsonlLinesOnlyIfNew(companyId, jsonlContent);
      appended = merged.appended;
      skipped = merged.skipped;
    }

    setLastTrainingCompleted(companyId);
    res.json({ saved: true, mode: 'media', files: saved, linesAppended: appended, linesSkipped: skipped });
  } catch (err) {
    console.error('[admin training] media:', err);
    appendSystemLog('error', `Training media: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

async function transcribeMedia(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No media files uploaded' });
    }

    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'media')) return;
    const apiKey = String(company?.gemini_api_key || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is required for auto media transcription' });
    }

    let modelName = company?.ai_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (String(modelName).toLowerCase().includes('claude')) {
      modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    const entries = await transcribeMediaFiles(files, {
      apiKey,
      model: modelName,
    });
    const jsonlContent = entries.map((e) => JSON.stringify(e)).join('\n');

    res.json({
      ok: true,
      files: entries.map((e) => ({ name: e.name, mediaType: e.mediaType })),
      jsonlContent,
      transcriptPreview: entries.map((e) => `${e.name}:\n${e.content}`).join('\n\n'),
    });
  } catch (err) {
    console.error('[admin training] media transcribe:', err);
    appendSystemLog('error', `Training media transcribe: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── Structured data (JSON array, CSV, or Excel — append to scraped_website.jsonl if not already present) ─────────────────
async function saveStructured(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'structured')) return;
    let rows = [];

    if (req.file) {
      const buffer = req.file.buffer;
      const name = (req.file.originalname || '').toLowerCase();
      if (name.endsWith('.json') || name.endsWith('.jsonl')) {
        const str = buffer.toString('utf8');
        const parsed = JSON.parse(str);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else if (name.endsWith('.csv')) {
        const str = buffer.toString('utf8');
        const lines = str.split(/\r?\n/).filter((l) => l.trim());
        const header = lines[0] ? lines[0].split(',').map((h) => h.trim()) : [];
        for (let i = 1; i < lines.length; i += 1) {
          const vals = lines[i].split(',').map((v) => v.trim());
          const obj = {};
          header.forEach((h, j) => { obj[h || `col${j}`] = vals[j] ?? ''; });
          rows.push(obj);
        }
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const firstSheet = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheet];
        rows = XLSX.utils.sheet_to_json(sheet);
      } else {
        return res.status(400).json({ error: 'Unsupported file type. Use JSON, CSV, or Excel.' });
      }
    } else if (req.body && req.body.rows && Array.isArray(req.body.rows)) {
      rows = req.body.rows;
    } else if (req.body && Array.isArray(req.body)) {
      rows = req.body;
    } else {
      return res.status(400).json({ error: 'Send rows array in body or upload a JSON/CSV/Excel file' });
    }

    const count = appendStructured(companyId, rows);
    setLastTrainingCompleted(companyId);
    res.json({ saved: true, mode: 'structured', count });
  } catch (err) {
    console.error('[admin training] structured:', err);
    appendSystemLog('error', `Training structured: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── Manual knowledge (get / set single file) ──────────────────────────────
async function getManual(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'manual')) return;
    const content = getManualKnowledge(companyId);
    res.json({ content });
  } catch (err) {
    console.error('[admin training] get manual:', err);
    res.status(500).json({ error: err.message });
  }
}

async function setManual(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertTrainingModule(req, res, company, 'manual')) return;
    const content = req.body?.content != null ? String(req.body.content) : '';
    setManualKnowledge(companyId, content);
    setLastTrainingCompleted(companyId);
    res.json({ saved: true, mode: 'manual' });
  } catch (err) {
    console.error('[admin training] set manual:', err);
    appendSystemLog('error', `Training manual: ${err.message}`, { companyId: req.adminCompanyId });
    res.status(500).json({ error: err.message });
  }
}

// ─── List training files (for UI) ──────────────────────────────────────────
async function listFiles(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!assertAnyTrainingAccess(req, res, company)) return;
    const files = listTrainingFiles(companyId);
    res.json({ files });
  } catch (err) {
    console.error('[admin training] list files:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  startScrape,
  scrapeStatus,
  scrapeSave,
  saveConversational,
  saveDocuments,
  saveDatabase,
  transcribeMedia,
  saveMedia,
  saveStructured,
  getManual,
  setManual,
  listFiles,
};
