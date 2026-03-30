import requests
import io
import pandas as pd

CSV_URL_1 = "https://docs.google.com/spreadsheets/d/15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk/export?format=csv&id=15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk&gid=0"

print("Fetching data from CSV_URL_1...")
response = requests.get(CSV_URL_1)
csv_content = response.content.decode('utf-8')
df = pd.read_csv(io.StringIO(csv_content), header=3) 
df.columns = [str(c).strip() for c in df.columns]
print(df[['Invoice ID', 'Invoice Amount', 'Fix Salary']].head(5))
