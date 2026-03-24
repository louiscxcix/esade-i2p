import { createNewInvoice } from '../../lib/sheets.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const invoiceData = await req.json();

    if (!invoiceData) {
      return Response.json({ success: false, message: 'No invoice data provided.' }, { status: 400 });
    }

    const result = await createNewInvoice(invoiceData);
    return Response.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error('Create invoice error:', error);
    return Response.json({ success: false, message: `Error: ${error.message}` }, { status: 500 });
  }
};

export const config = {
  path: '/api/create_invoice',
};
