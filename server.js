const express = require('express');
const axios = require('axios');
const app = express();

// eSSL machine ka raw text/data catch karne ke liye
app.use(express.text({ type: '*/*' }));
app.use(express.json());

// Hostinger par jo aapne API route banaya hai uska URL
const HOSTINGER_API_URL = 'https://trosidex.com/dashboard/api/attendance/device-punches';

// Aapki .env wali secret key
const SYNC_SECRET = process.env.SYNC_SECRET || '19f242ec78fcbf655e5f5f9474a3b4354c9a68100bea4d2bd586c05a248234e8';

// eSSL machine jab ADMS mode par data push karegi (/iclock/cdata)
app.all('/iclock/cdata', async (req, res) => {
    try {
        console.log('Received data from eSSL machine query:', req.query);
        console.log('Received data body:', req.body);

        // eSSL ke raw text data ko parse karke punches array banana
        const punches = parseEsslPunches(req.body); 

        if (punches.length > 0) {
            // Hostinger Laravel API ko data forward karein
            await axios.post(HOSTINGER_API_URL, {
                punches: punches
            }, {
                headers: {
                    'Authorization': `Bearer ${SYNC_SECRET}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('Punches successfully forwarded to Hostinger database!');
        }

        // eSSL machine ko 'OK' response dena zaroori hai taaki wo maane ki data sync ho gaya
        res.send('OK');
    } catch (error) {
        console.error('Error forwarding punches to Hostinger:', error.message);
        res.status(500).send('ERROR');
    }
});

// eSSL data parsing function
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