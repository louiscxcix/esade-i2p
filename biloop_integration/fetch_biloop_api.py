import requests
r = requests.get("https://angulargroup.biloop.es/api-global/v1/openapi.json")
if r.status_code == 200:
    s = r.json()
    props = s["paths"]["/erp/incomes/invoices/postInvoices"]["post"]["requestBody"]["content"]["application/json"]["schema"]["items"]["properties"]
    print("TOP LEVEL:")
    for k, v in props.items():
        if isinstance(v, dict):
            print(f"- {k}: {v.get('type')} - {v.get('description', '')[:60]}")
    
    line_props = props["ERP_line"]["items"]["properties"]
    print("\nLINE LEVEL:")
    for k, v in line_props.items():
        if isinstance(v, dict):
            print(f"- {k}: {v.get('type')} - {v.get('description', '')[:60]}")
