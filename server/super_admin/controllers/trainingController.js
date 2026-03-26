/**
 * Super admin training controller.
 * Wraps the existing admin training service but allows the super admin
 * to target any company (passed as req.body.companyId or req.params.companyId).
 */
const { createJob, getJob, runJob, getActiveJobForCompany } = require('../../services/scraperService');
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
const Chatbot = require('../../models/Chatbot');
const pool = require('../../db/index');
const path = require('path');
const fs = require('fs');

// Validate companyId exists in DB
async function resolveCompany(companyId) {
  if (!companyId) return null;
  const { rows } = await pool.query(`SELECT company_id FROM chatbots WHERE company_id = $1`, [companyId]);
  return rows[0] || null;
}

// POST /super-admin/training/:companyId/scrape/start
async function startScrape(req, res) {
  try {
    const companyId = req.params.companyId;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }
    let parsed;
    try { parsed = new URL(url.trim()); } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http and https URLs are allowed' });
    }

    const activeJob = getActiveJobForCompany(companyId);
    if (activeJob) {
      return res.json({ jobId: activeJob.id, companyId, resumed: true });
    }

    const jobId = createJob(url.trim(), companyId);
    runJob(jobId).catch((err) => console.error(`[super admin scrape] job ${jobId} crashed:`, err.message));
    return res.json({ jobId, companyId });
  } catch (err) {
    console.error('[super admin training] startScrape:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/training/:companyId/scrape/status/:jobId
async function scrapeStatus(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.companyId !== req.params.companyId) {
    return res.status(403).json({ error: 'Job does not belong to this company' });
  }
  return res.json({
    id: job.id, status: job.status, pages: job.pages,
    errors: job.errors?.slice(-20) || [], log: job.log?.slice(-100) || [],
    progress: job.progress, startedAt: job.startedAt,
    completedAt: job.completedAt, error: job.error,
    jsonlLines: job.jsonlContent ? job.jsonlContent.split('\n').filter(Boolean).length : 0,
  });
}

// GET /super-admin/training/:companyId/scrape/active
async function scrapeActive(req, res) {
  const { companyId } = req.params;
  const company = await resolveCompany(companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const job = getActiveJobForCompany(companyId);
  if (!job) return res.json({ jobId: null });

  return res.json({
    jobId: job.id,
    status: job.status,
    pages: job.pages,
    errors: job.errors?.slice(-20) || [],
    log: job.log?.slice(-100) || [],
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    jsonlLines: job.jsonlContent ? job.jsonlContent.split('\n').filter(Boolean).length : 0,
  });
}

// POST /super-admin/training/:companyId/scrape/save/:jobId
async function scrapeSave(req, res) {
  try {
    const { companyId, jobId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const job = getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.companyId !== companyId) return res.status(403).json({ error: 'Job does not belong to this company' });
    if (job.status === 'failed') return res.status(400).json({ error: `Job failed and cannot be saved (status: ${job.status})` });
    if (!job.jsonlContent?.trim()) return res.status(400).json({ error: 'No scraped pages are ready to save yet' });

    const { appended, skipped } = mergeScrapedContent(companyId, job.jsonlContent);
    setLastTrainingCompleted(companyId);

    return res.json({ ok: true, partial: job.status !== 'completed', jobStatus: job.status, savedLines: appended, skippedLines: skipped, totalLines: job.jsonlContent.split('\n').filter(Boolean).length });
  } catch (err) {
    console.error('[super admin training] scrapeSave:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/training/:companyId/conversational
async function saveConversational(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { text, userMessage, assistantMessage } = req.body || {};
    if (!text && !userMessage && !assistantMessage) {
      return res.status(400).json({ error: 'Provide text instruction or userMessage/assistantMessage pair' });
    }
    const type = text ? 'instruction' : 'qa';
    appendConversational(companyId, {
      type,
      text: text ? String(text).trim() : undefined,
      userMessage: userMessage ? String(userMessage).trim() : undefined,
      assistantMessage: assistantMessage ? String(assistantMessage).trim() : undefined,
    });
    setLastTrainingCompleted(companyId);
    return res.json({ saved: true, mode: 'conversational' });
  } catch (err) {
    console.error('[super admin training] saveConversational:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/training/:companyId/database  (multipart)
async function saveDatabase(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

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
    return res.json({ saved: true, mode: 'database', appended, skipped, filesProcessed: files.length });
  } catch (err) {
    console.error('[super admin training] saveDatabase:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/training/:companyId/media/transcribe  (multipart)
async function transcribeMedia(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No media files uploaded' });

    const chatbot = await Chatbot.findByCompanyId(companyId);
    const apiKey = String(chatbot?.gemini_api_key || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is required for auto media transcription' });
    }

    let modelName = chatbot?.ai_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (String(modelName).toLowerCase().includes('claude')) {
      modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    const entries = await transcribeMediaFiles(files, {
      apiKey,
      model: modelName,
      keySource: chatbot?.gemini_api_key ? 'company settings' : 'server environment',
    });
    const jsonlContent = entries.map((e) => JSON.stringify(e)).join('\n');

    return res.json({
      ok: true,
      files: entries.map((e) => ({ name: e.name, mediaType: e.mediaType })),
      jsonlContent,
      transcriptPreview: entries.map((e) => `${e.name}:\n${e.content}`).join('\n\n'),
    });
  } catch (err) {
    console.error('[super admin training] transcribeMedia:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/training/:companyId/media  (multipart)
async function saveMedia(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No media files uploaded' });

    const transcript = req.body?.transcript != null ? String(req.body.transcript) : '';
    const jsonlContent = req.body?.jsonlContent != null ? String(req.body.jsonlContent) : '';

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
    return res.json({ saved: true, mode: 'media', files: saved, linesAppended: appended, linesSkipped: skipped });
  } catch (err) {
    console.error('[super admin training] saveMedia:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/training/:companyId/structured
// POST /super-admin/training/:companyId/structured/upload
async function saveStructured(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

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
        // eslint-disable-next-line global-require
        const XLSX = require('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const firstSheet = wb.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]);
      } else {
        return res.status(400).json({ error: 'Unsupported file type. Use JSON, CSV, or Excel.' });
      }
    } else if (req.body?.rows && Array.isArray(req.body.rows)) {
      rows = req.body.rows;
    } else if (Array.isArray(req.body)) {
      rows = req.body;
    } else {
      return res.status(400).json({ error: 'Send rows array in body or upload a JSON/CSV/Excel file' });
    }

    const count = appendStructured(companyId, rows);
    setLastTrainingCompleted(companyId);
    return res.json({ saved: true, count });
  } catch (err) {
    console.error('[super admin training] saveStructured:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/training/:companyId/documents  (multipart)
async function saveDocuments(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const results = [];
    for (const file of req.files) {
      const text = await extractFromBuffer(file.buffer, file.originalname);
      if (!text) { results.push({ file: file.originalname, skipped: true }); continue; }
      await saveUploadedDoc(companyId, file.originalname, text);
      results.push({ file: file.originalname, chars: text.length });
    }
    setLastTrainingCompleted(companyId);
    return res.json({ ok: true, results });
  } catch (err) {
    console.error('[super admin training] saveDocuments:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/training/:companyId/manual
async function getManual(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const text = await getManualKnowledge(companyId);
    return res.json({ text: text || '' });
  } catch (err) {
    console.error('[super admin training] getManual:', err);
    return res.status(500).json({ error: err.message });
  }
}

// PUT /super-admin/training/:companyId/manual
async function setManual(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const { text } = req.body;
    if (typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
    await setManualKnowledge(companyId, text);
    setLastTrainingCompleted(companyId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin training] setManual:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/training/:companyId/files
async function listFiles(req, res) {
  try {
    const { companyId } = req.params;
    const company = await resolveCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const files = await listTrainingFiles(companyId);
    return res.json(files);
  } catch (err) {
    console.error('[super admin training] listFiles:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  startScrape, scrapeStatus, scrapeActive, scrapeSave,
  saveConversational, saveDocuments,
  saveDatabase, transcribeMedia, saveMedia, saveStructured,
  getManual, setManual, listFiles,
};
