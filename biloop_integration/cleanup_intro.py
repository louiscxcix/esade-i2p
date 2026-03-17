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
sheet = client.open_by_key(SHEET_ID).worksheet("Intro")

cells = sheet.range("K5:K30")
for cell in cells:
    cell.value = ""
sheet.update_cells(cells)
print("Cleared Column K on Intro sheet.")
