import requests, time, biloop_client
token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY, "Content-Type": "application/json"}
def get_pdf(inv):
    r = requests.post(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices", headers=headers, json=[inv])
    print("POST", r.text)
    time.sleep(3)
    ref = inv["a3_reference"]
    get_res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices?company_id=E67652&a3_reference={ref}", headers=headers)
    data = get_res.json()
    if data.get('data'):
        doc_id = data['data'][0].get('id') or data['data'][0].get('document_id')
        pdf_res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary?document_id={doc_id}&document_type=FV&company_id=E67652", headers=headers)
        with open("test_iva_hack.pdf", "wb") as f: f.write(pdf_res.content)
        print("Saved pdf to test_iva_hack.pdf")

inv = {
    "company_id": "E67652", "master_name": "MC Headhunting", "master_nif": "B67509521",
    "date": "2026-03-31", "SERIE": "F", "a3_reference": "REF-"+str(time.time()),
    "base": 12.10, "total": 12.10,
    "invoice_description": "Use literal spreadsheet data",
    "ERP_line": [
        {"company_id": "E67652", "product_id": 1, "real_product_id": "1", "product_name": "Chief of Staff", "units": 1, "price": 10.00, "discount": 0, "vat_type_id": "EXENTO"},
        {"company_id": "E67652", "product_id": 1, "real_product_id": "2", "product_name": "IVA Calculation (From Spreadsheet)", "units": 1, "price": 2.10, "discount": 0, "vat_type_id": "EXENTO"}
    ]
}
get_pdf(inv)
