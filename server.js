const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.text({ type: '*/*' }));
app.use(express.json());

const HOSTINGER_API_URL = 'https://trosidex.com/dashboard/api/attendance/device-punches';
const SYNC_SECRET = process.env.SYNC_SECRET || '19f242ec78fcbf655e5f5f9474a3b4354c9a68100bea4d2bd586c05a248234e8';

// Browser testing ke liye GET route
app.get('/iclock/cdata', (req, res) => {
    res.send('OK');
});

// eSSL machine ke liye POST/ALL route
app.all('/iclock/cdata', async (req, res) => {
    try {
        console.log('Received data query:', req.query);
        console.log('Received data body:', req.body);

        const punches = parseEsslPunches(req.body); 

        if (punches.length > 0) {
            await axios.post(HOSTINGER_API_URL, {
                punches: punches
            }, {
                headers: {
                    'Authorization': `Bearer ${SYNC_SECRET}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('Punches successfully forwarded to Hostinger!');
        }

        res.send('OK');
    } catch (error) {
        console.error('Error forwarding punches:', error.message);
        res.send('OK'); // Machine ko hamesha OK bhejna chahiye taaki wo error loop mein na jaye
    }
});

function parseEsslPunches(rawBody) {
    const punches = [];
    if (!rawBody) return punches;

    const lines = rawBody.toString().split('\n');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`eSSL ADMS Bridge running on port ${PORT}`);
});
