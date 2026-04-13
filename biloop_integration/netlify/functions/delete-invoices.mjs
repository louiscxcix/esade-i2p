import { deleteInvoices } from '../../lib/sheets.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { row_indices } = await req.json();

    if (!row_indices || !Array.isArray(row_indices) || row_indices.length === 0) {
      return Response.json({ success: false, message: 'No row indices provided.' }, { status: 400 });
    }

    const result = await deleteInvoices(row_indices);
    return Response.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error('Delete invoices error:', error);
    return Response.json({ success: false, message: `Error: ${error.message}` }, { status: 500 });
  }
};

export const config = {
  path: '/api/delete_invoices',
};
