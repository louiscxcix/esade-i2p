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
function deriveStableInvoiceId(invoiceJson, resolvedClientName) {
  const rowId     = (invoiceJson['ID Factura Dinámica'] || invoiceJson['Invoice ID'] || '').trim();
  const client    = (invoiceJson['Cliente'] || invoiceJson['Client Name'] || '').trim().toUpperCase();
  const date      = (invoiceJson['Fecha Factura'] || invoiceJson['Invoice Date'] || '').trim();
  const amount    = String(parseFloat(invoiceJson['Importe factura'] || invoiceJson['Invoice Amount'] || 0));
  const candidate = (invoiceJson['Candidato'] || invoiceJson['Candidate Name'] || '').trim().toUpperCase();
  const resolved  = (resolvedClientName || '').toUpperCase();

  // Add salt 'V2' to bypass cached records with old IDs
  const base = `V2|${rowId}|${client}|${date}|${amount}|${candidate}|${resolved}`;

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
    if (!dbNorm || !nameNorm) return 0;
    if (dbNorm === nameNorm) return 100;
    
    // Strict startsWith only if names are reasonably long
    if ((dbNorm.startsWith(nameNorm) || nameNorm.startsWith(dbNorm)) && nameNorm.length > 5) return 80;

    const qWords = nameNorm.split(' ').filter(w => w.length > 2);
    const dWords = dbNorm.split(' ').filter(w => w.length > 2);
    
    if (qWords.length > 0 && dWords.length > 0) {
        const overlap = qWords.filter(w => dWords.includes(w)).length;
        // Calculate percentage of matching words
        const overlapPct = (overlap / Math.max(qWords.length, 1)) * 100;
        if (overlapPct >= 66) return overlapPct; // At least 66% of typed words must match
    }

    if (nameNorm.length > 5 && (dbNorm.includes(nameNorm) || nameNorm.includes(dbNorm))) return 60;
    
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
 * Extract the internal DB primary key ("id") from any Biloop response.
 * The test proved that getPendingBinary works with this id, NOT with document_id.
 * document_id is just the invoice number (e.g. 196) which does NOT work.
 */
function extractInternalId(data) {
  if (!data) return null;

  // Unwrap common envelope shapes first
  let item = data;
  if (item.PostIncomesInvoices && Array.isArray(item.PostIncomesInvoices) && item.PostIncomesInvoices.length > 0)
    item = item.PostIncomesInvoices[0];
  else if (item.data) {
    const rawData = item.data;
    if (Array.isArray(rawData) && rawData.length > 0) {
        item = rawData[0];
        // Handle nested PostIncomesInvoices inside data[0]
        if (item.PostIncomesInvoices && Array.isArray(item.PostIncomesInvoices) && item.PostIncomesInvoices.length > 0)
            item = item.PostIncomesInvoices[0];
    }
    else if (rawData.PostIncomesInvoices && Array.isArray(rawData.PostIncomesInvoices) && rawData.PostIncomesInvoices.length > 0)
      item = rawData.PostIncomesInvoices[0];
    else if (rawData.IncomeInvoices && Array.isArray(rawData.IncomeInvoices) && rawData.IncomeInvoices.length > 0)
      item = rawData.IncomeInvoices[0];
    else item = rawData;
  }
  else if (item.IncomeInvoices && Array.isArray(item.IncomeInvoices) && item.IncomeInvoices.length > 0)
    item = item.IncomeInvoices[0];
  else if (Array.isArray(item) && item.length > 0)
    item = item[0];

  // Try multiple ID fields
  const id = item.id || item.document_id || item.header_id || (item.data && typeof item.data === 'number' ? item.data : null);
  console.log(`[Biloop] extractInternalId: found id=${id}`);
  return id;
}

/**
 * Check whether an invoice with this a3_reference already exists in Biloop.
 * Returns the raw invoice record object, or null.
 */
async function findExistingInvoice(a3Ref, token) {
  try {
    const res = await fetch(
      `${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=${COMPANY_ID}&a3_reference=${encodeURIComponent(a3Ref)}`,
      { method: 'GET', headers: { token, SUBSCRIPTION_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    console.log('[Biloop] findExistingInvoice raw:', JSON.stringify(data).slice(0, 400));
    const items = data.data || data.IncomeInvoices || (Array.isArray(data) ? data : []);
    if (items.length > 0) return items[0];
  } catch (e) {
    console.error('[Biloop] Error checking existing invoice:', e.message);
  }
  return null;
}

/**
 * Fetch the PDF for an invoice.
 * PROVEN by test: getPendingBinary with the internal "id" field always works.
 * document_id (invoice number like 196) does NOT work — returns 404.
 */
async function fetchPdf(invoiceId, token) {
  const headers = { token, SUBSCRIPTION_KEY };
  console.log(`[Biloop] Buscando PDF para ID interno=${invoiceId}`);

  // Reduced attempts and delays to fit Netlify timeout (10s)
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[Biloop] Intento de PDF ${attempt}/3`);
    try {
      const url = `${BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary` +
        `?document_id=${encodeURIComponent(invoiceId)}&document_type=FV&company_id=${COMPANY_ID}`;
      const res = await fetch(url, { method: 'GET', headers });
      
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length > 100 && bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46) {
        console.log(`[Biloop] ✓ PDF Válido: ${bytes.length} bytes`);
        return Buffer.from(buf).toString('base64');
      }
    } catch (e) {
      console.warn(`[Biloop] Error en intento ${attempt}: ${e.message}`);
    }

    if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
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

  // ── 2. Disable all fuzzy matching to prevent Biloop from auto-merging clients ──────────────────────────────────────────────
  const resolvedNif     = null; // Force virtual NIF generation
  const resolvedAddress = null; // Send no address to starve Biloop's auto-matcher
  const resolvedName    = clientName;

  console.log(`[Biloop] Client: "${clientName}" → resolved="${resolvedName}" NIF=${resolvedNif}`);

  // ── 3. Stable invoice reference ────────────────────────────────────────────
  const a3Ref = deriveStableInvoiceId(invoiceJson, resolvedName);

  // ── 4. Check idempotency ───────────────────────────────────────────────────
  const existing = await findExistingInvoice(a3Ref, token);
  let invoiceId = null;  // the internal DB id for getPendingBinary

  if (existing) {
    invoiceId = existing.id || null;
    console.log(`[Biloop] Invoice ${a3Ref} already exists — internal id=${invoiceId}, skipping POST.`);
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

    if (resolvedNif) {
      payload.master_nif = resolvedNif;
    } else {
      // GENERATE UNIQUE VIRTUAL NIF: 
      // Shared dummy NIFs like '00000000T' cause Biloop to override names with its own DB record.
      // We generate a deterministic alphanumeric ID based on the client name.
      let nameHash = 0;
      for (let i = 0; i < resolvedName.length; i++) {
        nameHash = ((nameHash << 5) - nameHash) + resolvedName.charCodeAt(i);
        nameHash |= 0;
      }
      payload.master_nif = `Z${Math.abs(nameHash).toString(36).toUpperCase().padStart(8, '0')}`;
      console.log(`[Biloop] No NIF found. Generated unique virtual NIF: ${payload.master_nif} for "${resolvedName}"`);
    }
    if (resolvedAddress) payload.address = resolvedAddress;

    console.log('[Biloop] POST payload:', JSON.stringify(payload, null, 2));

    const postRes = await fetch(`${BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices`, {
      method: 'POST',
      headers: { token, SUBSCRIPTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    });

    const result = await postRes.json();
    console.log('[Biloop] POST result:', JSON.stringify(result, null, 2));

    // CRITICAL: Biloop sometimes returns status=OK even if document creation failed or was partial.
    const msg = result.message || '';
    const isActuallySuccess = result.status === 'OK' && !msg.toLowerCase().includes('con errores') && !msg.toLowerCase().includes('excepto');
    
    // Extract the internal id from POST response — this is what getPendingBinary needs
    invoiceId = extractInternalId(result);
    console.log(`[Biloop] internal id from POST response: ${invoiceId}`);

    if (!isActuallySuccess || !invoiceId) {
      const errorMsg = msg || (invoiceId ? `Biloop rechazó la factura (HTTP ${postRes.status}).` : 'Fallo al extraer el ID interno, comprueba Biloop.');
      console.error(`[Biloop] POST validation failed: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }

  }

  // Early return if PDF not needed
  if (!downloadPdf) {
    return {
      success: true,
      message: existing
        ? 'La factura ya existe en Biloop - No se creó duplicado.'
        : 'Factura subida con éxito a Biloop.',
    };
  }

  // ── 8. Look up the internal id if we still don't have it (optimized retries) ─────────────────────────
  if (!invoiceId) {
    for (let lookupAttempt = 1; lookupAttempt <= 2 && !invoiceId; lookupAttempt++) {
      console.log(`[Biloop] Buscando ID, intento ${lookupAttempt}/2 — esperando 3s…`);
      await new Promise(r => setTimeout(r, 3000));

      try {
        const getRes = await fetch(
          `${BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=${COMPANY_ID}&a3_reference=${encodeURIComponent(a3Ref)}`,
          { method: 'GET', headers: { token, SUBSCRIPTION_KEY } }
        );
        if (getRes.ok) {
          const getData = await getRes.json();
          const items = getData.data || getData.IncomeInvoices || (Array.isArray(getData) ? getData : []);
          if (items.length > 0) {
            invoiceId = items[0].id || null;
            console.log(`[Biloop] ID encontrado en intento ${lookupAttempt}: ${invoiceId}`);
          }
        }
      } catch (e) {
        console.warn(`[Biloop] Intento ${lookupAttempt} fallido: ${e.message}`);
      }
    }
  }

  if (!invoiceId) {
    return {
      success: false, 
      pdfBase64: null,
      message: 'Factura procesada pero no se pudo recuperar el ID interno para el PDF. Verifícalo en Biloop.',
    };
  }

  // ── 9. Fetch PDF with proven endpoint ──────────────────────────────────────────
  const pdfBase64 = await fetchPdf(invoiceId, token);

  if (!pdfBase64) {
    return {
      success: true,
      pdfBase64: null,
      message: 'Factura creada en Biloop pero la descarga del PDF falló. Descárgalo manualmente en Biloop.',
    };
  }

  const safeName = resolvedName.replace(/[^a-zA-Z0-9À-ÿ\s\-_.]/g, '').replace(/\s+/g, '_');
  return {
    success:   true,
    message:   existing
      ? 'Factura existente - PDF recuperado.'
      : 'Factura creada y PDF descargado con éxito.',
    pdfBase64,
    fileName:  `Factura_${safeName}_${dateStr}.pdf`,
  };
}
