import pandas as pd
import json
import os
import io
import requests
import gspread
from google.oauth2.service_account import Credentials

SHEET_ID = "15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk"
GID = "0"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&id={SHEET_ID}&gid={GID}"

def fetch_google_sheets_data():
    """Fetches the Google Sheet data as CSV and parses it with pandas."""
    print(f"Fetching data from {CSV_URL}...")
    try:
        response = requests.get(CSV_URL)
        response.raise_for_status()
        
        # The sheet has multiple empty/merged rows at the top. The actual headers are on row index 3.
        csv_content = response.content.decode('utf-8')
        
        # Using pandas to read the CSV
        df = pd.read_csv(io.StringIO(csv_content), header=3) 
        
        # Clean up column names (strip whitespace)
        df.columns = [str(c).strip() for c in df.columns]
        
        # Drop rows where 'Invoice ID' is NaN (these might be empty rows at the bottom)
        df = df.dropna(subset=['Invoice ID'])
        print(f"Successfully fetched {len(df)} records.")
        return df

    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def clean_currency(val):
    if pd.isna(val):
        return 0.0
    if isinstance(val, str):
        val = val.replace('€', '').replace(',', '').strip()
    try:
        return float(val)
    except ValueError:
        return 0.0

def clean_percentage(val):
    if pd.isna(val):
        return 0.0
    if isinstance(val, str):
        val = val.replace('%', '').strip()
    try:
        return float(val) / 100.0
    except ValueError:
        return 0.0

def map_to_biloop_json(df):
    """Maps the DataFrame to the specific Spanish JSON structure for Biloop testing."""
    invoices = []
    for _, row in df.iterrows():
        # New required structure:
        # Cliente, Proceso, Candidato, Fecha Factura, Fee, Salario, 
        # Importe factura, Descuento (%), Factura neta, IVA, Importe Cobro
        invoice = {
            "Cliente": str(row.get('Client Name', '')).strip(),
            "Proceso": str(row.get('Position', '')).strip(),
            "Candidato": str(row.get('Candidate Name', '')).strip(),
            "Fecha Factura": str(row.get('Invoice Date', '')).strip(),
            # Convert percentage from decimal (e.g., 0.15) back to string or leave as float?
            # We'll keep them as numbers based on cleaning function
            "Fee": clean_percentage(row.get('Fee % ', 0)),
            "Salario": clean_currency(row.get('Fix Salary', 0)),
            "Importe factura": clean_currency(row.get('Invoice Amount', 0)),
            "Descuento (%)": clean_percentage(row.get('Discount %', 0)),
            "Factura neta": clean_currency(row.get('Net Invoice Amount', 0)),
            "IVA": clean_currency(row.get('IVA / VAT', 0)),
            "Importe Cobro": clean_currency(row.get('Gross Invoice Amount', 0)),
            "_sheet_row_index": int(row.name) + 5
        }
        invoices.append(invoice)
    return invoices

if __name__ == "__main__":
    df = fetch_google_sheets_data()
    if df is not None:
        json_data = map_to_biloop_json(df)
        
        # Output the first invoice as an example of the mapped JSON
        print("\n--- Example Mapped JSON (First Record) ---")
        print(json.dumps(json_data[0], indent=2, ensure_ascii=False))
        
        # Save to file for next steps
        output_file = "mapped_invoices.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
        print(f"\nSaved {len(json_data)} mapped invoices to '{output_file}'.")

def update_invoice_dates(updates):
    """Updates invoice dates in the Google Sheet using gspread."""
    # updates format: [{'row_index': 5, 'new_date': '01/05/2026'}, ...]
    cred_file = "credentials.json"
    if not os.path.exists(cred_file):
        return {"success": False, "message": "credentials.json missing - Cannot write to Google Sheets without Service Account credentials."}
        
    try:
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
        client = gspread.authorize(creds)
        
        sheet = client.open_by_key(SHEET_ID).worksheet("Raw Data")
        
        # Batch update cells to avoid rate limits
        cells_to_update = []
        for update in updates:
            row_idx = update.get('row_index')
            new_date = update.get('new_date')
            if row_idx and new_date:
                # Column K (Invoice Date) is column 11
                cells_to_update.append(gspread.Cell(row=row_idx, col=11, value=new_date))
                
        if cells_to_update:
            sheet.update_cells(cells_to_update)
            
        return {"success": True, "message": f"Successfully updated {len(cells_to_update)} dates in Google Sheets."}
    except gspread.exceptions.APIError as e:
        print(f"Google APIs Error: {e}")
        return {"success": False, "message": f"API Error: Please ensure Google Sheets API is enabled in your Google Cloud Console."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Error updating Google Sheets: {str(e)}"}

