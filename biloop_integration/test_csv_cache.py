import time
import google_sheets_fetcher

# Update to a new value
newDate = f"01/01/2000"
updates = [{"row_index": 5, "new_date": newDate}]
print(f"Updating row 5 to {newDate}...")
google_sheets_fetcher.update_invoice_dates(updates)

print("Fetching CSV immediately...")
df = google_sheets_fetcher.fetch_google_sheets_data()
first_record = df.iloc[0]
print("Read CSV Date:", first_record.get('Invoice Date'))

# Add random query param to CSV url to cache-bust
url_cb = google_sheets_fetcher.CSV_URL + f"&cb={int(time.time())}"
print(f"Fetching CSV with cache buster: {url_cb}")
import requests, pandas as pd, io
r = requests.get(url_cb)
df2 = pd.read_csv(io.StringIO(r.content.decode('utf-8')), header=3)
print("Read Cache-busted CSV Date:", df2.iloc[0].get('Invoice Date', '').strip())
