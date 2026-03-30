import json
import requests
import sys
import time

# Import credentials from existing client
import biloop_client

BILOOP_BASE_URL = biloop_client.BILOOP_BASE_URL
SUBSCRIPTION_KEY = biloop_client.SUBSCRIPTION_KEY

def run_test():
    token = biloop_client.get_auth_token()
    if not token:
        print("Failed to get token.")
        sys.exit(1)

    headers = {
        "token": token,
        "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY,
        "Content-Type": "application/json"
    }

    print("\n--- Phase 1: Creating Fake Invoice (POST) ---")
    post_url = f"{BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices"
    
    unique_ref = "MCTEST-" + str(int(time.time()))
    print(f"Using a3_reference: {unique_ref}")

    # Build the payload based on the official OpenAPI schema
    fake_invoice = {
        "company_id": "E67652",
        "master_name": "MC Headhunting",
        "master_nif": "B12345678",
        "address": "Fake Testing Street 123",
        "date": "2026-03-30",
        "operation_date": "2026-03-30",
        "issuance_date": "2026-03-30",
        "SERIE": "F",
        "a3_reference": unique_ref,
        "invoice_description": "FAKE INVOICE FOR TESTING PURPOSES",
        
        # Financial Totals (Small amounts)
        "base": 0.10,
        "ordinary_vat_base": 0.10,
        "ordinary_vat_total": 0.02, # ~21% of 0.10
        "vat_total": 0.02,
        "total": 0.12,
        
        # Line Items
        "ERP_line": [
            {
                "company_id": "E67652",
                "product_id": 1,
                "real_product_id": "1",
                "product_name": "MC Headhunting Test Fake Services",
                "units": 1,
                "price": 0.10,
                "discount": 0,
                "vat_type_id": "ORD21"
            }
        ]
    }

    try:
        print(f"Sending payload: {json.dumps([fake_invoice], indent=2)}")
        resp = requests.post(post_url, headers=headers, json=[fake_invoice], timeout=15)
        print(f"POST Status: {resp.status_code}")
        try:
            print(f"POST Response: {resp.json()}")
        except:
            print(f"POST Response Text: {resp.text}")
            
        if resp.status_code not in (200, 201) or resp.json().get('status') == 'KO':
            print("Failed to create fake invoice. Aborting.")
            return
            
    except Exception as e:
        print(f"POST Request failed: {e}")
        return

    print("\n--- Phase 2: Wait & Fetch Invoice ID (GET) ---")
    time.sleep(3) # Give Biloop time to process the insert
    
    get_url = f"{BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices"
    doc_id = None
    
    try:
        params = {"company_id": "E67652", "a3_reference": unique_ref}
        print(f"GET params: {params}")
        get_resp = requests.get(get_url, headers=headers, params=params, timeout=15)
        print(f"GET Status: {get_resp.status_code}")
        
        if get_resp.status_code == 200:
            data = get_resp.json()
            if data.get('data') and len(data['data']) > 0:
                created_invoice = data['data'][0]
                doc_id = created_invoice.get('id') or created_invoice.get('document_id')
                print(f"Successfully retrieved new invoice! Document ID: {doc_id}")
            else:
                print("Could not find the invoice by a3_reference.")
        else:
             print("GET failed.")
    except Exception as e:
        print(f"GET Request failed: {e}")
        
    if not doc_id:
        print("No document ID found. Aborting PDF fetch.")
        return
        
    print("\n--- Phase 3: Fetching PDF Binary ---")
    pdf_url = f"{BILOOP_BASE_URL}/erp/pendingDocuments/pendingBinary/getPendingBinary"
    try:
        pdf_params = {"document_id": doc_id, "document_type": "FV", "company_id": "E67652"}
        print(f"Calling PDF GET with params: {pdf_params}")
        pdf_resp = requests.get(pdf_url, headers=headers, params=pdf_params, timeout=15)
        print(f"PDF GET Status: {pdf_resp.status_code}")
        
        if pdf_resp.status_code == 200:
            content_type = pdf_resp.headers.get("Content-Type", "")
            if "pdf" in content_type.lower() or "octet-stream" in content_type.lower() or pdf_resp.content.startswith(b"%PDF"):
                file_name = f"fake_mc_headhunting_{unique_ref}.pdf"
                with open(file_name, "wb") as f:
                    f.write(pdf_resp.content)
                print(f"✅ Success! Saved PDF to {file_name}")
            else:
                print("Response does not look like a PDF. Response Snippet:")
                print(pdf_resp.text[:500])
        else:
            print("Failed to download PDF.")
    except Exception as e:
        print(f"PDF Fetch failed: {e}")

if __name__ == "__main__":
    run_test()
