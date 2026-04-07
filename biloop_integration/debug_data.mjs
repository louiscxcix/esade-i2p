import fs from 'fs';
import { google } from 'googleapis';

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
envLines.forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    let val = rest.join('=');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

const SHEET_ID = '15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk';
const WORKSHEET_NAME = 'Datos en bruto';

function getSheetsClient() {
  const privateKey = (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: privateKey,
      project_id: process.env.GCP_PROJECT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function debug() {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${WORKSHEET_NAME}!A4:AJ`,
    });
    const rows = response.data.values || [];
    
    if (rows.length > 0) {
      const headers = rows[0].map(h => String(h).trim());
      const findIdx = (keywords) => headers.findIndex(h => {
        const lowerH = (h || '').toLowerCase().trim();
        return keywords.every(k => lowerH.includes(k.toLowerCase()));
      });
      const idIdx = findIdx(['c175']) !== -1 ? findIdx(['c175']) : findIdx(['id', 'factura']);
      const clientIdx = findIdx(['cliente']);
      const candIdx = findIdx(['candidato']);
      
      console.log('Skipped rows:');
      for (let i = 1; i < rows.length; i++) {
         const idVal = rows[i][idIdx];
         if (!idVal || String(idVal).trim() === '') {
             const client = rows[i][clientIdx] || '';
             const cand = rows[i][candIdx] || '';
             if (client.trim() !== '' || cand.trim() !== '') {
                console.log(`Row ${i + 4}: Client=${client}, Candidate=${cand}`);
             }
         }
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

debug();
