const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

const HOSTINGER_API_URL = 'https://trosidex.com/dashboard/api/attendance/device-punches';
const SYNC_SECRET = process.env.SYNC_SECRET || '19f242ec78fcbf655e5f5f9474a3b4354c9a68100bea4d2bd586c05a248234e8';

app.get('/iclock/cdata', (req, res) => {
    return res.send('OK');
});

app.all('/iclock/cdata', async (req, res) => {
    try {
        // Agar body empty hai ya khali object hai, toh Hostinger mat bhejo, seedha OK do
        if (!req.body || 
            (typeof req.body === 'object' && Object.keys(req.body).length === 0) || 
            (typeof req.body === 'string' && req.body.trim() === '')) {
            return res.send('OK');
        }

        let rawData = req.body;
        if (typeof rawData === 'object') {
            rawData = JSON.stringify(rawData);
        }

        const punches = parseEsslPunches(rawData); 

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

        return res.send('OK');
    } catch (error) {
        console.error('Error forwarding punches:', error.message);
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
