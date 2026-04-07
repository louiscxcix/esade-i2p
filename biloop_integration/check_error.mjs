import fs from 'fs';
import { fetchInvoiceData } from './lib/sheets.mjs';

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
envLines.forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    let val = rest.join('=');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

async function run() {
  try {
    const data = await fetchInvoiceData();
    console.log('Success! Count:', data.length);
  } catch (e) {
    console.error('FETCH ERROR:', e);
  }
}

run();
