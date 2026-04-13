import { pushInvoiceToBiloop } from './lib/biloop.mjs';
import fs from 'fs';

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
envLines.forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    let val = rest.join('=');
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

/**
 * Test:
 *  - Client: MC Recruiting (should resolve NIF + address from Biloop)
 *  - Amount: €10
 *  - Run TWICE to verify that the second call does NOT create a duplicate
 */
const invoiceData = {
  'ID Factura Dinámica': 'TEST-MC-001',   // fixed ID → stable a3_reference → no dup
  'Cliente':             'MC Recruiting',
  'Fecha Factura':       '10/04/2026',
  'Proceso':             'Software Engineer',
  'Candidate Name':      'Test Candidate',
  'Importe factura':     10.0,
  'IVA':                 2.1,
  'Importe Cobro':       12.1,
  'Due Date':            '10/05/2026',
};

async function runTest(attempt) {
  console.log(`\n======= ATTEMPT ${attempt} =======`);
  try {
    // First call: upload only (no PDF)
    const res = await pushInvoiceToBiloop(invoiceData, false);
    console.log('[Upload result]', res);

    // Second call of the same invoice: download PDF — should NOT create a new invoice
    console.log('\n--- Now requesting PDF for the same invoice ---');
    const pdfRes = await pushInvoiceToBiloop(invoiceData, true);
    console.log('[PDF result]', {
      success:   pdfRes.success,
      message:   pdfRes.message,
      hasPdf:    !!pdfRes.pdfBase64,
      fileName:  pdfRes.fileName,
    });
  } catch (e) {
    console.error('[ERROR]', e);
  }
}

runTest(1);
