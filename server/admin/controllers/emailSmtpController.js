const pool = require('../../db/index');
const CompanyAdmin = require('../models/CompanyAdmin');
const {
  getTransporterForCompany,
  invalidateCompanySmtpCache,
  resolveLeadFromAddress,
} = require('../../services/smtpTransportService');

async function fetchSmtpRow(companyId) {
  const { rows } = await pool.query(
    `SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_email
     FROM smtp_settings WHERE company_id = $1`,
    [companyId]
  );
  return rows[0] || null;
}

async function getSmtp(req, res) {
  try {
    await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    const row = await fetchSmtpRow(req.adminCompanyId);
    const passwordConfigured = Boolean(
      row?.smtp_password && String(row.smtp_password).trim() !== ''
    );
    res.json({
      smtp: {
        host: row?.smtp_host || '',
        port: row?.smtp_port != null ? Number(row.smtp_port) : '',
        secure: Boolean(row?.smtp_secure),
        user: row?.smtp_user || '',
        fromEmail: row?.smtp_from_email || '',
        passwordConfigured,
      },
      fallbackHint:
        'Leave host empty to use the server-wide SMTP from environment variables (SMTP_HOST, SMTP_PORT, …).',
    });
  } catch (err) {
    console.error('[email smtp] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function putSmtp(req, res) {
  try {
    const companyId = req.adminCompanyId;
    await CompanyAdmin.findByCompanyId(companyId);

    const b = req.body?.smtp || req.body || {};
    const cur = await fetchSmtpRow(companyId);

    const next = {
      host: b.host !== undefined ? String(b.host || '').trim() : String(cur?.smtp_host || '').trim(),
      port: b.port !== undefined
        ? (b.port === '' || b.port == null ? null : Number.parseInt(String(b.port), 10))
        : (cur?.smtp_port != null ? Number(cur.smtp_port) : null),
      secure: b.secure !== undefined ? Boolean(b.secure) : Boolean(cur?.smtp_secure),
      user: b.user !== undefined ? String(b.user || '').trim() : String(cur?.smtp_user || '').trim(),
      fromEmail: b.fromEmail !== undefined
        ? String(b.fromEmail || '').trim().toLowerCase()
        : String(cur?.smtp_from_email || '').trim().toLowerCase(),
      password: cur?.smtp_password || null,
    };

    if (b.fromEmail !== undefined && next.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.fromEmail)) {
      return res.status(400).json({ error: 'Invalid From email address' });
    }

    if (b.port !== undefined && next.port != null) {
      if (!Number.isFinite(next.port) || next.port < 1 || next.port > 65535) {
        return res.status(400).json({ error: 'Invalid SMTP port' });
      }
    }

    if (b.password !== undefined) {
      const p = String(b.password);
      next.password = p.length > 0 ? p : null;
    }

    if (next.host && !next.port) next.port = 587;
    if (!next.host) {
      next.port = null;
      next.secure = false;
      next.user = null;
      next.password = null;
    }

    await pool.query(
      `INSERT INTO smtp_settings (
         company_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_email
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (company_id) DO UPDATE SET
         smtp_host = EXCLUDED.smtp_host,
         smtp_port = EXCLUDED.smtp_port,
         smtp_secure = EXCLUDED.smtp_secure,
         smtp_user = EXCLUDED.smtp_user,
         smtp_password = EXCLUDED.smtp_password,
         smtp_from_email = EXCLUDED.smtp_from_email,
         updated_at = NOW()`,
      [
        companyId,
        next.host || null,
        next.port,
        next.secure,
        next.user || null,
        next.password,
        next.fromEmail || null,
      ]
    );

    invalidateCompanySmtpCache(companyId);

    const row = await fetchSmtpRow(companyId);
    const passwordConfigured = Boolean(
      row?.smtp_password && String(row.smtp_password).trim() !== ''
    );
    res.json({
      smtp: {
        host: row?.smtp_host || '',
        port: row?.smtp_port != null ? Number(row.smtp_port) : '',
        secure: Boolean(row?.smtp_secure),
        user: row?.smtp_user || '',
        fromEmail: row?.smtp_from_email || '',
        passwordConfigured,
      },
    });
  } catch (err) {
    console.error('[email smtp] put:', err);
    res.status(500).json({ error: err.message });
  }
}

async function testSmtp(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const toRaw = String(req.body?.to || '').trim().toLowerCase()
      || String(company.lead_notification_email || '').trim().toLowerCase()
      || String(company.admin_email || '').trim().toLowerCase();
    if (!toRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toRaw)) {
      return res.status(400).json({
        error: 'Provide a valid `to` address or set lead notification email under Settings.',
      });
    }

    const transporter = await getTransporterForCompany(companyId);
    if (!transporter) {
      return res.status(400).json({
        error: 'No SMTP available. Configure company SMTP below or set SMTP_HOST on the server.',
      });
    }

    const smtpRow = await fetchSmtpRow(companyId);
    const from = resolveLeadFromAddress(smtpRow?.smtp_from_email);

    await transporter.sendMail({
      from,
      to: toRaw,
      subject: `[${company.name || companyId}] Test email (SMTP)`,
      text: 'This is a test message from your chatbot admin SMTP settings.',
    });

    res.json({ ok: true, to: toRaw });
  } catch (err) {
    console.error('[email smtp] test:', err);
    res.status(500).json({ error: err.message || 'Send failed' });
  }
}

module.exports = { getSmtp, putSmtp, testSmtp };
