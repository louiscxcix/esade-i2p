import { getAuthToken } from './lib/biloop.mjs';

const BILOOP_BASE_URL = 'https://angulargroup.biloop.es/api-global/v1';
const SUBSCRIPTION_KEY = '5a228f4cc12b48d689255deff633da4c';

async function testFetch() {
    const token = await getAuthToken();
    const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
        headers: { token, SUBSCRIPTION_KEY }
    });
    const data = await res.json();
    console.log(JSON.stringify(data).substring(0, 200));
}
testFetch();
