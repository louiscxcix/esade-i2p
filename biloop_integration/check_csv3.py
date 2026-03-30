import requests
import io
import pandas as pd

CSV_URL_1 = "https://docs.google.com/spreadsheets/d/15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk/export?format=csv&id=15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk&gid=0"

response = requests.get(CSV_URL_1)
csv_content = response.content.decode('utf-8')
# Original pd.read_csv
df = pd.read_csv(io.StringIO(csv_content), header=3) 
df.columns = [str(c).strip() for c in df.columns]

# Original clean_currency
def clean_currency(val):
    if pd.isna(val):
        return 0.0
    if isinstance(val, str):
        val = val.replace('€', '').replace(',', '').strip()
    try:
        return float(val)
    except ValueError:
        return 0.0

print(df[['Invoice ID', 'Invoice Amount', 'Fix Salary']].head(5))
print("cleaned Fix Salary:", [clean_currency(x) for x in df['Fix Salary'].head(5)])
print("cleaned Invoice Amount:", [clean_currency(x) for x in df['Invoice Amount'].head(5)])
