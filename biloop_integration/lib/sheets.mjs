import Papa from 'papaparse';
import { google } from 'googleapis';

// --- Configuration ---
const SHEET_ID = '15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk';
const GID = '1209787837';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}&gid=${GID}`;
const WORKSHEET_NAME = 'Datos en bruto';

// Column mapping for X-AJ (0-indexed from CSV: 23-35, 1-indexed for Sheets API: 24-36)
// Base Margin column definitions (keys and sheet letters for writing)
const MARGIN_COLUMNS_BASE = [
  { key: 'Recruiter Name', keywords: [['recruiter', 'name'], ['reclutador']], sheetCol: 24 },
  { key: 'Margin', keywords: [['margin'], ['margen']], sheetCol: 25 },
  { key: 'Recruiter Commission', keywords: [['recruiter', 'commission'], ['comisión'], ['comision']], sheetCol: 26 },
  { key: 'Collected by BT', keywords: [['collected', 'bt'], ['cobrado']], sheetCol: 27 },
  { key: 'Invoice', keywords: [['invoice'], ['referencia'], ['ref']], sheetCol: 28 },
  { key: 'Recruiter Invoice ID', keywords: [['invoice', 'id'], ['nº', 'factura']], sheetCol: 29 },
  { key: 'Invoice Date (Recruiter)', keywords: [['invoice', 'date']], sheetCol: 30 },
  { key: 'Due Date (Recruiter)', keywords: [['due', 'date']], sheetCol: 31 },
  { key: 'VAT', keywords: [['vat'], ['iva']], sheetCol: 32 },
  { key: 'IRPF', keywords: [['irpf']], sheetCol: 33 },
  { key: 'Gross Invoice Amount (Recruiter)', keywords: [['gross'], ['importe', 'bruto']], sheetCol: 34 },
  { key: 'Payment Status', keywords: [['payment', 'status']], sheetCol: 35 },
];

// --- Helpers ---
function cleanCurrency(val) {
  if (val == null || val === '') return 0.0;
  let cleaned = String(val).replace(/€/g, '').trim();
  // Remove dots (thousands separator)
  cleaned = cleaned.replace(/\./g, '');
  // Replace comma (decimal separator) with dot
  cleaned = cleaned.replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0.0 : num;
}

function cleanPercentage(val) {
  if (val == null || val === '') return 0.0;
  const cleaned = String(val).replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0.0 : num / 100.0;
}

// --- Google Sheets API Auth ---
function getSheetsClient() {
  const privateKey = (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: privateKey,
      project_id: process.env.GCP_PROJECT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// === PUBLIC API ===

/** 
 * Helper to find column index by a prioritized list of keyword sets.
 * Example: findIdx(headers, [['id', 'factura'], ['factura'], ['id']])
 */
function findIdx(headers, prioritizedKeywords) {
  for (const keywords of prioritizedKeywords) {
    const idx = headers.findIndex(h => {
      const lowerH = (h || '').toLowerCase().trim();
      return keywords.every(k => lowerH.includes(k.toLowerCase()));
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

/** 
 * Discover the header row and its column mapping by scanning the first few rows.
 */
function discoverHeaders(rows) {
  const CRITICAL_KEYWORDS = ['cliente', 'candidato', 'factura'];
  let headerRowIdx = -1;
  let headers = [];

  // Scan first 10 rows for something that looks like a header
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map(h => String(h).toLowerCase().trim());
    const matchCount = CRITICAL_KEYWORDS.filter(k => row.some(cell => cell.includes(k))).length;
    if (matchCount >= 2) { // Found it
      headerRowIdx = i;
      headers = rows[i].map(h => String(h).trim());
      break;
    }
  }

  if (headerRowIdx === -1) return null;

  return {
    index: headerRowIdx,
    headers: headers,
    mapping: {
      id:       findIdx(headers, [['id', 'factura'], ['factura'], ['id'], ['nº']]),
      client:   findIdx(headers, [['cliente'], ['company'], ['empresa']]),
      proc:     findIdx(headers, [['proceso'], ['posición'], ['puesto'], ['job']]),
      cand:     findIdx(headers, [['candidato'], ['nombre'], ['candidate']]),
      date:     findIdx(headers, [['fecha', 'factura'], ['fecha']]),
      status:   findIdx(headers, [['estado'], ['status']]),
      estPay:   findIdx(headers, [['fecha', 'est', 'pago'], ['estimada', 'pago'], ['vencimiento']]),
      pay:      findIdx(headers, [['fecha', 'cobro'], ['fecha', 'pago'], ['cobro']]),
      fee:      findIdx(headers, [['fee', '%'], ['tarifa']]),
      amt:      findIdx(headers, [['importe', 'factura'], ['importe'], ['total']]),
      sal:      findIdx(headers, [['salario', 'fijo'], ['salario'], ['fix']])
    },
    marginMapping: MARGIN_COLUMNS_BASE.map(col => ({
      ...col,
      csvIdx: findIdx(headers, col.keywords)
    }))
  };
}

/** Fetch invoice data and map to Biloop JSON schema using real-time API */
export async function fetchInvoiceData() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A1:AJ`, // Start from A1 to discover headers
  });

  const allRows = response.data.values;
  if (!allRows || allRows.length === 0) return [];

  const discovery = discoverHeaders(allRows);
  if (!discovery) {
      console.error('Failed to discover headers in sheet.');
      return [];
  }

  const { mapping, index: headerIdx } = discovery;
  const dataRows = allRows.slice(headerIdx + 1);
  const validRows = [];

  dataRows.forEach((rowCells, i) => {
    const idVal = mapping.id !== -1 ? (rowCells[mapping.id] || '') : '';
    
    // We need at least an ID or a Client name to consider it a valid row
    const clientVal = mapping.client !== -1 ? (rowCells[mapping.client] || '') : '';
    
    if ((idVal && String(idVal).trim() !== '') || (clientVal && String(clientVal).trim() !== '')) {
      validRows.push({
        Cliente: clientVal.trim(),
        Proceso: mapping.proc !== -1 ? (rowCells[mapping.proc] || '').trim() : '',
        Candidato: mapping.cand !== -1 ? (rowCells[mapping.cand] || '').trim() : '',
        'Fecha Factura': mapping.date !== -1 ? (rowCells[mapping.date] || '').trim() : '',
        Fee: mapping.fee !== -1 ? cleanPercentage(rowCells[mapping.fee] || 0) : 0,
        Salario: mapping.sal !== -1 ? cleanCurrency(rowCells[mapping.sal] || 0) : 0,
        'Importe factura': mapping.amt !== -1 ? cleanCurrency(rowCells[mapping.amt] || 0) : 0,
        Status: mapping.status !== -1 ? (rowCells[mapping.status] || '').trim() : '',
        'Estimated Payment Date': mapping.estPay !== -1 ? (rowCells[mapping.estPay] || '').trim() : '',
        'Payment Date': mapping.pay !== -1 ? (rowCells[mapping.pay] || '').trim() : '',
        'ID Factura Dinámica': String(idVal).trim(),
        'Candidate Name': mapping.cand !== -1 ? (rowCells[mapping.cand] || '').trim() : '',
        'Due Date': mapping.estPay !== -1 ? (rowCells[mapping.estPay] || '').trim() : '',
        'Fee %': mapping.fee !== -1 ? cleanPercentage(rowCells[mapping.fee] || 0) : 0,
        _sheet_row_index: headerIdx + i + 2, // +1 for 0-index to 1-index, +1 for row following header
      });
    }
  });

  return validRows;
}

/** Fetch margin data (columns W-AH) from Sheet 1 using real-time API */
export async function fetchMarginData() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A1:AJ`,
  });

  const allRows = response.data.values;
  if (!allRows || allRows.length === 0) return [];

  const discovery = discoverHeaders(allRows);
  if (!discovery) return [];

  const { mapping, index: headerIdx } = discovery;
  const dataRows = allRows.slice(headerIdx + 1);
  const validRows = [];

  dataRows.forEach((cells, i) => {
    const idVal = mapping.id !== -1 ? (cells[mapping.id] || '') : '';
    const clientVal = mapping.client !== -1 ? (cells[mapping.client] || '') : '';
    
    if ((idVal && String(idVal).trim() !== '') || (clientVal && String(clientVal).trim() !== '')) {
      const record = {
        _sheet_row_index: headerIdx + i + 2,
        _invoice_id: String(idVal).trim(),
        _client_name: clientVal.trim(),
        _candidate_name: mapping.cand !== -1 ? (cells[mapping.cand] || '').trim() : '',
        _status: mapping.status !== -1 ? (cells[mapping.status] || '').trim() : '',
        _payment_date: mapping.pay !== -1 ? (cells[mapping.pay] || '').trim() : '',
      };

      for (const col of discovery.marginMapping) {
        if (col.csvIdx !== -1) {
          const val = cells[col.csvIdx];
          record[col.key] = (val != null && val !== '') ? String(val).trim() : '';
        } else {
          record[col.key] = '';
        }
      }

      validRows.push(record);
    }
  });

  return validRows;
}

/** Fetch raw text for copilot context using real-time API */
export async function fetchRawCSVText() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A4:AJ`,
  });
  const rows = response.data.values;
  if (!rows || rows.length === 0) return 'No data available.';
  
  return rows.map(r => r.join(',')).join('\n');
}


/** Update invoice dates in Sheet 1 */
export async function updateInvoiceDates(updates) {
  const sheets = getSheetsClient();

  // Use values.batchUpdate with USER_ENTERED so Sheets interprets dates properly
  const data = updates.map(u => ({
    range: `${WORKSHEET_NAME}!L${u.row_index}`, // Fecha Factura is col L
    values: [[u.new_date]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  return { success: true, message: `Updated ${updates.length} date(s).` };
}

/** Update status and/or estimated payment date for an invoice row */
export async function updateInvoiceFields(updates) {
  const sheets = getSheetsClient();
  // updates: array of { row_index, status?, est_payment_date? }
  const data = [];

  for (const u of updates) {
    if (u.status != null) {
      data.push({
        range: `${WORKSHEET_NAME}!T${u.row_index}`, // Estado is col T
        values: [[u.status]],
      });
    }
    if (u.est_payment_date != null) {
      data.push({
        range: `${WORKSHEET_NAME}!U${u.row_index}`, // Feche Estimada de Pago is col U
        values: [[u.est_payment_date]],
      });
    }
    if (u.invoice_date != null) {
      data.push({
        range: `${WORKSHEET_NAME}!L${u.row_index}`, // Fecha Factura is col L
        values: [[u.invoice_date]],
      });
    }
    if (u.payment_date != null) {
      data.push({
        range: `${WORKSHEET_NAME}!V${u.row_index}`, // Feche de Cobro is col V
        values: [[u.payment_date]],
      });
    }
  }

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });
  }

  return { success: true, message: `Updated ${data.length} field(s).` };
}

/** Update margin columns (W-AH), Status, and Payment Date across multiple rows */
export async function updateMarginsBatch(updates) {
  const sheets = getSheetsClient();

  // Convert 1-indexed sheetCol to column letter (e.g., 23 -> W, 34 -> AH)
  function colToLetter(colNum) {
    let letter = '';
    while (colNum > 0) {
      colNum--;
      letter = String.fromCharCode(65 + (colNum % 26)) + letter;
      colNum = Math.floor(colNum / 26);
    }
    return letter;
  }

  const data = [];
  for (const u of updates) {
    const { row_index, margin_updates, status, payment_date } = u;

    if (margin_updates) {
      for (const col of MARGIN_COLUMNS) {
        if (col.key in margin_updates && margin_updates[col.key] != null) {
          data.push({
            range: `${WORKSHEET_NAME}!${colToLetter(col.sheetCol)}${row_index}`,
            values: [[String(margin_updates[col.key])]],
          });
        }
      }
    }

    if (status != null) {
      data.push({ range: `${WORKSHEET_NAME}!T${row_index}`, values: [[status]] }); // Estado is col T
    }
    if (payment_date != null) {
      data.push({ range: `${WORKSHEET_NAME}!V${row_index}`, values: [[payment_date]] }); // Feche de Cobro is col V
    }
  }

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });
  }

  return { success: true, message: `Updated ${data.length} field(s).` };
}

/** Create a new invoice row with auto-incrementing ID */
export async function createNewInvoice(invoiceData) {
  const sheets = getSheetsClient();

  // Get existing ID Factura from column C (index 2)
  const idResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!C:C`,
  });

  const allIds = (idResponse.data.values || []).flat();
  let maxNum = 0;
  for (const idVal of allIds) {
    const match = String(idVal).match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextId = `INV-${String(maxNum + 1).padStart(4, '0')}`;

  // Build a 36-column row (A through AJ)
  const newRow = new Array(36).fill('');
  newRow[2] = nextId;                                 // C: ID Factura
  newRow[3] = invoiceData.client_name || '';           // D: Cliente
  newRow[4] = invoiceData.position || '';              // E: Proceso
  newRow[6] = invoiceData.candidate_name || '';        // G: Candidato
  newRow[7] = invoiceData.start_date || '';            // H: Fecha de Inicio
  newRow[8] = invoiceData.fix_salary || '';            // I: Salario fijo
  newRow[11] = invoiceData.invoice_date || '';         // L: Fecha Factura
  newRow[12] = invoiceData.fee_percent || '';          // M: Fee % 
  newRow[13] = invoiceData.invoice_amount || '';       // N: Importe Factura
  newRow[19] = invoiceData.status || 'Pending';       // T: Estado

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:AJ`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newRow] },
  });

  return { success: true, message: `New invoice ${nextId} created.`, invoice_id: nextId };
}

export const MARGIN_COLUMNS = MARGIN_COLUMNS_BASE; // For backwards compatibility if needed
