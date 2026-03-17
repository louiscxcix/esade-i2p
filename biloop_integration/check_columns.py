import pandas as pd
import io
import requests

SHEET_ID = "15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk"
GID = "0"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&id={SHEET_ID}&gid={GID}"

response = requests.get(CSV_URL)
csv_content = response.content.decode('utf-8')
df = pd.read_csv(io.StringIO(csv_content), header=3)
df.columns = [str(c).strip() for c in df.columns]
for i, col in enumerate(df.columns):
    print(f"Col {i+1} : {col}")
