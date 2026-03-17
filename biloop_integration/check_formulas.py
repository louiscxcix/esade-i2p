import gspread
from google.oauth2.service_account import Credentials

cred_file = "credentials.json"
scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]
creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
client = gspread.authorize(creds)
SHEET_ID = "15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk"
sheet = client.open_by_key(SHEET_ID).sheet1

# Get formulas and values for col K (11)
cells_values = sheet.col_values(11)
cells_formulas = sheet.col_values(11, value_render_option='FORMULA')

for i in range(4, 10):
    val = cells_values[i] if i < len(cells_values) else ""
    form = cells_formulas[i] if i < len(cells_formulas) else ""
    print(f"Row {i+1}: value='{val}', formula='{form}'")
