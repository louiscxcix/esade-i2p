import requests, json, biloop_client, time

token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY, "Content-Type": "application/json"}

# 1. Create client
nif = "X88877765"
client_data = [{
    "company_id": "E67652",
    "name": "MC Headhunting",
    "business_name": "MC Headhunting",
    "nif": nif,
    "email": "test@mcheadhunting.com"
}]
res = requests.post(f"{biloop_client.BILOOP_BASE_URL}/erp/masters/clients/postClients", headers=headers, json=client_data)
print("CREATE CLIENT:", res.text)

time.sleep(2)

# 2. Create invoice
inv = {
    "company_id": "E67652", "master_name": "MC Headhunting", "master_nif": nif,
    "date": "2026-03-31", "SERIE": "F", "a3_reference": "REF-"+str(time.time()),
    "base": 13.00, "ordinary_vat_base": 13.00, "ordinary_vat_total": 3.00, "vat_total": 3.00, "total": 16.00,
    "ERP_line": [
        {"company_id": "E67652", "product_id": 1, "real_product_id": "1", "product_name": "Services", "units": 1, "price": 16, "discount": 0, "vat_type_id": "EXENTO"}
    ]
}
r = requests.post(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices", headers=headers, json=[inv])
print("CREATE INVOICE:", r.text)

