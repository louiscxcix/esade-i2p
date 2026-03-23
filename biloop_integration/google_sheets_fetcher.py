import pandas as pd
import json
import os
import io
import requests
import gspread
from google.oauth2.service_account import Credentials

# --- Original Spreadsheet (Invoices Upload) ---
SHEET_ID_1 = "15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk"
GID_1 = "0"
CSV_URL_1 = f"https://docs.google.com/spreadsheets/d/{SHEET_ID_1}/export?format=csv&id={SHEET_ID_1}&gid={GID_1}"

# --- New Spreadsheet (Margin Calculator) ---
SHEET_ID_2 = "1Wu_T84la4oqEcXthSZusUblmpF7lUZCSepBvjH2e48I"
GID_2 = "1105355662"
CSV_URL_2 = f"https://docs.google.com/spreadsheets/d/{SHEET_ID_2}/export?format=csv&id={SHEET_ID_2}&gid={GID_2}"

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

# --- INVOICES UPLOAD LOGIC (Spreadsheet 1) ---

def fetch_google_sheets_data():
    """Fetches the Google Sheet data as CSV and parses it with pandas."""
    print(f"Fetching data from {CSV_URL_1}...")
    try:
        response = requests.get(CSV_URL_1)
        response.raise_for_status()
        csv_content = response.content.decode('utf-8')
        df = pd.read_csv(io.StringIO(csv_content), header=3) 
        df.columns = [str(c).strip() for c in df.columns]
        df = df.dropna(subset=['Invoice ID'])
        print(f"Successfully fetched {len(df)} records from Sheet 1.")
        return df
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def map_to_biloop_json(df):
    """Maps the DataFrame to the specific JSON structure for Biloop testing."""
    invoices = []
    for _, row in df.iterrows():
        invoice = {
            "Cliente": str(row.get('Client Name', '')).strip(),
            "Proceso": str(row.get('Position', '')).strip(),
            "Candidato": str(row.get('Candidate Name', '')).strip(),
            "Fecha Factura": str(row.get('Invoice Date', '')).strip(),
            "Fee": clean_percentage(row.get('Fee % ', 0)),
            "Salario": clean_currency(row.get('Fix Salary', 0)),
            "Importe factura": clean_currency(row.get('Invoice Amount', 0)),
            "Descuento (%)": clean_percentage(row.get('Discount %', 0)),
            "Factura neta": clean_currency(row.get('Net Invoice Amount', 0)),
            "IVA": clean_currency(row.get('IVA / VAT', 0)),
            "Importe Cobro": clean_currency(row.get('Gross Invoice Amount', 0)),
            "Status": str(row.get('Status', '')).strip() if not pd.isna(row.get('Status', '')) else '',
            "_sheet_row_index": int(row.name) + 5
        }
        invoices.append(invoice)
    return invoices

def update_invoice_dates(updates):
    """Updates invoice dates in the Google Sheet 1 using gspread."""
    try:
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        
        try:
            import streamlit as st
            gcp_info = st.secrets["gcp_service_account"]
            creds = Credentials.from_service_account_info(gcp_info, scopes=scopes)
        except Exception:
            cred_file = "credentials.json"
            if not os.path.exists(cred_file):
                return {"success": False, "message": "credentials.json missing and no streamlit secrets found."}
            creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
            
        client = gspread.authorize(creds)
        
        sheet = client.open_by_key(SHEET_ID_1).worksheet("Raw Data")
        
        cells_to_update = []
        for update in updates:
            row_idx = update.get('row_index')
            new_date = update.get('new_date')
            if row_idx and new_date:
                # The frontend sends DD/MM/YYYY.
                # Do not swap the formats, since the Spanish locale expects DD/MM/YYYY.
                sheets_date = new_date
                cells_to_update.append(gspread.Cell(row=row_idx, col=11, value=sheets_date))
                
        if cells_to_update:
            sheet.update_cells(cells_to_update, value_input_option='USER_ENTERED')
            
        return {"success": True, "message": f"Successfully updated {len(cells_to_update)} dates in Google Sheets."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Error updating Google Sheets: {str(e)}"}


# --- MARGIN CALCULATOR LOGIC (Spreadsheet 2) ---

def fetch_margin_sheets_data():
    """Fetches the Margin Data Google Sheet data as CSV and parses it with pandas."""
    print(f"Fetching data from {CSV_URL_2}...")
    try:
        response = requests.get(CSV_URL_2)
        response.raise_for_status()
        csv_content = response.content.decode('utf-8')
        df = pd.read_csv(io.StringIO(csv_content), header=0) 
        df.columns = [str(c).strip() for c in df.columns]
        df = df.dropna(subset=['ID Factura'])
        print(f"Successfully fetched {len(df)} records from Sheet 2.")
        return df
    except Exception as e:
        print(f"Error fetching margin data: {e}")
        return None

def map_margin_json(df):
    """Maps the margin data."""
    invoices = []
    for _, row in df.iterrows():
        invoice = {
            "Cliente": str(row.get('Cliente', '')).strip(),
            "Proceso": str(row.get('Proceso', '')).strip(),
            "Candidato": str(row.get('Candidato', '')).strip(),
            "Fecha Factura": str(row.get('Fecha Factura', '')).strip(),
            "Fee": clean_percentage(row.get('Fee', 0)),
            "Salario": clean_currency(row.get('Salario', 0)),
            "Importe factura": clean_currency(row.get('Importe factura', 0)),
            "Descuento (%)": clean_percentage(row.get('Descuento (%)', 0)),
            "Factura neta": clean_currency(row.get('Factura neta', 0)),
            "IVA": clean_currency(row.get('IVA', 0)),
            "Importe Cobro": clean_currency(row.get('Importe Cobro', 0)),
            "Status": str(row.get('Estado', '')).strip() if not pd.isna(row.get('Estado', '')) else '',
            "_sheet_row_index": int(row.name) + 2,
            "_id_factura": str(row.get('ID Factura', '')).strip(),
            "_recruiter": str(row.get('Recruiter', '')).strip(),
            "_margen_percent": str(row.get('Margen (%)', '')).strip(),
            "_comision_recr": str(row.get('Comisión Recr', '')).strip(),
            "_margen_eur": str(row.get('Margen', '')).strip()
        }
        invoices.append(invoice)
    return invoices

def update_row_margins(row_index, factura_neta, recruiter, margen_percent, comision, margen_eur):
    """Updates the margins specifically for the margin page."""
    try:
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        try:
            import streamlit as st
            gcp_info = st.secrets["gcp_service_account"]
            creds = Credentials.from_service_account_info(gcp_info, scopes=scopes)
        except Exception:
            cred_file = "credentials.json"
            if not os.path.exists(cred_file):
                return {"success": False, "message": "credentials.json missing and no streamlit secrets found."}
            creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
            
        client = gspread.authorize(creds)
        
        sheet = client.open_by_key(SHEET_ID_2).worksheet("4. Fras Clientes")
        
        cells_to_update = []
        if factura_neta is not None:
            cells_to_update.append(gspread.Cell(row=row_index, col=16, value=factura_neta))
        if recruiter is not None:
            cells_to_update.append(gspread.Cell(row=row_index, col=31, value=recruiter))
        if margen_percent is not None:
            cells_to_update.append(gspread.Cell(row=row_index, col=32, value=margen_percent))
        if comision is not None:
            cells_to_update.append(gspread.Cell(row=row_index, col=33, value=comision))
        if margen_eur is not None:
            cells_to_update.append(gspread.Cell(row=row_index, col=34, value=margen_eur))
            
        if cells_to_update:
            sheet.update_cells(cells_to_update, value_input_option='USER_ENTERED')
            
        return {"success": True, "message": "Margins successfully updated in Google Sheets."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Error updating Google Sheets margins: {str(e)}"}

if __name__ == "__main__":
    df = fetch_google_sheets_data()
    if df is not None:
        json_data = map_to_biloop_json(df)
        print("\n--- Example Mapped JSON (First Record) ---")
        print(json.dumps(json_data[0], indent=2, ensure_ascii=False))
