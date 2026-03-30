import io
import pandas as pd

def clean_currency(val):
    if pd.isna(val) or val == '':
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val = val.replace('€', '').strip()
        if not val:
            return 0.0
        # If it contains both dot and comma e.g. 10.500,50
        if '.' in val and ',' in val:
            # European: 10.500,50 -> 10500.50
            if val.rfind('.') > val.rfind(','):
                # American: 10,500.50 -> 10500.50
                val = val.replace(',', '')
            else:
                val = val.replace('.', '').replace(',', '.')
        elif '.' in val:
            # 10.500 -> 10500.0 BUT 10.5 -> 10.5
            parts = val.split('.')
            if len(parts) == 2 and len(parts[1]) == 3:
                val = val.replace('.', '')
        elif ',' in val:
            # 10,500 -> 10500.0 or 10,5 -> 10.5
            parts = val.split(',')
            if len(parts) == 2 and len(parts[1]) == 3:
                val = val.replace(',', '')
            else:
                val = val.replace(',', '.')
    try:
        return float(val)
    except ValueError:
        return 0.0

csv = """Invoice Amount
10.500
10500.00
€10.500,50
10,5"""

df = pd.read_csv(io.StringIO(csv), dtype=str)
df['Parsed'] = df['Invoice Amount'].apply(clean_currency)
print(df)
