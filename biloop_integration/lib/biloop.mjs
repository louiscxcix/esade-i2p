import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BILOOP_BASE_URL = 'https://angulargroup.biloop.es/api-global/v1';
const SUBSCRIPTION_KEY = '64ae70d3-026a-4969-8123-c4aa6cf4f1e1';
const USER_ID = '46144651G';
const PASSWORD = 'Q0JXVxfuNY';
const COMPANY_ID = 'E67652';

let cachedToken = null;

// ─── Local customer list (fallback / fast lookup) ────────────────────────────
let _localCustomers = null;
function getLocalCustomers() {
  if (_localCustomers) return _localCustomers;
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(__dirname, '../all_customers.json'), 'utf8');
    _localCustomers = JSON.parse(raw);
  } catch {
    _localCustomers = [];
  }
  return _localCustomers;
}

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

/** Normalise a company string for fuzzy matching */
const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    // remove common legal suffixes so "MC Recruiting" matches "MC Recruiting S.L."
    .replace(/\b(s\.?l\.?u?\.?p?|s\.?a\.?u?\.?|s\.?a\.?|s\.?l\.?p\.?|s\.?l\.?|sl|sa|slp|slu|slpu|sociedad\s+limitada|sociedad\s+an[oó]nima)\b\.?/gi, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Format DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD */
function formatBiloopDate(d) {
  if (!d) return '2026-01-01';
  const cleanD = String(d).trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanD)) return cleanD;
  const parts = cleanD.split(/[\/\.]/);
  if (parts.length === 3) {
    const day   = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year  = parts[2];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return cleanD;
}

/**
 * Derive a stable internal invoice ID.
 * Different data (e.g. changed date) → different ID → Biloop creates a new invoice.
 */
function deriveStableInvoiceId(invoiceJson) {
  const rowId     = (invoiceJson['ID Factura Dinámica'] || invoiceJson['Invoice ID'] || '').trim();
  const client    = (invoiceJson['Cliente'] || invoiceJson['Client Name'] || '').trim().toUpperCase();
  const date      = (invoiceJson['Fecha Factura'] || invoiceJson['Invoice Date'] || '').trim();
  const amount    = String(parseFloat(invoiceJson['Importe factura'] || invoiceJson['Invoice Amount'] || 0));
  const candidate = (invoiceJson['Candidato'] || invoiceJson['Candidate Name'] || '').trim().toUpperCase();

  const base = `${rowId}|${client}|${date}|${amount}|${candidate}`;

  let hash = 5381;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) + hash) + base.charCodeAt(i);
    hash = hash & 0x7fffffff;
  }
  const id = `BLOOP-${hash.toString(36).toUpperCase()}`;
  console.log(`[Biloop] Stable a3_reference: ${id}  (base: "${base}")`);
  return id;
}

/**
 * Look up a customer by name.
 * Tries the live Biloop API first, then falls back to all_customers.json.
 * Returns { nif, canonicalName, address } or {}.
 */
async function getClientInfo(clientName, token) {
  if (!clientName) return {};
  const nameNorm = normalize(clientName);
  if (!nameNorm) return {};

  const scoreMatch = (dbName) => {
    const dbNorm = normalize(dbName);
    if (dbNorm === nameNorm) return 100;
    if (dbNorm.startsWith(nameNorm) || nameNorm.startsWith(dbNorm)) return 80;
    if (dbNorm.includes(nameNorm) || nameNorm.includes(dbNorm)) return 60;
    // word-level overlap
    const qWords = nameNorm.split(' ');
    const dWords = dbNorm.split(' ');
    const overlap = qWords.filter(w => w.length > 2 && dWords.includes(w)).length;
    if (overlap > 0) return overlap * 10;
    return 0;
  };

  const bestMatch = (customers, getName, getNif) => {
    let best = null, bestScore = 0;
    for (const c of customers) {
      const score = scoreMatch(getName(c));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (bestScore >= 60) {
      console.log(`[Biloop] Matched customer "${getName(best)}" (score ${bestScore}) for query "${clientName}"`);
      return best;
    }
    return null;
  };

  // ── 1. Try live Biloop API ────────────────────────────────────────────────
  try {
    const res = await fetch(
      `${BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=${COMPANY_ID}`,
      { method: 'GET', headers: { token, SUBSCRIPTION_KEY } }
    );
    if (res.ok) {
      const data = await res.json();
      const customers = data.data || [];
      if (customers.length > 0) {
        const match = bestMatch(
          customers,
          c => c.trade_name || c.name || '',
          c => c.nif
        );
        if (match) {
          const addressParts = [match.address, match.city, match.province, match.postal_code, match.country].filter(Boolean);
          return {
            nif:           match.nif || null,
            canonicalName: (match.trade_name || match.name || clientName).trim(),
            address:       addressParts.length > 0 ? addressParts.join(', ') : null,
          };
        }
        const available = customers.slice(0, 10).map(c => `"${c.trade_name || c.name}"`).join(', ');
        console.warn(`[Biloop] No live API match for "${clientName}". Sample: ${available}`);
      }
    }
  } catch (e) {
    console.error('[Biloop] Live API customer lookup failed:', e.message);
  }

  // ── 2. Fallback: all_customers.json ──────────────────────────────────────
  const local = getLocalCustomers();
  if (local.length > 0) {
    const match = bestMatch(local, c => c.name || '', c => c.nif);
    if (match) {
      return {
        nif:           match.nif || null,
        canonicalName: (match.name || clientName).trim(),
        address:       null,
      };
    }
    console.warn(`[Biloop] No local match for "${clientName}" either.`);
  }

  return {};
}

/**
 * Extract the most likely document_id from any Biloop response shape.
 * Biloop wraps responses differently depending on the endpoint.
 */
function extractDocumentId(data) {
  if (!data) return null;
  // Direct fields
  if (data.document_id) return data.document_id;
  if (data.id) return data.id;
  // Wrapped array: { data: [...] } or { PostIncomesInvoices: [...] } etc.
  const inner = data.data || data.PostIncomesInvoices || data.IncomeInvoices || [];
  if (Array.isArray(inner) && inner.length > 0) {
    return inner[0].document_id || inner[0].id || null;
  }
  // If data itself is an array
  if (Array.isArray(data) && data.length > 0) {
    return data[0].document_id || data[0].id || null;
  }
  return null;
}

/**
 * Check whether an invoice with this a3_reference already exists in Biloop.
 */
async function findExistingInvoice(a3Ref, token) {
  try {
    const res = await fetch(
      `${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=${COMPANY_ID}&a3_reference=${encodeURIComponent(a3Ref)}`,
      { method: 'GET', headers: { token, SUBSCRIPTION_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.data || data.IncomeInvoices || [];
    if (Array.isArray(items) && items.length > 0) return items[0];
    if (Array.isArray(data) && data.length > 0) return data[0];
  } catch (e) {
    console.error('[Biloop] Error checking existing invoice:', e.message);
  }
  return null;
}

/**
 * Fetch the PDF for a given document_id, retrying up to maxRetries times
 * with a delay between attempts (Biloop may need time to generate the PDF).
 */
async function fetchPdfWithRetry(docId, token, maxRetries = 5, delayMs = 3000) {
  const headers = { token, SUBSCRIPTION_KEY };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Biloop] PDF fetch attempt ${attempt}/${maxRetries} for document_id=${docId}`);

    const pdfParams = new URLSearchParams({
      document_id:   String(docId),
      document_type: 'FV',
      company_id:    COMPANY_ID,
    });

    const pdfRes = await fetch(
      `${BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary?${pdfParams}`,
      { method: 'GET', headers }
    );

    console.log(`[Biloop] PDF response: status=${pdfRes.status} content-type=${pdfRes.headers.get('content-type')}`);

    if (pdfRes.ok) {
      const contentType = pdfRes.headers.get('content-type') || '';
      if (contentType.includes('pdf') || contentType.includes('octet-stream') || contentType.includes('binary')) {
        const arrayBuffer = await pdfRes.arrayBuffer();
        if (arrayBuffer.byteLength > 100) {
          console.log(`[Biloop] Got PDF: ${arrayBuffer.byteLength} bytes`);
          return Buffer.from(arrayBuffer).toString('base64');
        }
        console.warn(`[Biloop] PDF response too small (${arrayBuffer.byteLength} bytes), retrying...`);
      } else {
        // Maybe returned JSON error
        const text = await pdfRes.text();
        console.warn(`[Biloop] PDF endpoint returned non-PDF content: ${text.slice(0, 200)}`);
      }
    } else {
      const errText = await pdfRes.text().catch(() => '');
      console.warn(`[Biloop] PDF fetch failed (${pdfRes.status}): ${errText.slice(0, 200)}`);
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return null;
}

/** Push an invoice JSON to Biloop and optionally download PDF */
export async function pushInvoiceToBiloop(invoiceJson, downloadPdf = false) {
  const token = await getAuthToken();

  // ── 1. Resolve client name ─────────────────────────────────────────────────
  let clientName = (invoiceJson.Cliente || invoiceJson['Client Name'] || 'Unknown Client').trim();
  // Strip numeric invoice-number prefixes like "20260408-171 " or "171 "
  clientName = clientName.replace(/^(\d{8}-\d{1,4}|\d{1,4})\s+/, '').trim();

  // ── 2. Fetch full client info ──────────────────────────────────────────────
  const clientInfo = await getClientInfo(clientName, token);
  const resolvedNif     = clientInfo.nif    || null;
  const resolvedAddress = clientInfo.address || null;
  const resolvedName    = clientInfo.canonicalName || clientName;

  console.log(`[Biloop] Client: "${clientName}" → resolved="${resolvedName}" NIF=${resolvedNif}`);

  // ── 3. Stable invoice reference ────────────────────────────────────────────
  const a3Ref = deriveStableInvoiceId(invoiceJson);

  // ── 4. Check idempotency ───────────────────────────────────────────────────
  const existing = await findExistingInvoice(a3Ref, token);
  let docId = null;

  if (existing) {
    docId = existing.document_id || existing.id || null;
    console.log(`[Biloop] Invoice ${a3Ref} already exists — document_id=${docId}, skipping POST.`);
  }

  // ── 5. Core financials ─────────────────────────────────────────────────────
  const baseAmt    = parseFloat(invoiceJson['Importe factura'] || invoiceJson['Net Invoice Amount'] || invoiceJson['Invoice Amount'] || 0);
  const vatAmt     = parseFloat(invoiceJson['IVA'] || invoiceJson['IVA / VAT'] || 0);
  const totalAmt   = parseFloat(invoiceJson['Importe Cobro'] || invoiceJson['Gross Invoice Amount'] || (baseAmt + vatAmt) || 0);
  const dateStr    = formatBiloopDate(invoiceJson['Fecha Factura'] || invoiceJson['Invoice Date']);
  const dueDateStr = formatBiloopDate(invoiceJson['Due Date'] || invoiceJson['Due Date.1'] || invoiceJson['Estimated Payment Date']);

  // ── 6. Build description ───────────────────────────────────────────────────
  const position    = invoiceJson['Position'] || invoiceJson['Proceso'] || '';
  const candidate   = invoiceJson['Candidato'] || invoiceJson['Candidate Name'] || '';
  const startDate   = invoiceJson['Start Date'] || '';
  const fixSalary   = invoiceJson['Fix Salary'] || '';
  const varSalary   = invoiceJson['Variable Salary'] || '';
  const equity      = invoiceJson['Equity %'] || '';
  const recruiter   = invoiceJson['Recruiter Name'] || '';
  const feePct      = invoiceJson['Fee %'] || '';
  const discountPct = parseFloat(invoiceJson['Descuento (%)'] || invoiceJson['Discount %'] || 0);

  let desc = `Services rendered for: ${position}`;
  if (candidate) desc += `\nCandidate: ${candidate}`;
  if (startDate) desc += `\nStart Date: ${startDate}`;
  const comp = [fixSalary && `Fix: ${fixSalary}`, varSalary && `Var: ${varSalary}`, equity && `Equity: ${equity}`].filter(Boolean);
  if (comp.length) desc += `\nCompensation: ${comp.join(' | ')}`;
  if (recruiter) desc += `\nRecruiter: ${recruiter}`;
  if (feePct)    desc += `\nAgreed Fee: ${feePct}`;

  // ── 7. POST to Biloop only if not already present ──────────────────────────
  if (!existing) {
    const payload = {
      company_id:          COMPANY_ID,
      master_name:         resolvedName,
      date:                dateStr,
      operation_date:      dateStr,
      issuance_date:       dateStr,
      due_date:            dueDateStr || dateStr,
      expiration_date:     dueDateStr || dateStr,
      SERIE:               invoiceJson.SERIE || 'F',
      a3_reference:        a3Ref,
      invoice_description: desc,
      base:                baseAmt,
      ordinary_vat_base:   baseAmt,
      ordinary_vat_total:  vatAmt,
      vat_total:           vatAmt,
      total:               totalAmt,
      ERP_line: [
        {
          company_id:      COMPANY_ID,
          product_id:      1,
          real_product_id: '1',
          product_name:    `${position}${candidate ? ' - ' + candidate : ''}`.trim() || 'General Services',
          description:     desc,
          units:           1,
          price:           baseAmt,
          discount:        discountPct,
          vat_type_id:     'ORD21',
        },
      ],
    };

    if (resolvedNif)     payload.master_nif = resolvedNif;
    if (resolvedAddress) payload.address    = resolvedAddress;

    console.log('[Biloop] POST payload:', JSON.stringify(payload, null, 2));

    const postRes = await fetch(`${BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices`, {
      method: 'POST',
      headers: { token, SUBSCRIPTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    });

    const result = await postRes.json();
    console.log('[Biloop] POST result:', JSON.stringify(result, null, 2));

    if ((postRes.status !== 200 && postRes.status !== 201) || result.status === 'KO') {
      return { success: false, message: result.message || `Biloop rejected the invoice (HTTP ${postRes.status}).` };
    }

    // Try to extract document_id from the POST response directly
    docId = extractDocumentId(result);
    console.log(`[Biloop] document_id from POST response: ${docId}`);
  }

  // Early return if PDF not needed
  if (!downloadPdf) {
    return {
      success: true,
      message: existing
        ? 'Invoice already in Biloop — no duplicate created.'
        : 'Uploaded successfully to Biloop.',
    };
  }

  // ── 8. Find document_id if we still don't have it ─────────────────────────
  if (!docId) {
    console.log('[Biloop] No document_id yet — waiting 4s then querying by a3_reference…');
    await new Promise(r => setTimeout(r, 4000));

    const getRes = await fetch(
      `${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=${COMPANY_ID}&a3_reference=${encodeURIComponent(a3Ref)}`,
      { method: 'GET', headers: { token, SUBSCRIPTION_KEY } }
    );
    if (getRes.ok) {
      const getData = await getRes.json();
      console.log('[Biloop] GET invoice result:', JSON.stringify(getData, null, 2).slice(0, 500));
      const items = getData.data || getData.IncomeInvoices || (Array.isArray(getData) ? getData : []);
      if (items.length > 0) {
        docId = items[0].document_id || items[0].id || null;
        console.log(`[Biloop] document_id from GET: ${docId}`);
      }
    }
  }

  if (!docId) {
    return {
      success: true,
      pdfBase64: null,
      message: 'Invoice uploaded but could not retrieve document ID for PDF. Check Biloop dashboard.',
    };
  }

  // ── 9. Fetch PDF ───────────────────────────────────────────────────────────
  const pdfBase64 = await fetchPdfWithRetry(docId, token, 5, 3000);

  if (!pdfBase64) {
    return {
      success: true,
      pdfBase64: null,
      message: 'Invoice created in Biloop but PDF download failed after retries. Open Biloop to download manually.',
    };
  }

  const safeName = resolvedName.replace(/[^a-zA-Z0-9À-ÿ\s\-_.]/g, '').replace(/\s+/g, '_');
  return {
    success:   true,
    message:   existing
      ? 'Existing invoice found — PDF retrieved.'
      : 'Invoice created and PDF downloaded successfully.',
    pdfBase64,
    fileName:  `Factura_${safeName}_${dateStr}.pdf`,
  };
}
