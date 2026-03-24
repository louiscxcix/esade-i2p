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

# Column mapping for W-AH (0-indexed: 22-33, 1-indexed for gspread: 23-34)
# W=23: Recruiter Name, X=24: Margin, Y=25: Recruiter Commission,
# Z=26: Collected by BT, AA=27: Invoice, AB=28: Recruiter Invoice ID,
# AC=29: Invoice Date, AD=30: Due Date, AE=31: VAT, AF=32: IRPF,
# AG=33: Gross Invoice Amount, AH=34: Payment Status
MARGIN_COLUMNS = [
    {'key': 'Recruiter Name', 'col_idx': 22, 'gspread_col': 23},
    {'key': 'Margin', 'col_idx': 23, 'gspread_col': 24},
    {'key': 'Recruiter Commission', 'col_idx': 24, 'gspread_col': 25},
    {'key': 'Collected by BT', 'col_idx': 25, 'gspread_col': 26},
    {'key': 'Invoice', 'col_idx': 26, 'gspread_col': 27},
    {'key': 'Recruiter Invoice ID', 'col_idx': 27, 'gspread_col': 28},
    {'key': 'Invoice Date (Recruiter)', 'col_idx': 28, 'gspread_col': 29},
    {'key': 'Due Date (Recruiter)', 'col_idx': 29, 'gspread_col': 30},
    {'key': 'VAT', 'col_idx': 30, 'gspread_col': 31},
    {'key': 'IRPF', 'col_idx': 31, 'gspread_col': 32},
    {'key': 'Gross Invoice Amount (Recruiter)', 'col_idx': 32, 'gspread_col': 33},
    {'key': 'Payment Status', 'col_idx': 33, 'gspread_col': 34},
]

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


# --- MARGIN MANAGEMENT LOGIC (Columns W-AH from Spreadsheet 1) ---

def fetch_margin_data_from_sheet1():
    """Fetches columns W-AH from the same Sheet 1 and returns JSON with invoice context."""
    print(f"Fetching margin data (cols W-AH) from {CSV_URL_1}...")
    try:
        response = requests.get(CSV_URL_1)
        response.raise_for_status()
        csv_content = response.content.decode('utf-8')
        df = pd.read_csv(io.StringIO(csv_content), header=3)
        df.columns = [str(c).strip() for c in df.columns]
        df = df.dropna(subset=['Invoice ID'])
        
        all_cols = list(df.columns)
        results = []
        for _, row in df.iterrows():
            record = {
                '_sheet_row_index': int(row.name) + 5,
                '_invoice_id': str(row.get('Invoice ID', '')).strip(),
                '_client_name': str(row.get('Client Name', '')).strip(),
                '_candidate_name': str(row.get('Candidate Name', '')).strip(),
            }
            # Add margin columns W-AH
            for col_info in MARGIN_COLUMNS:
                col_name = col_info['key']
                col_idx = col_info['col_idx']
                if col_idx < len(all_cols):
                    raw_val = row.iloc[col_idx]
                    record[col_name] = '' if pd.isna(raw_val) else str(raw_val).strip()
                else:
                    record[col_name] = ''
            results.append(record)
        
        print(f"Successfully fetched {len(results)} margin records from Sheet 1.")
        return results
    except Exception as e:
        print(f"Error fetching margin data: {e}")
        return None

def _get_gspread_client():
    """Helper to get an authorized gspread client."""
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
            return None
        creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
    return gspread.authorize(creds)

def update_row_margins(row_index, margin_updates):
    """Updates columns W-AH in Sheet 1 for a given row.
    margin_updates is a dict like {'Recruiter Name': 'John', 'Margin': '15%', ...}
    """
    try:
        client = _get_gspread_client()
        if not client:
            return {"success": False, "message": "credentials.json missing and no streamlit secrets found."}
        
        sheet = client.open_by_key(SHEET_ID_1).worksheet("Raw Data")
        
        cells_to_update = []
        for col_info in MARGIN_COLUMNS:
            key = col_info['key']
            if key in margin_updates and margin_updates[key] is not None:
                cells_to_update.append(
                    gspread.Cell(row=row_index, col=col_info['gspread_col'], value=margin_updates[key])
                )
        
        if cells_to_update:
            sheet.update_cells(cells_to_update, value_input_option='USER_ENTERED')
        
        return {"success": True, "message": f"Successfully updated {len(cells_to_update)} fields in Google Sheets."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Error updating margins: {str(e)}"}

def create_new_invoice(invoice_data):
    """Appends a new invoice row to the Google Sheet 1.
    invoice_data is a dict with keys matching the column names.
    Auto-generates the next Invoice ID.
    """
    try:
        client = _get_gspread_client()
        if not client:
            return {"success": False, "message": "credentials.json missing and no streamlit secrets found."}
        
        sheet = client.open_by_key(SHEET_ID_1).worksheet("Raw Data")
        
        # Get all Invoice IDs to determine the next one
        all_ids = sheet.col_values(3)  # Column C = Invoice ID
        
        # Find highest numeric ID
        max_num = 0
        for id_val in all_ids:
            id_str = str(id_val).strip()
            # Try formats like INV-0001, INV0001, or just 0001
            import re
            match = re.search(r'(\d+)', id_str)
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        
        next_id = f"INV-{max_num + 1:04d}"
        
        # Build the new row (columns A through AI = 35 columns)
        # A,B are unnamed/empty, C=Invoice ID, D=Client Name, E=Position,
        # F=Candidate Name, G=Start Date, H=Fix Salary, I=Variable Salary,
        # J=Equity%, K=Invoice Date, L=Fee%, M=Invoice Amount, N=Discount%,
        # O=Net Invoice Amount, P=IVA/VAT, Q=Gross Invoice Amount, R=Due Date,
        # S=Status
        new_row = [''] * 35
        new_row[2] = next_id  # C: Invoice ID
        new_row[3] = invoice_data.get('client_name', '')  # D
        new_row[4] = invoice_data.get('position', '')  # E
        new_row[5] = invoice_data.get('candidate_name', '')  # F
        new_row[6] = invoice_data.get('start_date', '')  # G
        new_row[7] = invoice_data.get('fix_salary', '')  # H
        new_row[10] = invoice_data.get('invoice_date', '')  # K
        new_row[11] = invoice_data.get('fee_percent', '')  # L
        new_row[12] = invoice_data.get('invoice_amount', '')  # M
        new_row[18] = invoice_data.get('status', 'Pending')  # S
        
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        
        return {"success": True, "message": f"New invoice {next_id} created successfully.", "invoice_id": next_id}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Error creating invoice: {str(e)}"}

if __name__ == "__main__":
    df = fetch_google_sheets_data()
    if df is not None:
        json_data = map_to_biloop_json(df)
        print("\n--- Example Mapped JSON (First Record) ---")
        print(json.dumps(json_data[0], indent=2, ensure_ascii=False))
