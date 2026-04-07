import { pushInvoiceToBiloop } from './lib/biloop.mjs';
import fs from 'fs';

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
envLines.forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    let val = rest.join('=');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

async function test() {
  const userData = {
    'ID Factura Dinámica': `REQ-NEW-${Date.now()}`,
    'Cliente': 'Dummy Corp ' + Date.now(),
    'Fecha Factura': '08/04/2026',
    'Importe factura': 10.0,
    'IVA': 2.1,
    'Importe Cobro': 12.1
  };
  try {
    const res = await pushInvoiceToBiloop(userData, false);
    console.log(res);
  } catch(e) {
    console.error(e);
  }
}
test();
