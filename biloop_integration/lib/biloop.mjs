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

/** Format DD/MM/YYYY to YYYY-MM-DD */
function formatBiloopDate(d) {
  if (!d) return '2026-01-01'; // Default fallback
  const parts = d.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return d;
}

/** Push an invoice JSON to Biloop and optionally download PDF */
export async function pushInvoiceToBiloop(invoiceJson, downloadPdf = false) {
  const token = await getAuthToken();

  // Convert flat invoice format to Biloop OpenAPI schema
  const a3Ref = invoiceJson['ID Factura Dinámica'] || `REQ-${Date.now()}`;
  const baseAmt = parseFloat(invoiceJson['Importe factura'] || 0);
  const vatAmt = parseFloat(invoiceJson['IVA'] || 0);
  const totalAmt = parseFloat(invoiceJson['Importe Cobro'] || 0);
  const dateStr = formatBiloopDate(invoiceJson['Fecha Factura']);

  const payload = {
    company_id: "E67652",
    master_name: invoiceJson.Cliente || 'Unknown Client',
    master_nif: "B12345678", // Needs actual NIF mapping when ready
    address: "Biloop Integration Address",
    date: dateStr,
    operation_date: dateStr,
    issuance_date: dateStr,
    SERIE: "F",
    a3_reference: a3Ref,
    invoice_description: invoiceJson.Proceso || 'Services rendered',
    
    // Financials
    base: baseAmt,
    ordinary_vat_base: baseAmt,
    ordinary_vat_total: vatAmt,
    vat_total: vatAmt,
    total: totalAmt,
    
    // Lines
    ERP_line: [
      {
        company_id: "E67652",
        product_id: 1,
        real_product_id: "1",
        product_name: invoiceJson.Proceso || 'General Services',
        units: 1,
        price: baseAmt,
        discount: parseFloat(invoiceJson['Descuento (%)'] || 0),
        vat_type_id: "ORD21"
      }
    ]
  };

  const headers = {
    token: token,
    SUBSCRIPTION_KEY: SUBSCRIPTION_KEY,
    'Content-Type': 'application/json',
  };

  // STEP 1: POST the Invoice
  const postRes = await fetch(`${BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify([payload]),
  });

  const result = await postRes.json();
  if (postRes.status !== 200 && postRes.status !== 201 || result.status === 'KO') {
    return { success: false, message: result.message || 'Biloop rejected the invoice.' };
  }

  // If we don't need PDF, return early
  if (!downloadPdf) {
    return { success: true, message: 'Uploaded successfully to Biloop.' };
  }

  // STEP 2: Wait & GET Invoice ID
  // Biloop usually requires a few seconds to process
  await new Promise(r => setTimeout(r, 3000));

  const getRes = await fetch(`${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=E67652&a3_reference=${encodeURIComponent(a3Ref)}`, {
    method: 'GET',
    headers,
  });

  const getResult = await getRes.json();
  if (!getResult || !getResult.data || getResult.data.length === 0) {
    return { success: true, message: 'Uploaded successfully, but could not immediately retrieve document ID for PDF.' };
  }

  const docId = getResult.data[0].id || getResult.data[0].document_id;
  if (!docId) {
    return { success: true, message: 'Uploaded successfully. Invoice missing document_id for PDF fetching.' };
  }

  // STEP 3: GET the Pending Binary (PDF)
  const pdfParams = new URLSearchParams({
    document_id: docId,
    document_type: "FV",
    company_id: "E67652"
  });

  const pdfRes = await fetch(`${BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary?${pdfParams}`, {
    method: 'GET',
    headers,
  });

  if (!pdfRes.ok) {
    return { success: true, message: 'Uploaded successfully. Failed to download PDF from server.' };
  }

  const arrayBuffer = await pdfRes.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString('base64');

  return { 
    success: true, 
    message: 'Invoice created and PDF retrieved successfully.',
    pdfBase64: base64Data,
    fileName: `Factura_${payload.master_name.replace(/\\s+/g, '_')}_${a3Ref}.pdf`
  };
}
