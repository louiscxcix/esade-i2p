import google_sheets_fetcher
import time
import gspread
from google.oauth2.service_account import Credentials

# 1. Test date write (should store as a date cell, not text)
print("=== Test 1: Date formatting ===")
updates = [{"row_index": 5, "new_date": "11/01/2026"}]  # DD/MM/YYYY from frontend
print("Writing 11/01/2026 (11 January)...")
google_sheets_fetcher.update_invoice_dates(updates)
time.sleep(1)

cred_file = "credentials.json"
scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
client = gspread.authorize(creds)
SHEET_ID = "15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk"
sheet = client.open_by_key(SHEET_ID).worksheet("Raw Data")
val = sheet.col_values(11, value_render_option='FORMATTED_VALUE')[4]
serv = sheet.col_values(11, value_render_option='UNFORMATTED_VALUE')[4]
print(f"  Stored formatted: '{val}'")
print(f"  Stored raw (serial if date): '{serv}'  (num = real date cell, text = plain string)")

# 2. Test status column is included in fetched data
print("\n=== Test 2: Status column ===")
df = google_sheets_fetcher.fetch_google_sheets_data()
invoices = google_sheets_fetcher.map_to_biloop_json(df)
for inv in invoices[:5]:
    print(f"  {inv['Candidato']}: Status='{inv.get('Status', 'MISSING')}'")
