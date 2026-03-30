import json

with open("api_v1.json", "r") as f:
    text = f.read().strip()
    
try:
    data = json.loads(text)
except json.JSONDecodeError as e:
    text = text[:e.pos]
    text = text[:text.rfind('}')+1] + "}"
    data = json.loads(text)

schema = data["paths"]["/erp/incomes/invoices/postInvoices"]["post"]["requestBody"]["content"]["application/json"]["schema"]

props = schema.get("items", {}).get("properties", {})
print("--- TOP LEVEL ---")
for k, v in props.items():
    print(f"{k}: {v.get('type')} - {v.get('description', '')[:100]}")

line_props = props.get("ERP_line", {}).get("items", {}).get("properties", {})
print("\n--- LINE ITEMS ---")
for k, v in line_props.items():
    print(f"{k}: {v.get('type')} - {v.get('description', '')[:100]}")
