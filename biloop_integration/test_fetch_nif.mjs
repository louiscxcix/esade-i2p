import { getAuthToken } from './lib/biloop.mjs';

const BILOOP_BASE_URL = 'https://angulargroup.biloop.es/api-global/v1';
const SUBSCRIPTION_KEY = '5a228f4cc12b48d689255deff633da4c';

async function testFetch() {
    const token = await getAuthToken();
    const clientName = "MC Headhunting";
    const nameQuery = clientName.toLowerCase().trim();
    
    try {
        const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
            method: 'GET',
            headers: { token, SUBSCRIPTION_KEY }
        });
        console.log("Status:", res.status);
        if (!res.ok) {
            console.log("NOT OK:", await res.text());
        }
        const data = await res.json();
        const matchingClient = data.data.find(c => {
            const dbName = (c.name || '').toLowerCase();
            const dbTrade = (c.trade_name || '').toLowerCase();
            return dbName.includes(nameQuery) || dbTrade.includes(nameQuery) || nameQuery.includes(dbName);
        });
        console.log("Found:", matchingClient);
    } catch (e) {
        console.error("Error:", e);
    }
}
testFetch();
