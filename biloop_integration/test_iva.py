import requests, time, biloop_client
token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY, "Content-Type": "application/json"}
def get_pdf(inv):
    r = requests.post(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices", headers=headers, json=[inv])
    print(r.text)
    time.sleep(3)
    ref = inv["a3_reference"]
    get_res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=E67652&a3_reference={ref}", headers=headers)
    data = get_res.json()
    if data.get('data'):
        doc_id = data['data'][0].get('id') or data['data'][0].get('document_id')
        pdf_res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary?document_id={doc_id}&document_type=FV&company_id=E67652", headers=headers)
        with open("test_iva.pdf", "wb") as f: f.write(pdf_res.content)
        print("Saved pdf.")

inv = {
    "company_id": "E67652", "master_name": "MC Headhunting", "master_nif": "X0000000T",
    "date": "2026-03-31", "SERIE": "F", "a3_reference": "REF-"+str(time.time()),
    "base": 13, "ordinary_vat_base": 13, "ordinary_vat_total": 3, "vat_total": 3, "total": 16,
    "invoice_description": "TESTING",
    "ERP_line": [
        {"company_id": "E67652", "product_id": 1, "real_product_id": "1", "product_name": "Services", "units": 1, "price": 13, "discount": 0}
    ]
}
get_pdf(inv)
