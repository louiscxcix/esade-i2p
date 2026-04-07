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

// === PUBLIC API ===

/** Fetch invoice data and map to Biloop JSON schema using real-time API */
export async function fetchInvoiceData() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A4:AJ`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(h => String(h).trim());
  const dataRows = rows.slice(1);
  const validRows = [];

    // Helper to find index by header keywords (case-insensitive)
    const findIdx = (keywords) => {
        return headers.findIndex(h => {
            const lowerH = (h || '').toLowerCase().trim();
            return keywords.every(k => lowerH.includes(k.toLowerCase()));
        });
    };

    const idIdx     = findIdx(['c175']) !== -1 ? findIdx(['c175']) : findIdx(['id', 'factura']);
    const clientIdx = findIdx(['cliente']);
    const procIdx   = findIdx(['proceso']);
    const candIdx   = findIdx(['candidato']);
    const dateIdx   = findIdx(['fecha', 'factura']);
    const statusIdx = findIdx(['estado']) === -1 ? findIdx(['status']) : findIdx(['estado']);
    const estPayIdx = findIdx(['fecha', 'est', 'pago']) === -1 ? findIdx(['estimada', 'pago']) : findIdx(['fecha', 'est', 'pago']);
    const payIdx    = findIdx(['fecha', 'cobro']) === -1 ? findIdx(['fecha', 'pago']) : findIdx(['fecha', 'cobro']);
    const feeIdx    = findIdx(['fee', '%']);
    const amtIdx    = findIdx(['importe', 'factura']);
    const salIdx    = findIdx(['salario', 'fijo']);
    const ivaIdx    = findIdx(['iva']);
    const brutoIdx  = findIdx(['factura', 'bruto']) !== -1 ? findIdx(['factura', 'bruto']) : findIdx(['importe', 'total']);
    const varSalIdx = findIdx(['salario', 'variable']);
    const equityIdx = findIdx(['participación', '%']) !== -1 ? findIdx(['participación', '%']) : findIdx(['equity']);
    const startIdx  = findIdx(['fecha', 'inicio']);
    const dueIdx    = findIdx(['vencimiento']);
    const recruiterIdx = findIdx(['recruiter']);
    const discountIdx = findIdx(['descuento', '%']);

    dataRows.forEach((rowCells, i) => {
        const idVal = rowCells[idIdx] || '';
        const clientVal = (rowCells[clientIdx] || '').trim();
        const candVal = (rowCells[candIdx] || '').trim();
        
        if ((idVal && String(idVal).trim() !== '') || clientVal !== '' || candVal !== '') {
            const invoiceDate = (rowCells[dateIdx] || '').trim();
            const status      = (rowCells[statusIdx] || '').trim();
            const estPayDate  = (rowCells[estPayIdx] || '').trim();
            const payDate     = (rowCells[payIdx] || '').trim();

            validRows.push({
                // Original keys (for UI)
                Cliente: (rowCells[clientIdx] || '').trim(),
                Proceso: (rowCells[procIdx] || '').trim(),
                Candidato: (rowCells[candIdx] || '').trim(),
                'Fecha Factura': invoiceDate,
                Fee: cleanPercentage(rowCells[feeIdx] || 0),
                Salario: cleanCurrency(rowCells[salIdx] || 0),
                'Importe factura': cleanCurrency(rowCells[amtIdx] || 0),
                IVA: cleanCurrency(rowCells[ivaIdx] || 0),
                'Importe Cobro': cleanCurrency(rowCells[brutoIdx] || 0), 
                Status: status,
                'Estimated Payment Date': estPayDate,
                'Payment Date': payDate,

                // Biloop-optimized keys
                'ID Factura Dinámica': String(idVal).trim(),
                'Candidate Name': (rowCells[candIdx] || '').trim(),
                'Due Date': (rowCells[dueIdx] || '').trim() || estPayDate,
                'Fee %': cleanPercentage(rowCells[feeIdx] || 0),
                'Start Date': (rowCells[startIdx] || '').trim(),
                'Fix Salary': (rowCells[salIdx] || '').trim(),
                'Variable Salary': (rowCells[varSalIdx] || '').trim(),
                'Equity %': (rowCells[equityIdx] || '').trim(),
                'Recruiter Name': (rowCells[recruiterIdx] || '').trim(),
                'Discount %': cleanPercentage(rowCells[discountIdx] || 0) * 100, // Biloop expects percentage number, not decimal
                
                _sheet_row_index: i + 5, // Row 4 was headers, so first data row is 5
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
    range: `${WORKSHEET_NAME}!A4:AJ`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(h => String(h).trim());
  const dataRows = rows.slice(1);
  const validRows = [];

    // Helper to find index by header keywords (case-insensitive)
    const findIdx = (keywords) => {
        return headers.findIndex(h => {
            const lowerH = (h || '').toLowerCase().trim();
            return keywords.every(k => lowerH.includes(k.toLowerCase()));
        });
    };

    const idIdx     = findIdx(['c175']) !== -1 ? findIdx(['c175']) : findIdx(['id', 'factura']);
    const clientIdx = findIdx(['cliente']);
    const candIdx   = findIdx(['candidato']);
    const statusIdx = findIdx(['estado']) === -1 ? findIdx(['status']) : findIdx(['estado']);
    const payIdx    = findIdx(['fecha', 'cobro']) === -1 ? findIdx(['fecha', 'pago']) : findIdx(['fecha', 'cobro']);

    dataRows.forEach((cells, i) => {
        const idVal = cells[idIdx] || '';
        const clientVal = (cells[clientIdx] || '').trim();
        const candVal = (cells[candIdx] || '').trim();
        
        if ((idVal && String(idVal).trim() !== '') || clientVal !== '' || candVal !== '') {
            const record = {
                _sheet_row_index: i + 5,
                _invoice_id: String(idVal).trim(),
                _client_name: (cells[clientIdx] || '').trim(),
                _candidate_name: (cells[candIdx] || '').trim(),
                _status: (cells[statusIdx] || '').trim(),
                _payment_date: (cells[payIdx] || '').trim(),
            };

            for (const col of MARGIN_COLUMNS) {
                const val = cells[col.csvIdx];
                record[col.key] = (val != null && val !== '') ? String(val).trim() : '';
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

export { MARGIN_COLUMNS };
