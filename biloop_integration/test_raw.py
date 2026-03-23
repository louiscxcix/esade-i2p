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

# Write a literal DD/MM/YYYY using RAW
sheet.update_cells([gspread.Cell(row=5, col=11, value="04/02/2026")], value_input_option='RAW')
print("Updated to '04/02/2026' using RAW")

time.sleep(2)
v = sheet.col_values(11)[4]
print("Read back:", v)
