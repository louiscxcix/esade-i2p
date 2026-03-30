import json, requests, time, biloop_client
token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY, "Content-Type": "application/json"}
def test_invoice(cand_name, price, total):
    nif = "B77788899"
    ref = f"REF-{int(time.time()*100)}"
    inv = {
        "company_id": "E67652", "master_name": cand_name, "master_nif": nif,
        "date": "2026-03-31", "SERIE": "F", "a3_reference": ref,
        "base": price, "ordinary_vat_base": price, "ordinary_vat_total": total-price, "vat_total": total-price, "total": total,
        "invoice_description": "TESTING",
        "ERP_line": [
            {"company_id": "E67652", "product_id": 1, "real_product_id": "1", "product_name": "Chief of Staff", "units": 1, "price": price, "discount": 0, "vat_type_id": "ORD21"}
        ]
    }
    r = requests.post(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices", headers=headers, json=[inv])
    print("POST", r.status_code, r.text)
    time.sleep(3)
    get_res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=E67652&a3_reference={ref}", headers=headers)
    data = get_res.json()
    if data.get('data'):
        doc_id = data['data'][0].get('id') or data['data'][0].get('document_id')
        pdf_res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary?document_id={doc_id}&document_type=FV&company_id=E67652", headers=headers)
        with open("test_pdf.pdf", "wb") as f:
            f.write(pdf_res.content)
        print("PDF saved to test_pdf.pdf")

test_invoice("MC Headhunting REAL", 13, 16)
