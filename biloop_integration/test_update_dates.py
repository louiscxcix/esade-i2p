import google_sheets_fetcher

if __name__ == '__main__':
    updates = [
        {"row_index": 5, "new_date": "17/03/2026"}
    ]
    print(f"Testing updating row 5 to 17/03/2026...")
    result = google_sheets_fetcher.update_invoice_dates(updates)
    print("Result:", result)
