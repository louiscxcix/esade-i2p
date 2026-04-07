import fs from 'fs';
import { pushInvoiceToBiloop } from './lib/biloop.mjs';

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
envLines.forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    let val = rest.join('=');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

async function testUpload() {
  const userData = {
    'ID Factura Dinámica': `20260408-166`,
    'Cliente': 'MC Recruiting.',
    'Candidato': 'Louis Kim',
    'Proceso': 'Product Manager',
    'Fecha Factura': '04/08/2026',
    'Importe factura': 10.0,
    'IVA': 2.1,
    'Importe Cobro': 12.1
  };

  try {
    console.log('Pushing User Data to Biloop...');
    const result = await pushInvoiceToBiloop(userData, false);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('CRITICAL ERROR:', e);
  }
}

testUpload();
