import io
import pandas as pd
csv = """val
10500.5
10500"""
df = pd.read_csv(io.StringIO(csv), decimal=',', thousands='.')
print(df)
