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

/**
 * Derive a stable, internal invoice ID used as the a3_reference in Biloop.
 *
 * The hash is built from ALL key data fields — not just the static row ID.
 * This means:
 *   - Same data → same ID → Biloop deduplicates (no double-posting).
 *   - Changed data (date, amount, client, etc.) → new ID → Biloop creates a
 *     fresh invoice, so PDF always reflects the latest saved values.
 *
 * Format: BLOOP-<base36-hash> (max ~14 chars, safe for Biloop a3_reference).
 */
function deriveStableInvoiceId(invoiceJson) {
  // Include every field that defines the "version" of this invoice.
  // Changing any one of these after a Save will produce a different hash.
  const rowId    = (invoiceJson['ID Factura Dinámica'] || invoiceJson['Invoice ID'] || '').trim();
  const client   = (invoiceJson['Cliente'] || invoiceJson['Client Name'] || '').trim().toUpperCase();
  const date     = (invoiceJson['Fecha Factura'] || invoiceJson['Invoice Date'] || '').trim();
  const amount   = String(parseFloat(invoiceJson['Importe factura'] || invoiceJson['Invoice Amount'] || 0));
  const candidate = (invoiceJson['Candidato'] || invoiceJson['Candidate Name'] || '').trim().toUpperCase();

  // Compound key: rowId pins it to the sheet row; the rest capture the saved state.
  const base = `${rowId}|${client}|${date}|${amount}|${candidate}`;

  // djb2 hash → base36 so it stays short & URL-safe
  let hash = 5381;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) + hash) + base.charCodeAt(i);
    hash = hash & 0x7fffffff; // keep positive 31-bit
  }
  const id = `BLOOP-${hash.toString(36).toUpperCase()}`;
  console.log(`[Biloop] Stable a3_reference: ${id}  (base: "${base}")`);
  return id;
}


/** Fetch client details (NIF + address + canonical name) from Biloop */
async function getClientInfo(clientName, token) {
  if (!clientName) return {};
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const nameQuery = normalize(clientName);

  if (!nameQuery) return {};

  try {
    const res = await fetch(`${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652`, {
      method: 'GET',
      headers: { token, SUBSCRIPTION_KEY }
    });
    if (!res.ok) return {};
    const data = await res.json();
    if (!data.data || data.data.length === 0) return {};

    const customers = data.data;

    // 1. Strict exact match (normalized)
    let match = customers.find(c => {
      const dbName  = normalize(c.name);
      const dbTrade = normalize(c.trade_name);
      return dbName === nameQuery || dbTrade === nameQuery;
    });

    // 2. Partial / contains match (e.g. "MC Recruiting" ↔ "MC Recruiting S.L.")
    if (!match) {
      match = customers.find(c => {
        const dbName  = normalize(c.name);
        const dbTrade = normalize(c.trade_name);
        return dbName.includes(nameQuery) || dbTrade.includes(nameQuery)
            || nameQuery.includes(dbName)  || nameQuery.includes(dbTrade);
      });
    }

    if (!match) {
      // Log available names so we can debug mismatches
      const available = customers.slice(0, 30).map(c => `"${c.name}" / "${c.trade_name}"`).join(', ');
      console.warn(`[Biloop] No customer match for "${clientName}" (normalized: "${nameQuery}"). Available: ${available}`);
      return {};
    }

    console.log(`[Biloop] Matched customer: "${match.name}" / trade: "${match.trade_name}" / NIF: "${match.nif}"`);

    // Build address string from available fields
    const addressParts = [
      match.address,
      match.city,
      match.province,
      match.postal_code,
      match.country,
    ].filter(Boolean);

    return {
      nif:           match.nif || null,
      canonicalName: match.trade_name || match.name || clientName,
      address:       addressParts.length > 0 ? addressParts.join(', ') : null,
    };
  } catch (e) {
    console.error('[Biloop] Error fetching client info:', e);
    return {};
  }
}


/**
 * Check whether an invoice with this a3_reference already exists in Biloop.
 * Returns the first matching document object, or null.
 */
async function findExistingInvoice(a3Ref, token) {
  try {
    const res = await fetch(
      `${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=E67652&a3_reference=${encodeURIComponent(a3Ref)}`,
      { method: 'GET', headers: { token, SUBSCRIPTION_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.data && data.data.length > 0) return data.data[0];
  } catch (e) {
    console.error('Error checking existing invoice:', e);
  }
  return null;
}

/** Push an invoice JSON to Biloop and optionally download PDF */
export async function pushInvoiceToBiloop(invoiceJson, downloadPdf = false) {
  const token = await getAuthToken();

  // ── 1. Resolve client name ────────────────────────────────────────────────
  let clientName = invoiceJson.Cliente || invoiceJson['Client Name'] || 'Unknown Client';
  // Strip numeric prefixes like "20260408-171 " or "171 "
  clientName = clientName.replace(/^(\d{8}-\d{1,4}|\d{1,4})\s+/, '').trim();

  // ── 2. Fetch full client info from Biloop (NIF + address + canonical name) ─
  const clientInfo = await getClientInfo(clientName, token);

  const resolvedNif     = clientInfo.nif    || null;   // null = let Biloop auto-assign / create new customer
  const resolvedAddress = clientInfo.address || null;
  // If Biloop has a registered canonical name, use it. Otherwise use the name from the spreadsheet.
  const resolvedName    = clientInfo.canonicalName || clientName;

  // ── 3. Build a STABLE internal reference — same invoice = same ref ─────────
  const a3Ref = deriveStableInvoiceId(invoiceJson);


  // ── 4. Check if already exists in Biloop (idempotency) ───────────────────
  const existing = await findExistingInvoice(a3Ref, token);
  let docId = null;

  if (existing) {
    console.log(`[Biloop] Invoice ${a3Ref} already exists — skipping POST, re-using existing.`);
    docId = existing.id || existing.document_id;
  }

  // ── 5. Core financials ────────────────────────────────────────────────────
  const baseAmt   = parseFloat(invoiceJson['Importe factura'] || invoiceJson['Net Invoice Amount'] || invoiceJson['Invoice Amount'] || 0);
  const vatAmt    = parseFloat(invoiceJson['IVA'] || invoiceJson['IVA / VAT'] || 0);
  const totalAmt  = parseFloat(invoiceJson['Importe Cobro'] || invoiceJson['Gross Invoice Amount'] || 0);
  const dateStr   = formatBiloopDate(invoiceJson['Fecha Factura'] || invoiceJson['Invoice Date']);
  const dueDateStr = formatBiloopDate(invoiceJson['Due Date'] || invoiceJson['Due Date.1']);

  // ── 6. Build description ─────────────────────────────────────────────────
  const position    = invoiceJson['Position'] || invoiceJson['Proceso'] || '';
  const candidate   = invoiceJson['Candidate Name'] || '';
  const startDate   = invoiceJson['Start Date'] || '';
  const fixSalary   = invoiceJson['Fix Salary'] || '';
  const varSalary   = invoiceJson['Variable Salary'] || '';
  const equity      = invoiceJson['Equity %'] || '';
  const recruiter   = invoiceJson['Recruiter Name'] || '';
  const feePct      = invoiceJson['Fee %'] || '';
  const discountPct = parseFloat(invoiceJson['Descuento (%)'] || invoiceJson['Discount %'] || 0);

  let detailedDescription = `Services rendered for: ${position}`;
  if (candidate)  detailedDescription += `\nCandidate: ${candidate}`;
  if (startDate)  detailedDescription += `\nStart Date: ${startDate}`;

  let compensation = [];
  if (fixSalary) compensation.push(`Fix: ${fixSalary}`);
  if (varSalary) compensation.push(`Var: ${varSalary}`);
  if (equity)    compensation.push(`Equity: ${equity}`);
  if (compensation.length > 0) detailedDescription += `\nCompensation: ${compensation.join(' | ')}`;

  if (recruiter) detailedDescription += `\nRecruiter: ${recruiter}`;
  if (feePct)    detailedDescription += `\nAgreed Fee: ${feePct}`;

  // ── 7. POST to Biloop only if not already present ────────────────────────
  if (!existing) {
    const payload = {
      company_id:          "E67652",
      master_name:         resolvedName,
      date:                dateStr,
      operation_date:      dateStr,
      issuance_date:       dateStr,
      due_date:            dueDateStr || dateStr,
      expiration_date:     dueDateStr || dateStr,
      SERIE:               invoiceJson.SERIE || "F",
      a3_reference:        a3Ref,
      invoice_description: detailedDescription,
      base:               baseAmt,
      ordinary_vat_base:  baseAmt,
      ordinary_vat_total: vatAmt,
      vat_total:          vatAmt,
      total:              totalAmt,
      ERP_line: [
        {
          company_id:      "E67652",
          product_id:      1,
          real_product_id: "1",
          product_name:    `${position}${candidate ? ' - ' + candidate : ''}`.trim() || 'General Services',
          description:     detailedDescription,
          units:           1,
          price:           baseAmt,
          discount:        discountPct,
          vat_type_id:     "ORD21"
        }
      ]
    };

    // Only set NIF when we actually resolved one from Biloop — never send a fake NIF
    if (resolvedNif) payload.master_nif = resolvedNif;
    // Only set address when Biloop returned one
    if (resolvedAddress) payload.address = resolvedAddress;

    console.log("FINAL BILOOP PAYLOAD:", JSON.stringify(payload, null, 2));

    const headers = {
      token: token,
      SUBSCRIPTION_KEY: SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
    };

    const postRes = await fetch(`${BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices`, {
      method: 'POST',
      headers,
      body: JSON.stringify([payload]),
    });

    const result = await postRes.json();
    if ((postRes.status !== 200 && postRes.status !== 201) || result.status === 'KO') {
      return { success: false, message: result.message || 'Biloop rejected the invoice.' };
    }
  }

  // If we don't need PDF, return early
  if (!downloadPdf) {
    return {
      success: true,
      message: existing
        ? 'Invoice already in Biloop — no duplicate created.'
        : 'Uploaded successfully to Biloop.'
    };
  }

  // ── 8. Fetch invoice document ID (wait if just created) ──────────────────
  const headers = {
    token: token,
    SUBSCRIPTION_KEY: SUBSCRIPTION_KEY,
  };

  if (!docId) {
    // Give Biloop a moment to process the newly posted invoice
    await new Promise(r => setTimeout(r, 3000));

    const getRes = await fetch(
      `${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=E67652&a3_reference=${encodeURIComponent(a3Ref)}`,
      { method: 'GET', headers }
    );
    const getResult = await getRes.json();
    if (!getResult || !getResult.data || getResult.data.length === 0) {
      return { success: true, message: 'Uploaded successfully, but could not immediately retrieve document ID for PDF.' };
    }
    docId = getResult.data[0].id || getResult.data[0].document_id;
  }

  if (!docId) {
    return { success: true, message: 'Uploaded successfully. Invoice missing document_id for PDF fetching.' };
  }

  // ── 9. Fetch PDF binary ───────────────────────────────────────────────────
  const pdfParams = new URLSearchParams({
    document_id:   docId,
    document_type: "FV",
    company_id:    "E67652"
  });

  const pdfRes = await fetch(
    `${BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary?${pdfParams}`,
    { method: 'GET', headers }
  );

  if (!pdfRes.ok) {
    return { success: true, message: 'Uploaded successfully. Failed to download PDF from server.' };
  }

  const arrayBuffer = await pdfRes.arrayBuffer();
  const base64Data  = Buffer.from(arrayBuffer).toString('base64');

  return {
    success:    true,
    message:    existing
      ? 'Existing invoice found — PDF retrieved without creating a duplicate.'
      : 'Invoice created and PDF retrieved successfully.',
    pdfBase64:  base64Data,
    fileName:   `Factura_${resolvedName.replace(/\s+/g, '_')}_${a3Ref}.pdf`
  };
}
