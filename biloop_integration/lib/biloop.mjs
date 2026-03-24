const BILOOP_BASE_URL = 'https://angulargroup.biloop.es/api-global/v1';
const SUBSCRIPTION_KEY = '64ae70d3-026a-4969-8123-c4aa6cf4f1e1';
const USER_ID = '46144651G';
const PASSWORD = 'Q0JXVxfuNY';

let cachedToken = null;

/** Fetch a Bearer token from Biloop */
export async function getAuthToken() {
  if (cachedToken) return cachedToken;

  const response = await fetch(`${BILOOP_BASE_URL}/token`, {
    method: 'GET',
    headers: {
      user: USER_ID,
      password: PASSWORD,
      SUBSCRIPTION_KEY: SUBSCRIPTION_KEY,
    },
  });

  const data = await response.json();

  if (data.status === 'OK' && data.data?.token) {
    cachedToken = data.data.token;
    return cachedToken;
  }

  throw new Error(`Biloop auth failed: ${data.message || 'Unknown error'}`);
}

/** Push an invoice JSON to Biloop */
export async function pushInvoiceToBiloop(invoiceJson) {
  const token = await getAuthToken();

  // Strip internal fields (keys starting with _)
  const payload = {};
  for (const [key, val] of Object.entries(invoiceJson)) {
    if (!key.startsWith('_')) payload[key] = val;
  }

  const response = await fetch(`${BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices`, {
    method: 'POST',
    headers: {
      token: token,
      SUBSCRIPTION_KEY: SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (result.status === 'KO') {
    return { success: false, message: result.message || 'Biloop rejected the invoice.' };
  }

  return { success: true, message: 'Uploaded successfully to Biloop.' };
}
