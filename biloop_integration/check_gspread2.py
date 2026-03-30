import google_sheets_fetcher as gsf
try:
    client = gsf._get_gspread_client()
    sheet = client.open_by_key(gsf.SHEET_ID_1).worksheet("Raw Data")
    data = sheet.get_all_values(value_render_option='UNFORMATTED_VALUE')
    print("Header:", data[3][:15])
    print("Row 1:", data[4][:15])
    print("Salario row 1:", data[4][7])  # Fix Salary is column H (index 7)
    print("Invoice Amount row 1:", data[4][12])  # Invoice Amount is column M (index 12)
except Exception as e:
    print(f"Error: {e}")
