import { updateRowMargins } from '../../lib/sheets.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const data = await req.json();
    const rowIndex = data.row_index;
    const marginUpdates = data.margin_updates || {};

    if (!rowIndex) {
      return Response.json({ success: false, message: 'No row index provided.' }, { status: 400 });
    }

    const result = await updateRowMargins(rowIndex, marginUpdates);
    return Response.json(result);
  } catch (error) {
    console.error('Update margin error:', error);
    return Response.json({ success: false, message: `Error: ${error.message}` }, { status: 500 });
  }
};

export const config = {
  path: '/api/update_margin',
};
