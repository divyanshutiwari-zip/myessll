const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

const HOSTINGER_API_URL = 'https://trosidex.com/dashboard/api/attendance/device-punches';
const SYNC_SECRET = process.env.SYNC_SECRET || '19f242ec78fcbf655e5f5f9474a3b4354c9a68100bea4d2bd586c05a248234e8';

// Recent logs aur errors ko store karne ke liye array
const recentLogs = [];
function addLog(type, message, details = '') {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    recentLogs.unshift({ timestamp, type, message, details });
    if (recentLogs.length > 50) recentLogs.pop(); // Max 50 logs rakhenge
}

// Browser par errors aur logs dekhne ke liye naya page
app.get('/errors', (req, res) => {
    let html = `<html><head><title>Render Bridge Logs & Errors</title><style>body{font-family:Arial;padding:20px;background:#1e1e1e;color:#fff;}pre{background:#2d2d2d;padding:10px;border-radius:5px;overflow-x:auto;color:#ff8787;}.error{color:#ff6b6b;}.success{color:#51cf66;}.info{color:#74c0fc;}</style></head><body>`;
    html += `<h1>Render Bridge Live Logs & Errors</h1>`;
    html += `<p><a href="/errors" style="color:#74c0fc; text-decoration:underline;">Refresh Page</a></p>`;
    html += `<hr style="border-color:#444;">`;
    
    if (recentLogs.length === 0) {
        html += `<p>Abhi tak koi logs record nahi hue hain. Machine se request aane ka wait hai.</p>`;
    } else {
        recentLogs.forEach(log => {
            const colorClass = log.type === 'ERROR' ? 'error' : (log.type === 'SUCCESS' ? 'success' : 'info');
            html += `<div style="margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">`;
            html += `<small style="color:#aaa;">${log.timestamp}</small> | <strong class="${colorClass}">[${log.type}]</strong> <span>${log.message}</span>`;
            if (log.details) {
                html += `<pre>${JSON.stringify(log.details, null, 2)}</pre>`;
            }
            html += `</div>`;
        });
    }
    html += `</body></html>`;
    res.send(html);
});

app.get('/iclock/cdata', (req, res) => {
    addLog('INFO', 'GET request received from browser/ping.');
    return res.send('OK');
});

app.all('/iclock/cdata', async (req, res) => {
    try {
        if (!req.body || 
            (typeof req.body === 'object' && Object.keys(req.body).length === 0) || 
            (typeof req.body === 'string' && req.body.trim() === '')) {
            addLog('INFO', 'Empty body or keep-alive ping received from machine.');
            return res.send('OK');
        }

        let rawData = req.body;
        if (typeof rawData === 'object') {
            rawData = JSON.stringify(rawData);
        }

        const punches = parseEsslPunches(rawData); 
        addLog('INFO', `Parsed ${punches.length} punches from machine raw data.`);

        if (punches.length > 0) {
            try {
                const response = await axios.post(HOSTINGER_API_URL, {
                    punches: punches
                }, {
                    headers: {
                        'X-Attendance-Sync-Secret': SYNC_SECRET,
                        'Content-Type': 'application/json'
                    }
                });
                addLog('SUCCESS', `Successfully forwarded ${punches.length} punches to Hostinger! Response:`, response.data);
            } catch (apiError) {
                const errData = apiError.response ? { status: apiError.response.status, data: apiError.response.data } : apiError.message;
                addLog('ERROR', `Hostinger API rejected request: ${apiError.message}`, errData);
            }
        }

        return res.send('OK');
    } catch (error) {
        addLog('ERROR', `Exception in /iclock/cdata: ${error.message}`);
        return res.send('OK'); 
    }
});

function parseEsslPunches(rawBody) {
    const punches = [];
    if (!rawBody || typeof rawBody !== 'string') return punches;

    const lines = rawBody.split('\n');
    for (let line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            punches.push({
                user_id: parts[0],
                timestamp: parts[1] + (parts[2] ? ' ' + parts[2] : ''),
                status: parts[3] ? parseInt(parts[3]) : 0
            });
        }
    }
    return punches;
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`eSSL ADMS Bridge running on port ${PORT}`);
});
