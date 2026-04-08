const pool = require('../../db/index');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword, generateToken, getSessionExpiry } = require('../../admin/utils/auth');
const CompanyAdmin = require('../../admin/models/CompanyAdmin');
const { MODULE_SETTINGS_TABLE_NAMES } = require('../../db/companySettingsSchema');
const { normalizeHttpUrl, normalizePhoneWithCountryCode } = require('../../utils/contactValidation');

const TRAIN_DATA_DIR = path.join(__dirname, '../../../train_data');

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'company';
}

function isValidAdminEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function normalizeAdminEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normalizeCompanyWebsite(raw) {
  return normalizeHttpUrl(raw);
}

// GET /super-admin/companies
async function listCompanies(req, res) {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    let offset = Math.max(0, Number(req.query.offset) || 0);
    if (req.query.page != null && req.query.offset == null) {
      offset = (page - 1) * limit;
    }

    const search = String(req.query.search || '').trim();
    const agentStatus = String(req.query.agentStatus || 'all').trim().toLowerCase();
    const adminLogin = String(req.query.adminLogin || 'all').trim().toLowerCase();

    const filters = [`c.company_id <> '_scrape_jobs'`];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const searchPh = `$${params.length}`;
      filters.push(
        `(
          c.company_id ILIKE ${searchPh}
          OR c.name ILIKE ${searchPh}
          OR COALESCE(c.description, '') ILIKE ${searchPh}
          OR COALESCE(c.admin_email, '') ILIKE ${searchPh}
          OR COALESCE(ch.display_name, '') ILIKE ${searchPh}
          OR COALESCE(em.embed_slug, '') ILIKE ${searchPh}
          OR COALESCE(ch.ai_mode, '') ILIKE ${searchPh}
        )`
      );
    }

    if (agentStatus === 'active') {
      filters.push(`COALESCE(ch.agent_paused, FALSE) = FALSE`);
    } else if (agentStatus === 'paused') {
      filters.push(`COALESCE(ch.agent_paused, FALSE) = TRUE`);
    }

    if (adminLogin === 'ready') {
      filters.push(`c.admin_email IS NOT NULL AND c.admin_email <> '' AND c.password_hash IS NOT NULL`);
    } else if (adminLogin === 'no_password') {
      filters.push(`c.admin_email IS NOT NULL AND c.admin_email <> '' AND c.password_hash IS NULL`);
    } else if (adminLogin === 'no_email') {
      filters.push(`(c.admin_email IS NULL OR c.admin_email = '')`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const baseFromSql = `
      FROM chatbots c
      LEFT JOIN chat_settings ch ON ch.company_id = c.company_id
      LEFT JOIN embed_settings em ON em.company_id = c.company_id
      ${whereSql}
    `;

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total ${baseFromSql}`,
      params
    );
    const total = Number(totalResult.rows?.[0]?.total || 0);

    const listParams = [...params, limit, offset];
    const limitPh = `$${listParams.length - 1}`;
    const offsetPh = `$${listParams.length}`;
    const { rows } = await pool.query(
      `SELECT
         c.company_id, c.name, c.description, c.created_at, c.admin_email, c.is_suspended,
         CASE WHEN c.password_hash IS NOT NULL THEN true ELSE false END AS admin_configured,
         ch.display_name, ch.agent_paused, ch.ai_mode,
         em.embed_slug,
         (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.company_id AND l.deleted_at IS NULL) AS lead_count,
         (SELECT COUNT(*) FROM chat_sessions s WHERE s.company_id = c.company_id) AS conversation_count
       ${baseFromSql}
       ORDER BY c.created_at DESC
       LIMIT ${limitPh}
       OFFSET ${offsetPh}`,
      listParams
    );

    const currentPage = Math.floor(offset / limit) + 1;
    return res.json({
      rows,
      total,
      limit,
      page: currentPage,
      offset,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[super admin] listCompanies:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/companies  — create new company
async function createCompany(req, res) {
  try {
    const { companyId, name, description, adminPassword, adminEmail } = req.body;
    if (!companyId || !name) {
      return res.status(400).json({ error: 'Company ID and Company Name are required' });
    }
    if (String(name).trim().length > 25) {
      return res.status(400).json({ error: 'Company Name must be 25 characters or fewer' });
    }

    const email = normalizeAdminEmail(adminEmail);
    if (!email || !isValidAdminEmail(email)) {
      return res.status(400).json({ error: 'A valid Admin Login Email is required for company admin login' });
    }

    const emailClash = await pool.query(
      `SELECT company_id FROM chatbots WHERE admin_email = $1`,
      [email]
    );
    if (emailClash.rows.length > 0) {
      return res.status(409).json({ error: 'This admin email is already in use' });
    }

    const cid = String(companyId).trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cid)) {
      return res.status(400).json({ error: 'Company ID may only contain letters, numbers, underscores, and hyphens (max 80 chars)' });
    }

    const existing = await pool.query(`SELECT company_id FROM chatbots WHERE company_id = $1`, [cid]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A company with this ID already exists' });
    }

    if (adminPassword && String(adminPassword).length < 8) {
      return res.status(400).json({ error: 'Admin Password must be at least 8 characters when provided' });
    }

    const passwordHash = adminPassword ? hashPassword(String(adminPassword)) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO chatbots (company_id, name, description, password_hash, admin_email)
         VALUES ($1, $2, $3, $4, $5)`,
        [cid, String(name).trim(), description?.trim() || null, passwordHash, email]
      );

      // Insert default rows for all module settings tables
      const allowed = new Set(MODULE_SETTINGS_TABLE_NAMES);
      for (const table of MODULE_SETTINGS_TABLE_NAMES) {
        if (!allowed.has(table)) continue;
        await client.query(
          `INSERT INTO ${table} (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
          [cid]
        );
      }

      // Generate embed credentials
      const baseSlug = slugify(String(name).trim() || cid);
      let slug = baseSlug;
      let n = 1;
      while (true) {
        const clash = await client.query(
          `SELECT 1 FROM embed_settings WHERE embed_slug = $1 AND company_id <> $2`,
          [slug, cid]
        );
        if (!clash.rows.length) break;
        slug = `${baseSlug}-${++n}`;
      }
      const embedSecret = crypto.randomBytes(32).toString('hex');
      await client.query(
        `UPDATE embed_settings SET embed_slug = $1, embed_secret = $2 WHERE company_id = $3`,
        [slug, embedSecret, cid]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Create train_data directory
    const trainDir = path.join(TRAIN_DATA_DIR, cid);
    if (!fs.existsSync(trainDir)) {
      fs.mkdirSync(trainDir, { recursive: true });
    }

    const { rows } = await pool.query(`SELECT * FROM chatbots WHERE company_id = $1`, [cid]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[super admin] createCompany:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/companies/:companyId
async function getCompany(req, res) {
  try {
    const { companyId } = req.params;
    const { rows } = await pool.query(
      `SELECT
         c.company_id, c.name, c.description, c.created_at, c.admin_email, c.is_suspended,
         c.owner_name, c.admin_phone, c.company_website, c.industry_category,
         CASE WHEN c.password_hash IS NOT NULL THEN true ELSE false END AS admin_configured,
         ch.display_name, ch.agent_paused, ch.ai_mode, ch.ai_provider, ch.ai_model,
         ch.greeting_message, ch.widget_position,
         th.theme_primary_color,
         em.embed_slug, em.embed_secret,
         ld.lead_email_notifications_enabled, ld.lead_notification_email,
         (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.company_id AND l.deleted_at IS NULL) AS lead_count,
         (SELECT COUNT(*) FROM chat_sessions s WHERE s.company_id = c.company_id) AS conversation_count,
         (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.company_id AND l.status = 'new' AND l.deleted_at IS NULL) AS new_lead_count
       FROM chatbots c
       LEFT JOIN chat_settings ch ON ch.company_id = c.company_id
       LEFT JOIN theme_settings th ON th.company_id = c.company_id
       LEFT JOIN embed_settings em ON em.company_id = c.company_id
       LEFT JOIN lead_settings ld ON ld.company_id = c.company_id
       WHERE c.company_id = $1`,
      [companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Company not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[super admin] getCompany:', err);
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /super-admin/companies/:companyId
async function updateCompany(req, res) {
  try {
    const { companyId } = req.params;
    const {
      name,
      description,
      adminEmail,
      ownerName,
      adminPhone,
      phone,
      companyWebsite,
      industryCategory,
    } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (String(name).trim().length > 25) {
        return res.status(400).json({ error: 'Company Name must be 25 characters or fewer' });
      }
      updates.push(`name = $${params.length + 1}`); params.push(String(name).trim());
    }
    if (description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(description?.trim() || null); }

    if (adminEmail !== undefined) {
      const email = normalizeAdminEmail(adminEmail);
      if (!email || !isValidAdminEmail(email)) {
        return res.status(400).json({ error: 'Admin Login Email must be a valid email address' });
      }
      const clash = await pool.query(
        `SELECT company_id FROM chatbots WHERE admin_email = $1 AND company_id <> $2`,
        [email, companyId]
      );
      if (clash.rows.length > 0) {
        return res.status(409).json({ error: 'This admin email is already in use' });
      }
      updates.push(`admin_email = $${params.length + 1}`);
      params.push(email);
    }

    if (ownerName !== undefined) {
      updates.push(`owner_name = $${params.length + 1}`);
      params.push(String(ownerName || '').trim().slice(0, 255) || null);
    }

    const phoneVal = adminPhone !== undefined ? adminPhone : phone;
    if (phoneVal !== undefined) {
      updates.push(`admin_phone = $${params.length + 1}`);
      params.push(normalizePhoneWithCountryCode(phoneVal));
    }

    if (companyWebsite !== undefined) {
      updates.push(`company_website = $${params.length + 1}`);
      params.push(normalizeCompanyWebsite(companyWebsite));
    }

    if (industryCategory !== undefined) {
      updates.push(`industry_category = $${params.length + 1}`);
      params.push(String(industryCategory || '').trim().slice(0, 128) || null);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(companyId);
    const { rowCount } = await pool.query(
      `UPDATE chatbots SET ${updates.join(', ')} WHERE company_id = $${params.length}`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Company not found' });
    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'INVALID_PHONE') {
      return res.status(400).json({ error: 'Phone number must include country code and contain 6 to 15 digits.' });
    }
    if (err?.code === 'INVALID_URL') {
      return res.status(400).json({ error: 'Company website must be a valid URL.' });
    }
    console.error('[super admin] updateCompany:', err);
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /super-admin/companies/:companyId
async function deleteCompany(req, res) {
  try {
    const { companyId } = req.params;
    // Prevent deleting the system default company
    if (companyId === '_default') {
      return res.status(400).json({ error: 'Cannot delete the default company' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM chatbots WHERE company_id = $1`,
      [companyId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Company not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] deleteCompany:', err);
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /super-admin/companies/:companyId/suspension
async function setCompanySuspension(req, res) {
  try {
    const { companyId } = req.params;
    const suspend = Boolean(req.body?.suspend);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE chatbots
         SET is_suspended = $1
         WHERE company_id = $2`,
        [suspend, companyId]
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Company not found' });
      }
      // While suspended, force chatbot to paused mode.
      await client.query(
        `UPDATE chat_settings
         SET agent_paused = $1, updated_at = NOW()
         WHERE company_id = $2`,
        [suspend, companyId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return res.json({ ok: true, isSuspended: suspend });
  } catch (err) {
    console.error('[super admin] setCompanySuspension:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/companies/:companyId/reset-password
async function resetAdminPassword(req, res) {
  try {
    const { companyId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New Password must be at least 8 characters' });
    }
    const hash = hashPassword(String(newPassword));
    const { rowCount } = await pool.query(
      `UPDATE chatbots SET password_hash = $1 WHERE company_id = $2`,
      [hash, companyId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Company not found' });
    // Invalidate existing admin sessions for this company
    await pool.query(`DELETE FROM admin_sessions WHERE company_id = $1`, [companyId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[super admin] resetAdminPassword:', err);
    return res.status(500).json({ error: err.message });
  }
}

// GET /super-admin/companies/:companyId/stats
async function getCompanyStats(req, res) {
  try {
    const { companyId } = req.params;
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM chat_sessions WHERE company_id = $1) AS total_conversations,
         (SELECT COUNT(*) FROM leads WHERE company_id = $1 AND deleted_at IS NULL) AS total_leads,
         (SELECT COUNT(*) FROM leads WHERE company_id = $1 AND status = 'new' AND deleted_at IS NULL) AS new_leads,
         (SELECT COUNT(*) FROM leads WHERE company_id = $1 AND lead_score_category IN ('hot', 'very_hot') AND deleted_at IS NULL) AS hot_leads,
         (SELECT COUNT(*) FROM chat_sessions WHERE company_id = $1 AND created_at >= NOW() - INTERVAL '7 days') AS conversations_last_7d,
         (SELECT COUNT(*) FROM leads WHERE company_id = $1 AND created_at >= NOW() - INTERVAL '7 days' AND deleted_at IS NULL) AS leads_last_7d`,
      [companyId]
    );
    return res.json(rows[0]);
  } catch (err) {
    console.error('[super admin] getCompanyStats:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/companies/:companyId/regenerate-embed-secret
async function regenerateEmbedSecret(req, res) {
  try {
    const { companyId } = req.params;
    const embedSecret = crypto.randomBytes(32).toString('hex');
    const { rowCount } = await pool.query(
      `UPDATE embed_settings SET embed_secret = $1, updated_at = NOW() WHERE company_id = $2`,
      [embedSecret, companyId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Company not found' });
    return res.json({ ok: true, embedSecret });
  } catch (err) {
    console.error('[super admin] regenerateEmbedSecret:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /super-admin/companies/:companyId/impersonate — issue company admin session (same as login)
async function impersonateCompanyAdmin(req, res) {
  try {
    const { companyId } = req.params;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const token = generateToken();
    const expiresAt = getSessionExpiry();
    await CompanyAdmin.createSession(companyId, token, expiresAt);

    return res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      companyId,
      companyName: company.name,
    });
  } catch (err) {
    console.error('[super admin] impersonate:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listCompanies,
  createCompany,
  getCompany,
  updateCompany,
  setCompanySuspension,
  deleteCompany,
  resetAdminPassword,
  getCompanyStats,
  regenerateEmbedSecret,
  impersonateCompanyAdmin,
};
