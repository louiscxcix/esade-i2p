import { updateInvoiceDates } from '../../lib/sheets.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const updates = await req.json();

    if (!updates || !Array.isArray(updates)) {
      return Response.json({ success: false, message: 'Invalid updates data provided.' }, { status: 400 });
    }

    const result = await updateInvoiceDates(updates);
    return Response.json(result);
  } catch (error) {
    console.error('Update dates error:', error);
    return Response.json({ success: false, message: `Error: ${error.message}` }, { status: 500 });
  }
};

export const config = {
  path: '/api/update_dates',
};
