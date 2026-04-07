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

async function checkNif() {
  const token = await getAuthToken();
  const clientName = 'MC Recruiting.';
  const nameQuery = clientName.toLowerCase().trim();
  
  console.log(`Searching for NIF of "${clientName}"...`);
  try {
    const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
      method: 'GET',
      headers: { token, SUBSCRIPTION_KEY }
    });
    const data = await res.json();
    console.log('Total customers found:', data.data?.length);
    
    const matches = data.data.filter(c => {
      const dbName = (c.name || '').toLowerCase();
      const dbTrade = (c.trade_name || '').toLowerCase();
      return dbName.includes(nameQuery) || dbTrade.includes(nameQuery) || nameQuery.includes(dbName);
    });
    
    console.log('Matches:', JSON.stringify(matches, null, 2));
  } catch (e) {
    console.error(e);
  }
}

checkNif();
