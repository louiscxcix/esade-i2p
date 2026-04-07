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
  const cleanD = String(d).trim();
  const parts = cleanD.split(/[\/\.]/); // Support both / and .
  if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const year = parts[2];
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return cleanD;
}

/** Fetch client NIF dynamically from Biloop */
async function getClientNif(clientName, token) {
  if (!clientName) return null;
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const nameQuery = normalize(clientName);
  
  if (!nameQuery) return null;

  try {
    const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
      method: 'GET',
      headers: { token, SUBSCRIPTION_KEY }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data) return null;
    
    // Strict match after punctuation normalization (MC Recruiting. === MC Recruiting)
    const matchingClient = data.data.find(c => {
      const dbName = normalize(c.name);
      const dbTrade = normalize(c.trade_name);
      return dbName === nameQuery || dbTrade === nameQuery;
    });
    
    return matchingClient ? matchingClient.nif : null;
  } catch (e) {
    console.error("Error fetching NIF:", e);
    return null;
  }
}

/** Push an invoice JSON to Biloop and optionally download PDF */
export async function pushInvoiceToBiloop(invoiceJson, downloadPdf = false) {
  const token = await getAuthToken();

  let clientName = invoiceJson.Cliente || invoiceJson['Client Name'] || 'Unknown Client';
  // Strip prefixes like "20260408-171 " or "171 "
  clientName = clientName.replace(/^(\d{8}-\d{1,4}|\d{1,4})\s+/, '').trim();

  const resolvedNif = await getClientNif(clientName, token);

  // Core Financials and Identifiers
  const a3Ref = invoiceJson['ID Factura Dinámica'] || invoiceJson['Invoice ID'] || `REQ-${Date.now()}`;
  const baseAmt = parseFloat(invoiceJson['Importe factura'] || invoiceJson['Net Invoice Amount'] || invoiceJson['Invoice Amount'] || 0);
  const vatAmt = parseFloat(invoiceJson['IVA'] || invoiceJson['IVA / VAT'] || 0);
  const totalAmt = parseFloat(invoiceJson['Importe Cobro'] || invoiceJson['Gross Invoice Amount'] || 0);
  const dateStr = formatBiloopDate(invoiceJson['Fecha Factura'] || invoiceJson['Invoice Date']);
  const dueDateStr = formatBiloopDate(invoiceJson['Due Date'] || invoiceJson['Due Date.1']);

  // Construct comprehensive details from the spreadsheet for the Invoice/Product body
  const position = invoiceJson['Position'] || invoiceJson['Proceso'] || '';
  const candidate = invoiceJson['Candidate Name'] || '';
  const startDate = invoiceJson['Start Date'] || '';
  const fixSalary = invoiceJson['Fix Salary'] || '';
  const varSalary = invoiceJson['Variable Salary'] || '';
  const equity = invoiceJson['Equity %'] || '';
  const recruiter = invoiceJson['Recruiter Name'] || '';
  const feePct = invoiceJson['Fee %'] || '';
  const discountPct = parseFloat(invoiceJson['Descuento (%)'] || invoiceJson['Discount %'] || 0);

  // Build a robust description combining all operational tags to ensure no data is lost
  let detailedDescription = `Services rendered for: ${position}`;
  if (candidate) detailedDescription += `\nCandidate: ${candidate}`;
  if (startDate) detailedDescription += `\nStart Date: ${startDate}`;
  
  let compensation = [];
  if (fixSalary) compensation.push(`Fix: ${fixSalary}`);
  if (varSalary) compensation.push(`Var: ${varSalary}`);
  if (equity) compensation.push(`Equity: ${equity}`);
  if (compensation.length > 0) detailedDescription += `\nCompensation: ${compensation.join(' | ')}`;
  
  if (recruiter) detailedDescription += `\nRecruiter: ${recruiter}`;
  if (feePct) detailedDescription += `\nAgreed Fee: ${feePct}`;

  const payload = {
    company_id: "E67652",
    master_name: clientName,
    address: "Biloop Integration Address",
    date: dateStr,
    operation_date: dateStr,
    due_date: dueDateStr || dateStr,
    expiration_date: dueDateStr || dateStr, // Include both common Biloop schema expiration keys
    SERIE: invoiceJson.SERIE || "F",
    a3_reference: a3Ref,
    invoice_description: detailedDescription,
    
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
        product_name: `${position} ${candidate ? ' - ' + candidate : ''}`.trim() || 'General Services',
        description: detailedDescription,
        units: 1,
        price: baseAmt,
        discount: discountPct,
        vat_type_id: "ORD21"
      }
    ]
  };

  if (resolvedNif) {
    payload.master_nif = resolvedNif;
  }

  console.log("Biloop Payload to be sent:", JSON.stringify(payload, null, 2));

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
