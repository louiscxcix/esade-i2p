import { fetchMarginData } from '../../lib/sheets.mjs';

export default async (req) => {
  try {
    const data = await fetchMarginData();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching margins:', error);
    return Response.json({ error: 'Failed to fetch margin data from Google Sheets.' }, { status: 500 });
  }
};

export const config = {
  path: '/api/margins',
};
