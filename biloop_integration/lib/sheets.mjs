import Papa from 'papaparse';
import { google } from 'googleapis';

// --- Configuration ---
const SHEET_ID = '15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk';
const GID = '1209787837';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}&gid=${GID}`;
const WORKSHEET_NAME = 'Datos en bruto';

// Column mapping for X-AJ (0-indexed from CSV: 23-35, 1-indexed for Sheets API: 24-36)
const MARGIN_COLUMNS = [
  { key: 'Recruiter Name', csvIdx: 23, sheetCol: 24 },
  { key: 'Margin', csvIdx: 24, sheetCol: 25 },
  { key: 'Recruiter Commission', csvIdx: 25, sheetCol: 26 },
  { key: 'Collected by BT', csvIdx: 26, sheetCol: 27 },
  { key: 'Invoice', csvIdx: 27, sheetCol: 28 },
  { key: 'Recruiter Invoice ID', csvIdx: 28, sheetCol: 29 },
  { key: 'Invoice Date (Recruiter)', csvIdx: 29, sheetCol: 30 },
  { key: 'Due Date (Recruiter)', csvIdx: 30, sheetCol: 31 },
  { key: 'VAT', csvIdx: 31, sheetCol: 32 },
  { key: 'IRPF', csvIdx: 32, sheetCol: 33 },
  { key: 'Gross Invoice Amount (Recruiter)', csvIdx: 33, sheetCol: 34 },
  { key: 'Payment Status', csvIdx: 34, sheetCol: 35 },
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

// --- CSV Fetch + Parse ---
async function fetchCSV() {
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status}`);
  const text = await response.text();

  // The CSV has 4 header rows; the real headers are on row 4 (0-indexed: 3)
  const lines = text.split('\n');
  // Drop the first 3 rows, keep from row 4 onwards
  const csvWithoutPreamble = lines.slice(3).join('\n');

  const parsed = Papa.parse(csvWithoutPreamble, { header: true, skipEmptyLines: true });
  // Trim column names
  if (parsed.meta && parsed.meta.fields) {
    const fieldMap = {};
    parsed.meta.fields.forEach(f => { fieldMap[f] = f.trim(); });
    parsed.data = parsed.data.map(row => {
      const newRow = {};
      for (const [key, val] of Object.entries(row)) {
        newRow[key.trim()] = val;
      }
      return newRow;
    });
  }
  // Filter to rows with ID Factura
  return parsed.data.filter(row => row['ID Factura'] && String(row['ID Factura']).trim() !== '');
}

// === PUBLIC API ===

/** Fetch invoice data and map to Biloop JSON schema */
export async function fetchInvoiceData() {
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status}`);
  const text = await response.text();
  const lines = text.split('\n');
  const csvWithoutPreamble = lines.slice(3).join('\n');
  
  const parsedHeaders = Papa.parse(csvWithoutPreamble, { header: true, skipEmptyLines: true });
  const parsedRows = Papa.parse(csvWithoutPreamble, { header: false, skipEmptyLines: true });

  const validRows = [];

  for (let i = 1; i < parsedRows.data.length; i++) {
    const rowCells = parsedRows.data[i] || [];
    const headerRow = parsedHeaders.data[i - 1] || {};
    
    const row = {};
    for (const [key, val] of Object.entries(headerRow)) {
      row[key.trim()] = val;
    }

    if (row['ID Factura'] && String(row['ID Factura']).trim() !== '') {
      // Explicit column mapping as requested:
      // L = 11, T = 19, U = 20, V = 21
      const invoiceDate = rowCells[11] ? String(rowCells[11]).trim() : '';
      const status = rowCells[19] ? String(rowCells[19]).trim() : '';
      const estPayDate = rowCells[20] ? String(rowCells[20]).trim() : '';
      const payDate = rowCells[21] ? String(rowCells[21]).trim() : '';

      validRows.push({
        Cliente: (row['Cliente'] || '').trim(),
        Proceso: (row['Proceso'] || '').trim(),
        Candidato: (row['Candidato'] || '').trim(),
        'Fecha Factura': invoiceDate,
        Fee: cleanPercentage(row['Fee %'] || row['Fee % '] || 0),
        Salario: cleanCurrency(row['Salario fijo'] || 0),
        'Importe factura': cleanCurrency(row['Importe Factura'] || 0),
        'Descuento (%)': cleanPercentage(row['Descuento %'] || 0),
        'Factura neta': cleanCurrency(row['Factura Neta'] || 0),
        IVA: cleanCurrency(row['IVA'] || 0),
        'Importe Cobro': cleanCurrency(row['Factura Bruto'] || 0),
        Status: status,
        'Estimated Payment Date': estPayDate,
        'Payment Date': payDate,
        _sheet_row_index: i + 4, // 0-based i + 4 = 1-based sheet row index (row 4 is headers)
      });
    }
  }

  return validRows;
}

/** Fetch margin data (columns W-AH) from Sheet 1 */
export async function fetchMarginData() {
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status}`);
  const text = await response.text();
  const lines = text.split('\n');
  const csvWithoutPreamble = lines.slice(3).join('\n');
  
  const parsedHeaders = Papa.parse(csvWithoutPreamble, { header: true, skipEmptyLines: true });
  const parsedRows = Papa.parse(csvWithoutPreamble, { header: false, skipEmptyLines: true });

  const validRows = [];

  for (let i = 1; i < parsedRows.data.length; i++) {
    const cells = parsedRows.data[i] || [];
    const headerRow = parsedHeaders.data[i - 1] || {};
    
    const row = {};
    for (const [key, val] of Object.entries(headerRow)) {
      row[key.trim()] = val;
    }

    if (row['ID Factura'] && String(row['ID Factura']).trim() !== '') {
      const record = {
        _sheet_row_index: i + 4,
        _invoice_id: (row['ID Factura'] || '').trim(),
        _client_name: (row['Cliente'] || '').trim(),
        _candidate_name: (row['Candidato'] || '').trim(),
        _status: cells[19] ? String(cells[19]).trim() : '', // Col T = index 19
        _payment_date: cells[21] ? String(cells[21]).trim() : '', // Col V = index 21
      };

      for (const col of MARGIN_COLUMNS) {
        const val = cells[col.csvIdx];
        record[col.key] = (val != null && val !== '') ? String(val).trim() : '';
      }

      validRows.push(record);
    }
  }

  return validRows;
}

/** Fetch raw CSV text for copilot context */
export async function fetchRawCSVText() {
  const response = await fetch(CSV_URL);
  if (!response.ok) return 'No data available.';
  const text = await response.text();
  const lines = text.split('\n');
  return lines.slice(3).join('\n');
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

export { MARGIN_COLUMNS };
