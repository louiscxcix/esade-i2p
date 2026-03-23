import google_sheets_fetcher

print("Testing RAW date saving...")
updates = [{"row_index": 5, "new_date": "04/02/2026"}]
google_sheets_fetcher.update_invoice_dates(updates)

df = google_sheets_fetcher.fetch_google_sheets_data()
for index, row in df.head(2).iterrows():
    print(f"Row {index} (Sheet Row {int(row.name)+5}): Invoice Date: '{row.get('Invoice Date')}'")
