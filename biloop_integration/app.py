import json
import os
import google.generativeai as genai
from flask import Flask, render_template, jsonify, request
import google_sheets_fetcher
import biloop_client
import pdf_generator

app = Flask(__name__)

@app.route('/')
def index():
    # Render the main dashboard page
    return render_template('index.html')

@app.route('/api/invoices', methods=['GET'])
def get_invoices():
    # 1. Fetch live data from Google Sheets
    df = google_sheets_fetcher.fetch_google_sheets_data()
    
    # 2. Map to the Spanish JSON schema
    if df is not None:
        json_data = google_sheets_fetcher.map_to_biloop_json(df)
        return jsonify(json_data)
    else:
        return jsonify({"error": "Failed to fetch data from Google Sheets."}), 500

@app.route('/api/margins', methods=['GET'])
def get_margins():
    # Fetch live data from Google Sheets 2
    df = google_sheets_fetcher.fetch_margin_sheets_data()
    
    if df is not None:
        json_data = google_sheets_fetcher.map_margin_json(df)
        return jsonify(json_data)
    else:
        return jsonify({"error": "Failed to fetch margin data from Google Sheets."}), 500

@app.route('/api/upload', methods=['POST'])
def upload_invoice():
    # Expects the invoice JSON data to be sent in the request body
    invoice_data = request.json
    
    if not invoice_data:
        return jsonify({"error": "No invoice data provided."}), 400
        
    print(f"Received upload request for candidate: {invoice_data.get('Candidato')}")
    
    # 1. (Optional) Generate the PDF locally first
    # pdf_generator.create_invoice_pdf(invoice_data, "manual_upload")
    
    # 2. Push to Biloop API
    # Since we are paused on the real API due to 'Acceso denegado', we will call the mock client
    # or you can test the real one if you manage to fix the keys.
    # Currently calling our testing function which simulates the push.
    
    success = biloop_client.push_invoice_to_biloop(invoice_data)
    
    if success is not False: # (Handle mock vs real bool returns)
        return jsonify({"success": True, "message": "Uploaded successfully to Biloop."})
    else:
        return jsonify({"success": False, "message": "Failed to upload to Biloop."}), 500

@app.route('/api/update_dates', methods=['POST'])
def update_dates():
    # Expects JSON data: [{"row_index": 5, "new_date": "01/05/2026"}, ...]
    updates = request.json
    
    if not updates or not isinstance(updates, list):
        return jsonify({"success": False, "message": "Invalid updates data provided."}), 400
        
    print(f"Received request to update {len(updates)} dates: {updates}")
    
    result = google_sheets_fetcher.update_invoice_dates(updates)
    
    if result.get("success"):
        return jsonify(result)
    else:
        # Return 400 or 500 depending on error, but mostly 500 for missing credentials/API errors
        return jsonify(result), 500

@app.route('/api/update_margin', methods=['POST'])
def update_margin():
    data = request.json
    row_index = data.get('row_index')
    factura_neta = data.get('factura_neta')
    recruiter = data.get('recruiter')
    margen_percent = data.get('margen_percent')
    comision = data.get('comision')
    margen_eur = data.get('margen_eur')
    
    if not row_index:
        return jsonify({"success": False, "message": "No row index provided."}), 400
        
    result = google_sheets_fetcher.update_row_margins(row_index, factura_neta, recruiter, margen_percent, comision, margen_eur)
    
    if result.get("success"):
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/copilot', methods=['POST'])
def copilot_chat():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"success": False, "message": "Gemini API key is missing. Please set the GEMINI_API_KEY environment variable before running the app."}), 400
        
    data = request.json
    user_message = data.get('message', '')
    history = data.get('history', [])
    
    if not user_message:
         return jsonify({"success": False, "message": "Message is empty."}), 400
         
    try:
        genai.configure(api_key=api_key)
        
        # Build context from Google Sheets
        df_invoices = google_sheets_fetcher.fetch_google_sheets_data()
        df_margins = google_sheets_fetcher.fetch_margin_sheets_data()
        
        # Format as string
        context = "Here is the current Invoice Data:\n"
        if df_invoices is not None and not df_invoices.empty:
             context += df_invoices.to_csv(index=False)
        else:
             context += "No invoice data.\n"
             
        context += "\nHere is the current Margin Data:\n"
        if df_margins is not None and not df_margins.empty:
             context += df_margins.to_csv(index=False)
        else:
             context += "No margin data.\n"
             
        system_prompt = f"You are an AI Co-pilot for an internal invoicing and margin dashboard. You answer questions about the following spreadsheet data:\n\n{context}\n\nHelp the user with data-driven insights. Be concise and format answers in nice markdown."
        
        model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=system_prompt)
        
        # Convert history format
        formatted_history = []
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            # simple mapping, Gemini requires exactly alternating roles but we start fresh each time or use the provided history
            # Actually, to be safe, if we just pass everything.
            # Google's SDK expects 'user' and 'model'.
            formatted_history.append({"role": role, "parts": [msg["content"]]})
            
        chat = model.start_chat(history=formatted_history)
        response = chat.send_message(user_message)
        
        return jsonify({"success": True, "reply": response.text})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": f"AI Error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
