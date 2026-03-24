import { fetchInvoiceData } from '../../lib/sheets.mjs';

export default async (req) => {
  try {
    const data = await fetchInvoiceData();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return Response.json({ error: 'Failed to fetch data from Google Sheets.' }, { status: 500 });
  }
};

export const config = {
  path: '/api/invoices',
};
