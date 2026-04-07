import fs from 'fs';
import { getAuthToken } from './lib/biloop.mjs';

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
envLines.forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    let val = rest.join('=');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

const BILOOP_BASE_URL = 'https://angulargroup.biloop.es/api-global/v1';
const SUBSCRIPTION_KEY = '64ae70d3-026a-4969-8123-c4aa6cf4f1e1';

async function listMC() {
  const token = await getAuthToken();
  try {
    const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
      method: 'GET',
      headers: { token, SUBSCRIPTION_KEY }
    });
    const data = await res.json();
    const mc = data.data.filter(c => (c.name || '').toLowerCase().includes('mc') || (c.trade_name || '').toLowerCase().includes('mc'));
    console.log('Customers with "MC" in name:', JSON.stringify(mc, null, 2));
  } catch (e) {
    console.error(e);
  }
}

listMC();
