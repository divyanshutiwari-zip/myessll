const express = require('express');
const axios = require('axios');
const app = express();

// eSSL machine ke raw text data ko capture karne ke liye
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const HOSTINGER_API_URL = 'https://trosidex.com/dashboard/api/attendance/device-punches';
const SYNC_SECRET = process.env.SYNC_SECRET || '19f242ec78fcbf655e5f5f9474a3b4354c9a68100bea4d2bd586c05a248234e8';

app.get('/iclock/cdata', (req, res) => {
    res.send('OK');
});

app.all('/iclock/cdata', async (req, res) => {
    try {
        console.log('--- NEW REQUEST FROM MACHINE ---');
        console.log('Query:', req.query);
        console.log('Body type:', typeof req.body);
        console.log('Body content:', req.body);

        // Agar body ek object hai aur keys nahi hain, toh usko string me convert karein
        let rawData = req.body;
        if (typeof rawData === 'object' && rawData !== null) {
            rawData = JSON.stringify(rawData);
        }

        const punches = parseEsslPunches(rawData); 
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
        } else {
            console.log('No punches found in this request payload.');
        }

        res.send('OK');
    } catch (error) {
        console.error('Error forwarding punches:', error.message);
        if (error.response) {
            console.error('Hostinger Response Error Data:', error.response.data);
            console.error('Hostinger Response Status:', error.response.status);
        }
        res.send('OK'); // Machine loop me na jaye isliye OK return karna zaroori hai
    }
});

function parseEsslPunches(rawBody) {
    const punches = [];
    if (!rawBody || typeof rawBody !== 'string') return punches;

    const lines = rawBody.split('\n');
    for (let line of lines) {
        const parts = line.trim().split(/\s+/);
        // eSSL standard format: UserID Timestamp Status ...
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
