
const express = require('express');
const axios = require('axios');

const app = express();

const PORT = process.env.PORT || 10000;
const HOSTINGER_API_URL =
  'https://trosidex.com/dashboard/api/attendance/device-punches';

// Never hardcode production secrets.
if (!process.env.SYNC_SECRET) {
  throw new Error('SYNC_SECRET environment variable is required');
}
const SYNC_SECRET = process.env.SYNC_SECRET;

// Protect the diagnostic page with HTTP Basic Authentication.
const LOG_VIEW_USER = process.env.LOG_VIEW_USER;
const LOG_VIEW_PASSWORD = process.env.LOG_VIEW_PASSWORD;

const recentLogs = [];
const MAX_LOGS = 100;

function addLog(type, message, details = '') {
  recentLogs.unshift({
    timestamp: new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
    }),
    type,
    message,
    details:
      typeof details === 'string'
        ? details.slice(0, 4000)
        : JSON.stringify(details).slice(0, 4000),
  });

  if (recentLogs.length > MAX_LOGS) recentLogs.pop();

  console.log(`[${type}] ${message}`);
}

// Preserve the incoming request body as raw bytes.
// eSSL devices commonly send tab-separated text.
app.use(express.raw({ type: '*/*', limit: '2mb' }));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function requireLogAuth(req, res, next) {
  if (!LOG_VIEW_USER || !LOG_VIEW_PASSWORD) {
    return res.status(503).send(
      'Log page is disabled. Configure LOG_VIEW_USER and LOG_VIEW_PASSWORD in Render.'
    );
  }

  const auth = req.headers.authorization || '';
  const [scheme, encoded] = auth.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Bridge Logs"');
    return res.status(401).send('Authentication required');
  }

  let credentials;
  try {
    credentials = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return res.status(401).send('Invalid credentials');
  }

  const separator = credentials.indexOf(':');
  const username = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);

  if (
    separator < 0 ||
    username !== LOG_VIEW_USER ||
    password !== LOG_VIEW_PASSWORD
  ) {
    res.set('WWW-Authenticate', 'Basic realm="Bridge Logs"');
    return res.status(401).send('Invalid credentials');
  }

  next();
}

// Health check: verifies that the Render service is running.
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'running',
    service: 'eSSL ADMS Bridge',
    time: new Date().toISOString(),
  });
});

// Protected diagnostic page.
app.get('/errors', requireLogAuth, (req, res) => {
  const rows = recentLogs.map((log) => `
    <div class="entry">
      <small>${escapeHtml(log.timestamp)}</small>
      <strong class="${escapeHtml(log.type)}">
        [${escapeHtml(log.type)}]
      </strong>
      <span>${escapeHtml(log.message)}</span>
      ${log.details
        ? `<pre>${escapeHtml(log.details)}</pre>`
        : ''}
    </div>
  `).join('');

  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="10">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>eSSL Bridge Logs</title>
  <style>
    body { font-family: Arial; background:#171717; color:#eee;
           padding:20px; }
    .entry { border-bottom:1px solid #444; padding:12px 0; }
    small { color:#aaa; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere;
          background:#252525; padding:12px; }
    .ERROR { color:#ff7777; }
    .SUCCESS { color:#69db7c; }
    .INFO { color:#74c0fc; }
  </style>
</head>
<body>
  <h2>eSSL ADMS Bridge Logs</h2>
  <p>Auto-refreshes every 10 seconds. Latest entries appear first.</p>
  ${rows || '<p>No requests recorded since this service started.</p>'}
</body>
</html>`);
});

// eSSL devices can send GET requests for polling/keep-alive.
app.get('/iclock/cdata', (req, res) => {
  addLog('INFO', 'GET /iclock/cdata received', {
    query: req.query,
    contentType: req.headers['content-type'] || '',
  });

  res.status(200).type('text/plain').send('OK');
});

// Receive and process eSSL POST requests.
app.post('/iclock/cdata', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : String(req.body ?? '');

  addLog('INFO', 'POST /iclock/cdata received', {
    query: req.query,
    contentType: req.headers['content-type'] || '',
    bodyLength: Buffer.byteLength(rawBody, 'utf8'),
    bodyPreview: rawBody.slice(0, 1500),
  });

  if (!rawBody.trim()) {
    addLog('INFO', 'Empty body received; responding OK');
    return res.status(200).type('text/plain').send('OK');
  }

  const punches = parseEsslPunches(rawBody);

  addLog('INFO', `Parsed ${punches.length} attendance punches`);

  if (punches.length === 0) {
    addLog('INFO', 'No recognizable punch rows found', {
      bodyPreview: rawBody.slice(0, 1500),
    });

    // ADMS devices generally expect a response even for non-punch requests.
    return res.status(200).type('text/plain').send('OK');
  }

  try {
    const response = await axios.post(
      HOSTINGER_API_URL,
      { punches },
      {
        headers: {
          'X-Attendance-Sync-Secret': SYNC_SECRET,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (response.status >= 200 && response.status < 300) {
      addLog('SUCCESS', `Laravel accepted ${punches.length} punches`, {
        status: response.status,
        response: response.data,
      });
    } else {
      addLog('ERROR', 'Laravel API returned a non-success status', {
        status: response.status,
        response: response.data,
        endpoint: HOSTINGER_API_URL,
      });
    }
  } catch (error) {
    addLog('ERROR', 'Could not reach Laravel API', {
      message: error.message,
      code: error.code || '',
      status: error.response?.status || null,
      response: error.response?.data || null,
    });
  }

  // Response required by the device. A failed forwarding attempt is
  // recorded above; this does not guarantee that Laravel saved punches.
  return res.status(200).type('text/plain').send('OK');
});

// Record unexpected requests instead of silently ignoring them.
app.use((req, res) => {
  addLog('INFO', 'Other endpoint requested', {
    method: req.method,
    path: req.path,
    query: req.query,
  });

  res.status(404).type('text/plain').send('Not Found');
});

function parseEsslPunches(rawBody) {
  const punches = [];

  for (const originalLine of rawBody.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line) continue;

    // Typical ADMS attendance rows contain a PIN, timestamp,
    // status, verification mode, work code, etc.
    const parts = line.split(/\s+/);

    if (parts.length < 2) continue;

    const userId = parts[0];
    const date = parts[1];

    // Ignore protocol/status lines and headers.
    if (
      /^(OK|ERROR|GET|POST|ATTLOG|OPERLOG|USER|table=|SN=)/i.test(userId)
    ) {
      continue;
    }

    // Support timestamps split into date + time.
    let timestamp;
    let statusIndex;

    if (
      parts.length >= 3 &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      /^\d{2}:\d{2}:\d{2}$/.test(parts[2])
    ) {
      timestamp = `${date} ${parts[2]}`;
      statusIndex = 3;
    } else if (
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(
        parts.slice(1).join(' ')
      )
    ) {
      const combined = parts.slice(1).join(' ');
      timestamp = combined.slice(0, 19).replace('T', ' ');
      statusIndex = 2;
    } else {
      // Do not forward rows whose timestamp cannot be recognized.
      continue;
    }

    const statusValue = Number.parseInt(parts[statusIndex], 10);

    punches.push({
      user_id: userId,
      timestamp,
      status: Number.isFinite(statusValue) ? statusValue : 0,
    });
  }

  return punches;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`eSSL ADMS Bridge running on port ${PORT}`);
  addLog('INFO', 'Bridge started');
});
