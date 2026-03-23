import google_sheets_fetcher

df = google_sheets_fetcher.fetch_google_sheets_data()
for index, row in df.head(10).iterrows():
    print(f"Row {index} (Sheet Row {int(row.name)+5}): Invoice Date: '{row.get('Invoice Date')}'")
