require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');

// Helper to make HTTP/HTTPS requests (compatible across all Node versions)
function safeFetchJSON(urlStr, options = {}, data = null, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    try {
      const parsedUrl = new URL(urlStr);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      
      const reqOptions = {
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      if (data && (reqOptions.method === 'POST' || reqOptions.method === 'PUT')) {
        if (!reqOptions.headers['Content-Type']) {
          reqOptions.headers['Content-Type'] = 'application/json';
        }
      }

      const req = lib.request(parsedUrl, reqOptions, (res) => {
        // Handle HTTP Redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return safeFetchJSON(res.headers.location, { method: 'GET' }, null, redirectCount + 1).then(resolve).catch(reject);
        }
        
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch(e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });
      
      req.on('error', reject);
      if (data) {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

const app = express();
const PORT = process.env.PORT || 5555;

// ─── Middleware Setup ──────────────────────────────────────────
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Admin Auth Middleware (Stateless Cookie to support cPanel Passenger / PM2 Cluster)
const isAdmin = (req, res, next) => {
  const cookieHeader = req.headers.cookie || '';
  const authSecret = process.env.SESSION_SECRET || 'birla-evam-secret-key-change-this';
  
  if (cookieHeader.includes(`admin_auth=${authSecret}`)) {
    return next();
  }
  
  if (req.path.startsWith('/api/')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  res.redirect('/admin/login');
};

// Rate Limiters for safety
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  message: { success: false, message: 'Too many submissions. Please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts.' }
});

// ─── Database Setup (MySQL) ──────────────────────────────────
let db = null;
async function connectDB() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'birla_evam',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log('✅ Connected to MySQL Database (birla_evam)');
    // Synchronize dynamic settings
    await loadSMTPSettings();
  } catch (err) {
    console.error('❌ Database Connection Failed:', err.message);
    console.error('   ⚠️  Application running in memory mode. SMTP dynamic settings and lead logging will fall back to local config.');
  }
}

// ─── SMTP & NodeMailer Management (Dynamic) ───────────────────
let transporter = null;
let smtpConfig = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT) || 465,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  secure: parseInt(process.env.SMTP_PORT) === 465,
  notifyEmail: process.env.NOTIFY_EMAIL || ''
};

// Helper: Initialize Transporter
function initializeTransporter(config) {
  if (!config.user || !config.pass) {
    transporter = null;
    console.log('⚠️  SMTP Transporter NOT configured. Email lead notifications are disabled.');
    return;
  }

  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      },
      tls: { rejectUnauthorized: false }
    });

    transporter.verify((error) => {
      if (error) {
        console.error('❌ SMTP Connection Error:', error.message);
      } else {
        console.log(`📧 SMTP NodeMailer Connected! Notifications routing -> ${config.notifyEmail}`);
      }
    });
  } catch (err) {
    console.error('❌ Failed to create SMTP transporter:', err.message);
    transporter = null;
  }
}

// Load settings from Database
async function loadSMTPSettings() {
  if (!db) {
    // Fall back to env
    initializeTransporter(smtpConfig);
    return;
  }

  try {
    const [rows] = await db.execute('SELECT * FROM settings');
    const settingsMap = {};
    rows.forEach(r => {
      settingsMap[r.key_name] = r.key_value;
    });

    smtpConfig = {
      host: settingsMap['smtp_host'] || process.env.SMTP_HOST || 'localhost',
      port: parseInt(settingsMap['smtp_port']) || parseInt(process.env.SMTP_PORT) || 465,
      user: settingsMap['smtp_user'] || process.env.SMTP_USER || '',
      pass: settingsMap['smtp_pass'] || process.env.SMTP_PASS || '',
      secure: (settingsMap['smtp_secure'] === 'true' || settingsMap['smtp_secure'] === undefined) && (parseInt(settingsMap['smtp_port']) === 465 || parseInt(process.env.SMTP_PORT) === 465),
      notifyEmail: settingsMap['notify_email'] || process.env.NOTIFY_EMAIL || ''
    };

    console.log('⚙️  Loaded SMTP configurations from Database.');
    initializeTransporter(smtpConfig);
  } catch (err) {
    console.error('❌ Error loading SMTP configurations from database:', err.message);
    initializeTransporter(smtpConfig);
  }
}

// ─── Helpers: IST Timestamp & Browser Profiling ───────────────
function getISTTimestamp() {
  const date = new Date();
  const istDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const pad = (n) => n.toString().padStart(2, '0');
  return `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())} ${pad(istDate.getHours())}:${pad(istDate.getMinutes())}:${pad(istDate.getSeconds())}`;
}

function parseUserAgent(ua) {
  if (!ua) return { device: 'Unknown', browser: 'Unknown' };
  let device = 'Desktop';
  if (/mobile/i.test(ua)) device = 'Mobile';
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet';
  let browser = 'Unknown';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';
  return { device, browser };
}

// ─── Helper: Send Email Notification ─────────────────────────
async function sendEmailNotification(lead) {
  if (!transporter || !smtpConfig.notifyEmail) return;

  const mailOptions = {
    from: `"Birla Evam Leads" <${smtpConfig.user}>`,
    to: smtpConfig.notifyEmail,
    subject: `🏠 New Lead: ${lead.name} | ${lead.project}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d4af37; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #1c0628, #2a0a3b); padding: 24px; text-align: center; border-bottom: 3px solid #d4af37;">
          <h1 style="color: #d4af37; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 1px;">🏠 New Lead Captured</h1>
          <p style="color: #fff; margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Project: ${lead.project}</p>
        </div>
        <div style="padding: 24px; background: #fdfbf7;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600; width: 35%;">Name</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #333;">${lead.name}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">Phone</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db;"><a href="tel:${lead.phone}" style="color: #d4af37; text-decoration: none; font-weight: 600;">${lead.phone}</a></td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">Email</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #333;">${lead.email || 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">Inquiry Source</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #333; font-weight: 500;">${lead.source_button}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">IP Address</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #666; font-size: 12px;">${lead.ip_address}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">Device / Browser</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #333;">${lead.device} / ${lead.browser}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">Location (IP-based)</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #333;">${lead.city || 'Unknown'}, ${lead.country || 'Unknown'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #1c0628; font-weight: 600;">UTM Tracking</td>
              <td style="padding: 12px; border-bottom: 1px solid #ede7db; color: #666; font-size: 12px;">Source: ${lead.utm_source || '-'} | Medium: ${lead.utm_medium || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 12px; color: #1c0628; font-weight: 600;">Time (IST)</td>
              <td style="padding: 12px; color: #333; font-size: 13px;">${lead.submitted_at}</td>
            </tr>
          </table>
        </div>
        <div style="background: #1c0628; padding: 16px; text-align: center; border-top: 1px solid #d4af37;">
          <p style="color: #d4af37; margin: 0; font-size: 12px; font-weight: 500;">Birla Evam — Premium Leads Console</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Notification sent for lead: ${lead.name}`);
  } catch (err) {
    console.error('❌ Email sending failed:', err.message);
  }
}

// ─── Authentication Routes ────────────────────────────────────
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'login.html'));
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'BirlaEvam2026';
  const authSecret = process.env.SESSION_SECRET || 'birla-evam-secret-key-change-this';

  if (username === adminUser && password === adminPass) {
    res.setHeader('Set-Cookie', `admin_auth=${authSecret}; Path=/; HttpOnly; Max-Age=86400`);
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `admin_auth=; Path=/; HttpOnly; Max-Age=0`);
  res.redirect('/admin/login');
});

// ─── API Routes ───────────────────────────────────────────────

// Submit a new lead
app.post('/api/leads', async (req, res) => {
  try {
    const { name, phone, email, source_button, refer_url, city, country, utm_source, utm_medium } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required.' });
    }

    const phoneClean = phone.replace(/[^\d+]/g, '');
    if (phoneClean.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number.' });
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
      }
    }

    // Geolocation / VPN Filtering
    const ua = req.headers['user-agent'] || '';
    const parsedUA = parseUserAgent(ua);
    const device = req.body.device || parsedUA.device;
    const browser = req.body.browser || parsedUA.browser;
    const ip = req.body.ip_address || req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || 'Unknown';

    let resolvedCity = city || 'Unknown';
    let resolvedCountry = country || 'Unknown';

    // Anti-Spam / VPN / Hosting Check & Server Geolocation Validation
    if (ip !== 'Unknown' && ip !== '::1' && ip !== '127.0.0.1') {
      try {
        const ipRes = await safeFetchJSON(`http://ip-api.com/json/${ip}?fields=status,hosting,country,city,countryCode`);
        const ipData = ipRes.data;
        
        if (ipData.status === 'success') {
          // Block known Hosting providers / Proxies / VPN nodes
          if (ipData.hosting) {
            return res.status(403).json({ success: false, message: 'VPN/Proxy detected. Please disable VPN to submit form.' });
          }
          
          resolvedCity = resolvedCity === 'Unknown' ? ipData.city : resolvedCity;
          resolvedCountry = resolvedCountry === 'Unknown' ? ipData.country : resolvedCountry;

          // Target restrictions: Prevent foreign fake leads. Maximize conversion for local/India-focused audience
          // Reject leads outside India (+91 market focus) if they match specific spam origins
          if (ipData.countryCode !== 'IN' && (ipData.countryCode === 'RU' || ipData.countryCode === 'CN' || ipData.countryCode === 'UA' || ipData.countryCode === 'US')) {
             return res.status(403).json({ success: false, message: 'Submissions from your region are restricted due to high spam.' });
          }
        }
      } catch (e) {
        console.log('⚠️ Geolocation/VPN check skipped:', e.message);
      }
    }

    const lead = {
      id: uuidv4(),
      name: name.trim(),
      phone: phoneClean,
      email: (email || '').trim(),
      ip_address: ip,
      device,
      browser,
      refer_url: refer_url || req.headers.referer || '',
      city: resolvedCity,
      country: resolvedCountry,
      project: req.body.project || 'Birla Evam',
      source_button: source_button || 'General Enquiry',
      utm_source: utm_source || '',
      utm_medium: utm_medium || '',
      submitted_at: getISTTimestamp()
    };

    if (db) {
      const sql = `
        INSERT INTO leads (id, name, phone, email, ip_address, device, browser, refer_url, city, country, project, source_button, utm_source, utm_medium, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await db.execute(sql, [
        lead.id, lead.name, lead.phone, lead.email, lead.ip_address, 
        lead.device, lead.browser, lead.refer_url, lead.city, lead.country, 
        lead.project, lead.source_button, lead.utm_source, lead.utm_medium, lead.submitted_at
      ]);
    } else {
      console.log('💾 [Memory Log Only] Lead Saved:', lead);
    }

    // Fire & Forget notifications
    sendEmailNotification(lead).catch(console.error);

    // Google Sheets integration fallback
    if (process.env.GOOGLE_SHEET_WEBHOOK) {
      safeFetchJSON(process.env.GOOGLE_SHEET_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, lead).catch(err => console.error('Google Sheet Error:', err.message));
    }

    res.json({ success: true, message: 'Thank you! Our expert team will contact you shortly.' });

  } catch (err) {
    console.error('❌ Lead processing error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// Get leads list (Admin)
app.get('/api/leads', isAdmin, async (req, res) => {
  try {
    if (!db) return res.json({ success: true, leads: [], total: 0 });
    const { deleted } = req.query;
    const isDeleted = deleted === 'true' ? 1 : 0;
    const [leads] = await db.execute('SELECT * FROM leads WHERE is_deleted = ? ORDER BY submitted_at DESC', [isDeleted]);
    res.json({ success: true, leads, total: leads.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve leads.' });
  }
});

// Get leads stats (Admin)
app.get('/api/leads/stats', isAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: true, stats: { total: 0, today: 0, sources: [], devices: [], projects: [] } });
    }
    const todayStr = getISTTimestamp().split(' ')[0];
    const [totalRows] = await db.execute('SELECT COUNT(*) as count FROM leads WHERE is_deleted = 0');
    const [todayRows] = await db.execute('SELECT COUNT(*) as count FROM leads WHERE is_deleted = 0 AND submitted_at LIKE ?', [`${todayStr}%`]);
    const [sources] = await db.execute('SELECT source_button, COUNT(*) as count FROM leads WHERE is_deleted = 0 GROUP BY source_button ORDER BY count DESC');
    const [devices] = await db.execute('SELECT device, COUNT(*) as count FROM leads WHERE is_deleted = 0 GROUP BY device ORDER BY count DESC');

    res.json({
      success: true,
      stats: { total: totalRows[0].count, today: todayRows[0].count, sources, devices }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve statistics.' });
  }
});

// Soft Delete (Admin)
app.delete('/api/leads/:id', isAdmin, async (req, res) => {
  try {
    if (!db) return res.status(404).json({ success: false, message: 'Database disconnected.' });
    const { id } = req.params;
    await db.execute('UPDATE leads SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Lead successfully deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete lead.' });
  }
});

// Restore Lead (Admin)
app.patch('/api/leads/:id/restore', isAdmin, async (req, res) => {
  try {
    if (!db) return res.status(404).json({ success: false, message: 'Database disconnected.' });
    const { id } = req.params;
    await db.execute('UPDATE leads SET is_deleted = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Lead successfully restored.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to restore lead.' });
  }
});

// Permanent Delete (Admin)
app.delete('/api/leads/:id/permanent', isAdmin, async (req, res) => {
  try {
    if (!db) return res.status(404).json({ success: false, message: 'Database disconnected.' });
    const { id } = req.params;
    await db.execute('DELETE FROM leads WHERE id = ?', [id]);
    res.json({ success: true, message: 'Lead permanently deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to permanently delete lead.' });
  }
});

// Export CSV (Admin)
app.get('/api/leads/export/csv', isAdmin, async (req, res) => {
  try {
    if (!db) return res.status(404).send('Database disconnected.');
    const [leads] = await db.execute('SELECT * FROM leads WHERE is_deleted = 0 ORDER BY submitted_at DESC');
    const headers = ['Name', 'Phone', 'Email', 'IP Address', 'Device', 'Browser', 'Referrer URL', 'City', 'Country', 'Project', 'Source', 'UTM Source', 'UTM Medium', 'Submitted At'];
    const csvRows = [headers.join(',')];
    leads.forEach(l => {
      csvRows.push([
        `"${l.name}"`, `"${l.phone}"`, `"${l.email}"`, `"${l.ip_address}"`,
        `"${l.device}"`, `"${l.browser}"`, `"${l.refer_url}"`, `"${l.city}"`,
        `"${l.country}"`, `"${l.project}"`, `"${l.source_button}"`,
        `"${l.utm_source}"`, `"${l.utm_medium}"`, `"${l.submitted_at}"`
      ].join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=birla-evam-leads.csv');
    res.send(csvRows.join('\n'));
  } catch (err) {
    res.status(500).send('CSV export failed.');
  }
});

// ─── SMTP Admin Settings Endpoints (Dynamic) ─────────────────

// Get SMTP configuration (Admin)
app.get('/api/settings/smtp', isAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      smtp: {
        host: smtpConfig.host,
        port: smtpConfig.port,
        user: smtpConfig.user,
        pass: smtpConfig.pass ? '••••••••••••' : '', // Obscure password
        secure: smtpConfig.secure,
        notifyEmail: smtpConfig.notifyEmail
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to read SMTP settings.' });
  }
});

// Save SMTP settings (Admin)
app.post('/api/settings/smtp', isAdmin, async (req, res) => {
  try {
    const { host, port, user, pass, secure, notifyEmail } = req.body;

    if (!host || !port || !user || !notifyEmail) {
      return res.status(400).json({ success: false, message: 'Host, Port, User, and Recipient Email are required.' });
    }

    if (db) {
      const settings = {
        'smtp_host': host,
        'smtp_port': port,
        'smtp_user': user,
        'smtp_secure': secure ? 'true' : 'false',
        'notify_email': notifyEmail
      };

      // Only update password if a new one is typed
      if (pass && pass !== '••••••••••••') {
        settings['smtp_pass'] = pass;
      }

      for (const [key, val] of Object.entries(settings)) {
        await db.execute('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?', [key, val, val]);
      }

      // Reload config
      await loadSMTPSettings();
      res.json({ success: true, message: 'SMTP configurations successfully updated!' });
    } else {
      res.status(404).json({ success: false, message: 'Database connection failed. Unable to persist settings.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save SMTP settings.' });
  }
});

// Send Test Email (Admin)
app.post('/api/settings/test-email', isAdmin, async (req, res) => {
  try {
    const { host, port, user, pass, secure, notifyEmail } = req.body;

    if (!host || !port || !user || !notifyEmail) {
      return res.status(400).json({ success: false, message: 'All SMTP configurations are required to perform a test.' });
    }

    const testPassword = (pass && pass !== '••••••••••••') ? pass : smtpConfig.pass;

    if (!testPassword) {
      return res.status(400).json({ success: false, message: 'Password is required to verify the connection.' });
    }

    console.log(`⏳ Testing SMTP Connection on: ${host}:${port} (user: ${user})...`);
    
    const testTransporter = nodemailer.createTransport({
      host: host,
      port: parseInt(port),
      secure: secure,
      auth: {
        user: user,
        pass: testPassword
      },
      tls: { rejectUnauthorized: false }
    });

    // Verify SMTP connection
    await testTransporter.verify();

    // Send the test mail
    const mailOptions = {
      from: `"Birla Evam SMTP Test" <${user}>`,
      to: notifyEmail,
      subject: `📧 SMTP Connection Test: Successful!`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #28a745; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #28a745; padding: 20px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">✅ Connection Success!</h1>
          </div>
          <div style="padding: 20px; background-color: #f8f9fa;">
            <p style="font-size: 14px; color: #333; line-height: 1.5;">This is a test notification confirming that your dynamically configured SMTP server at <strong>${host}:${port}</strong> is fully verified and connected!</p>
            <p style="font-size: 12px; color: #666; margin-top: 15px;">Timestamp: ${getISTTimestamp()} (IST)</p>
          </div>
        </div>
      `
    };

    await testTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Test email successfully sent! Please check your inbox.' });

  } catch (err) {
    console.error('❌ Dynamic SMTP Connection Test Failed:', err.message);
    res.status(500).json({ success: false, message: `SMTP connection failed: ${err.message}` });
  }
});

// ─── Pages Routing ────────────────────────────────────────────

// Admin panel dashboard
app.get('/admin', isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'index.html'));
});

// Catch-all: Route all other requests to landing page (compatible with Express 5 path-to-regexp v8 spec)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// ─── Start Server ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n👑 Birla Evam Premium Platform`);
  console.log(`   Local Server: http://localhost:${PORT}`);
  console.log(`   Admin Portal: http://localhost:${PORT}/admin`);
  
  await connectDB();
});
