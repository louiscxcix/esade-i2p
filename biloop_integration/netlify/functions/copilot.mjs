import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchRawCSVText, fetchMarginData } from '../../lib/sheets.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ success: false, message: 'Gemini API key is missing.' }, { status: 400 });
  }

  try {
    const data = await req.json();
    const userMessage = data.message || '';
    const history = data.history || [];

    if (!userMessage) {
      return Response.json({ success: false, message: 'Message is empty.' }, { status: 400 });
    }

    // Build context from Google Sheets
    const [csvText, marginData] = await Promise.all([
      fetchRawCSVText(),
      fetchMarginData(),
    ]);

    let context = 'Here is the current Invoice Data:\n' + csvText;
    context += '\n\nHere is the current Margin/Recruiter Data (Columns W-AH):\n';
    if (marginData && marginData.length > 0) {
      context += JSON.stringify(marginData.slice(0, 50), null, 2);
    } else {
      context += 'No margin data.\n';
    }

    const systemPrompt = `You are an AI Co-pilot for an internal invoicing and margin dashboard. You answer questions about the following spreadsheet data:\n\n${context}\n\nHelp the user with data-driven insights. Be concise and format answers in nice markdown.`;

    const selectedModelName = data.model || 'gemini-2.5-flash';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: selectedModelName,
      systemInstruction: systemPrompt,
    });

    // Convert history
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history: formattedHistory });
    const result = await chat.sendMessage(userMessage);
    const reply = result.response.text();

    return Response.json({ success: true, reply });
  } catch (error) {
    console.error('Copilot error:', error);
    return Response.json({ success: false, message: `AI Error: ${error.message}` }, { status: 500 });
  }
};

export const config = {
  path: '/api/copilot',
};
