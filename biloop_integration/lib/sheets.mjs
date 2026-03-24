import Papa from 'papaparse';
import { google } from 'googleapis';

// --- Configuration ---
const SHEET_ID = '15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk';
const GID = '0';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}&gid=${GID}`;
const WORKSHEET_NAME = 'Raw Data';

// Column mapping for W-AH (0-indexed from CSV: 22-33, 1-indexed for Sheets API: 23-34)
const MARGIN_COLUMNS = [
  { key: 'Recruiter Name', csvIdx: 22, sheetCol: 23 },
  { key: 'Margin', csvIdx: 23, sheetCol: 24 },
  { key: 'Recruiter Commission', csvIdx: 24, sheetCol: 25 },
  { key: 'Collected by BT', csvIdx: 25, sheetCol: 26 },
  { key: 'Invoice', csvIdx: 26, sheetCol: 27 },
  { key: 'Recruiter Invoice ID', csvIdx: 27, sheetCol: 28 },
  { key: 'Invoice Date (Recruiter)', csvIdx: 28, sheetCol: 29 },
  { key: 'Due Date (Recruiter)', csvIdx: 29, sheetCol: 30 },
  { key: 'VAT', csvIdx: 30, sheetCol: 31 },
  { key: 'IRPF', csvIdx: 31, sheetCol: 32 },
  { key: 'Gross Invoice Amount (Recruiter)', csvIdx: 32, sheetCol: 33 },
  { key: 'Payment Status', csvIdx: 33, sheetCol: 34 },
];

// --- Helpers ---
function cleanCurrency(val) {
  if (val == null || val === '') return 0.0;
  const cleaned = String(val).replace(/€/g, '').replace(/,/g, '').trim();
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
  // Filter to rows with Invoice ID
  return parsed.data.filter(row => row['Invoice ID'] && String(row['Invoice ID']).trim() !== '');
}

// === PUBLIC API ===

/** Fetch invoice data and map to Biloop JSON schema */
export async function fetchInvoiceData() {
  const rows = await fetchCSV();
  return rows.map((row, index) => ({
    Cliente: (row['Client Name'] || '').trim(),
    Proceso: (row['Position'] || '').trim(),
    Candidato: (row['Candidate Name'] || '').trim(),
    'Fecha Factura': (row['Invoice Date'] || '').trim(),
    Fee: cleanPercentage(row['Fee %'] || row['Fee % '] || 0),
    Salario: cleanCurrency(row['Fix Salary'] || 0),
    'Importe factura': cleanCurrency(row['Invoice Amount'] || 0),
    'Descuento (%)': cleanPercentage(row['Discount %'] || 0),
    'Factura neta': cleanCurrency(row['Net Invoice Amount'] || 0),
    IVA: cleanCurrency(row['IVA / VAT'] || 0),
    'Importe Cobro': cleanCurrency(row['Gross Invoice Amount'] || 0),
    Status: (row['Status'] || '').trim(),
    _sheet_row_index: index + 5, // row 5 onwards (0-based index + 4 header rows + 1 for 1-indexing)
  }));
}

/** Fetch margin data (columns W-AH) from Sheet 1 */
export async function fetchMarginData() {
  const rows = await fetchCSV();

  // Get the raw field names (before trimming in the ordered way)
  // We need to access by column index for W-AH since column names may have duplicates
  const response = await fetch(CSV_URL);
  const text = await response.text();
  const lines = text.split('\n');
  const headerLine = lines[3]; // Row 4 = real headers
  const headerParsed = Papa.parse(headerLine, { header: false });
  const headers = headerParsed.data[0] || [];

  return rows.map((row, index) => {
    // Re-parse this row by index to get W-AH columns
    const dataLine = lines[index + 4]; // +4 because 3 preamble rows + 1 header row
    const rowParsed = Papa.parse(dataLine, { header: false });
    const cells = rowParsed.data[0] || [];

    const record = {
      _sheet_row_index: index + 5,
      _invoice_id: (row['Invoice ID'] || '').trim(),
      _client_name: (row['Client Name'] || '').trim(),
      _candidate_name: (row['Candidate Name'] || '').trim(),
    };

    for (const col of MARGIN_COLUMNS) {
      const val = cells[col.csvIdx];
      record[col.key] = (val != null && val !== '') ? String(val).trim() : '';
    }

    return record;
  });
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
    range: `${WORKSHEET_NAME}!K${u.row_index}`,
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

/** Update margin columns (W-AH) for a specific row */
export async function updateRowMargins(rowIndex, marginUpdates) {
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
  for (const col of MARGIN_COLUMNS) {
    if (col.key in marginUpdates && marginUpdates[col.key] != null) {
      data.push({
        range: `${WORKSHEET_NAME}!${colToLetter(col.sheetCol)}${rowIndex}`,
        values: [[String(marginUpdates[col.key])]],
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

/** Create a new invoice row with auto-incrementing ID */
export async function createNewInvoice(invoiceData) {
  const sheets = getSheetsClient();

  // Get existing Invoice IDs from column C
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

  // Build a 35-column row (A through AI)
  const newRow = new Array(35).fill('');
  newRow[2] = nextId;                                 // C: Invoice ID
  newRow[3] = invoiceData.client_name || '';           // D: Client Name
  newRow[4] = invoiceData.position || '';              // E: Position
  newRow[5] = invoiceData.candidate_name || '';        // F: Candidate Name
  newRow[6] = invoiceData.start_date || '';            // G: Start Date
  newRow[7] = invoiceData.fix_salary || '';            // H: Fix Salary
  newRow[10] = invoiceData.invoice_date || '';         // K: Invoice Date
  newRow[11] = invoiceData.fee_percent || '';          // L: Fee %
  newRow[12] = invoiceData.invoice_amount || '';       // M: Invoice Amount
  newRow[18] = invoiceData.status || 'Pending';       // S: Status

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:AI`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newRow] },
  });

  return { success: true, message: `New invoice ${nextId} created.`, invoice_id: nextId };
}

export { MARGIN_COLUMNS };
