import json, requests, time, biloop_client
token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY, "Content-Type": "application/json"}
def test_invoice(nif):
    inv = {
        "company_id": "E67652", "master_name": "MC Headhunting TEST", "master_nif": nif,
        "date": "2026-03-31", "SERIE": "F", "a3_reference": f"REF-{nif}-{int(time.time())}",
        "base": 13, "ordinary_vat_base": 13, "ordinary_vat_total": 2.73, "vat_total": 2.73, "total": 15.73,
        "invoice_description": "TESTING",
        "ERP_line": [{"company_id": "E67652", "product_id": 1, "product_name": "Services", "units": 1, "price": 13, "discount": 0, "vat_type_id": "ORD21"}]
    }
    r = requests.post(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices", headers=headers, json=[inv])
    print(nif, r.status_code, r.text)

test_invoice("B98765432")
test_invoice("")
