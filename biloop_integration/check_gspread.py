import google_sheets_fetcher as gsf
client = gsf._get_gspread_client()
sheet = client.open_by_key(gsf.SHEET_ID_1).worksheet("Raw Data")
data = sheet.get_all_values(value_render_option='UNFORMATTED_VALUE')
print(data[3][:25])  # header row
print(data[4][:25])  # first data row
