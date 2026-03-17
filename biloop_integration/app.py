import json
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

if __name__ == '__main__':
    app.run(debug=True, port=5001)
