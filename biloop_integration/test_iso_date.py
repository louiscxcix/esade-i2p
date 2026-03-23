import gspread
from google.oauth2.service_account import Credentials
import time

cred_file = "credentials.json"
scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]
creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
client = gspread.authorize(creds)
SHEET_ID = "15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk"
sheet = client.open_by_key(SHEET_ID).worksheet("Raw Data")

# write ISO string
sheet.update_cells([gspread.Cell(row=5, col=11, value="2026-10-01")])
print("Updated to 2026-10-01 (ISO)")

time.sleep(2)
v = sheet.col_values(11)[4]
print("Read back:", v)
