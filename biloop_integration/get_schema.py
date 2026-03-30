import json

with open("api_v1.json", "r") as f:
    text = f.read().strip()
    
# fixing the trailing comma or extra data issue
try:
    d = json.loads(text)
except json.JSONDecodeError as e:
    text = text[:e.pos]
    # find the last valid brace
    text = text[:text.rfind('}')+1]
    text += "}"
    d = json.loads(text)

schema = d["paths"]["/erp/incomes/invoices/postInvoices"]["post"]["requestBody"]["content"]["application/json"]["schema"]

props = schema['items']['properties']
print("TOP LEVEL PROPERTIES:")
for k, v in props.items():
    print(f"- {k}: {v.get('description', '')}")

print("\nERP_LINE PROPERTIES:")
line_props = props['ERP_line']['items']['properties']
for k, v in line_props.items():
    print(f"- {k}: {v.get('description', '')}")
