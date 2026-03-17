import google_sheets_fetcher

df = google_sheets_fetcher.fetch_google_sheets_data()
if df is not None:
    for index, row in df.iterrows():
        sheet_row = int(index) + 5
        print(f"Pandas Index: {index}, Invoice ID: {row.get('Invoice ID')}, Calculated Sheet Row: {sheet_row}")
