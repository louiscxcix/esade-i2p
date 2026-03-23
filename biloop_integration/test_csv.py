import pandas as pd
import io
import requests

SHEET_ID = "1Wu_T84la4oqEcXthSZusUblmpF7lUZCSepBvjH2e48I"
GID = "1105355662"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&id={SHEET_ID}&gid={GID}"

response = requests.get(CSV_URL)
csv_content = response.content.decode('utf-8')

# test header 0
df = pd.read_csv(io.StringIO(csv_content), header=0)
df.columns = [str(c).strip() for c in df.columns]

print(f"Columns: {df.columns.tolist()}")

print("Rows before dropna:")
print(df[['ID Factura', 'Cliente']].head())

if 'ID Factura' in df.columns:
    df_dropped = df.dropna(subset=['ID Factura'])
    print(f"\nRows after dropna(subset=['ID Factura']): {len(df_dropped)}")
    print(df_dropped[['ID Factura', 'Cliente']].head())
    
