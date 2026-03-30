import json, re

with open("api_v1.json", "r") as f:
    text = f.read().strip()
text = re.sub(r'\},[\s\n]*\][\s\n]*\}[\s\n]*$', '', text) + "}]}"

try:
    d = json.loads(text)
except:
    pass

import requests
r = requests.get("https://angulargroup.biloop.es/api-global/v1/openapi.json")
if r.status_code == 200:
    s = r.json()
    props = s["paths"]["/erp/incomes/invoices/postInvoices"]["post"]["requestBody"]["content"]["application/json"]["schema"]["items"]["properties"]
    print("Props:", list(props.keys()))
