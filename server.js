const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.text({ type: '*/*', limit: '10mb' }));

const HOSTINGER_API_URL = 'https://trosidex.com/dashboard/api/attendance/device-punches';
const SYNC_SECRET = process.env.SYNC_SECRET || '19f242ec78fcbf655e5f5f9474a3b4354c9a68100bea4d2bd586c05a248234e8';

// Browser testing ya GET pings ke liye seedha OK return karega
app.get('/iclock/cdata', (req, res) => {
    return res.send('OK');
});

// eSSL machine ke POST data ke liye
app.post('/iclock/cdata', async (req, res) => {
    try {
        console.log('--- POST REQUEST FROM eSSL MACHINE ---');
        console.log('Query:', req.query);
        console.log('Body:', req.body);

        if (!req.body || typeof req.body !== 'string' || req.body.trim() === '') {
            return res.send('OK');
        }

        const punches = parseEsslPunches(req.body); 
        console.log('Parsed Punches:', punches);

        if (punches.length > 0) {
            await axios.post(HOSTINGER_API_URL, {
                punches: punches
            }, {
                headers: {
                    'X-Attendance-Sync-Secret': SYNC_SECRET,
                    'Content-Type': 'application/json'
                }
            });
            console.log('Punches successfully forwarded to Hostinger!');
        }

        res.send('OK');
    } catch (error) {
        console.error('Error forwarding punches:', error.message);
        if (error.response) {
            console.error('Hostinger Response Error Data:', error.response.data);
        }
        res.send('OK'); 
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
