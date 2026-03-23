import gspread
from google.oauth2.service_account import Credentials
import os

def test_connection():
    cred_file = "credentials.json"
    if not os.path.exists(cred_file):
        print("credentials.json not found")
        return

    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    try:
        creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
        client = gspread.authorize(creds)
        
        sheet_id = "1Wu_T84la4oqEcXthSZusUblmpF7lUZCSepBvjH2e48I"
        # Try to open the spreadsheet
        print(f"Attempting to open spreadsheet: {sheet_id}")
        spreadsheet = client.open_by_key(sheet_id)
        
        # Try to get the specific worksheet
        # We can list all worksheets
        worksheets = spreadsheet.worksheets()
        print("Available worksheets:")
        for ws in worksheets:
            print(f" - {ws.title} (ID: {ws.id})")
            
        print("\nAttempting to read '4. Fras Clientes'...")
        # Since gid is 1105355662
        try:
            target_ws = spreadsheet.get_worksheet_by_id(1105355662)
            print(f"Successfully opened worksheet: {target_ws.title}")
            
            # Read top 5 rows
            data = target_ws.get_all_values()
            print(f"Total rows: {len(data)}")
            print("Preview of first 5 rows:")
            for row in data[:5]:
                print(row)
        except Exception as e:
            print(f"Failed to open worksheet by id: {e}")
            
    except gspread.exceptions.APIError as e:
        print(f"API Error - The service account might not have access to this sheet. Error: {e}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_connection()
