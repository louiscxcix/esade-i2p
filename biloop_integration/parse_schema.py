import json

def extract_schema():
    with open("api_v1.json", "r") as f:
        content = f.read().strip()
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            content = content[:e.pos]
            content = content[:content.rfind('}')+1]
            content += "}"
            data = json.loads(content)
            
    # dump all properties of /erp/incomes/invoices/postInvoices
    endpoint = data.get("paths", {}).get("/erp/incomes/invoices/postInvoices", {})
    schema = endpoint.get("post", {}).get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
    
    props = schema.get("items", {}).get("properties", {})
    print("TOP LEVEL PROPERTIES:")
    for k, v in props.items():
        print(f"  {k}: {v.get('description', '')}")

    print("\nERP_LINE PROPERTIES:")
    line_props = props.get("ERP_line", {}).get("items", {}).get("properties", {})
    if not line_props:
        print("  Not found.")
    for k, v in line_props.items():
        print(f"  {k}: {v.get('description', '')}")

if __name__ == "__main__":
    extract_schema()
