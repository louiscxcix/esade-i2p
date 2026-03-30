import { getAuthToken } from './lib/biloop.mjs';

const BILOOP_BASE_URL = 'https://angulargroup.biloop.es/api-global/v1';
const SUBSCRIPTION_KEY = '64ae70d3-026a-4969-8123-c4aa6cf4f1e1';

async function testFetch() {
    const token = await getAuthToken();
    const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
        headers: { token, 'SUBSCRIPTION_KEY': SUBSCRIPTION_KEY }
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log(JSON.stringify(data).substring(0, 200));
    
    if (data.data) {
        const clientName = "MC Headhunting";
        const nameQuery = clientName.toLowerCase().trim();
        const matchingClient = data.data.find(c => {
            const dbName = (c.name || '').toLowerCase();
            const dbTrade = (c.trade_name || '').toLowerCase();
            return dbName.includes(nameQuery) || dbTrade.includes(nameQuery) || nameQuery.includes(dbName);
        });
        console.log("MATCH:", matchingClient);
    }
}
testFetch();
