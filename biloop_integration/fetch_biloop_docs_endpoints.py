import json
import requests
import sys
import time

# Import credentials from existing client
import biloop_client

BILOOP_BASE_URL = biloop_client.BILOOP_BASE_URL
SUBSCRIPTION_KEY = biloop_client.SUBSCRIPTION_KEY

def test_new_endpoints():
    token = biloop_client.get_auth_token()
    if not token:
        print("Failed to get token.")
        sys.exit(1)

    headers = {
        "token": token,
        "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY,
        "Content-Type": "application/json"
    }

    print("\n--- Testing Newly Discovered API Docs Endpoints ---")
    
    # Let's see if we can get the company ID first
    company_test_url = f"{BILOOP_BASE_URL}/getCompanies"
    print(f"\nTrying GET {company_test_url}")
    company_id = None
    try:
        resp = requests.get(company_test_url, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if data.get('data') and isinstance(data['data'], list) and len(data['data']) > 0:
                print("Found Companies:")
                print(json.dumps(data['data'], indent=2, ensure_ascii=False)[:500])
                # Extract first company_id if possible
                first_comp = data['data'][0]
                company_id = first_comp.get('id') or first_comp.get('id_empresa') or first_comp.get('companyId')
    except Exception as e:
        print(f"Error fetching companies: {e}")
        
    print(f"\nExtracted Company ID based on getCompanies: {company_id}")

    endpoints_to_try = [
        "/accounting/getInvoices",
        "/billing/getERPIssuedInvoices",
        "/billing/getERPInvoices",
        "/erp/getMyInvoices",
        "/erp/incomes/invoices/getInvoices"
    ]
    
    for ep in endpoints_to_try:
        url = f"{BILOOP_BASE_URL}{ep}"
        print(f"\n----------------------------------------")
        print(f"Trying GET {url}")
        
        # We will try both with and without company_id if we have one
        params = {}
        if company_id:
            params['company_id'] = company_id
            params['id_empresa'] = company_id
            
        try:
            # We use 15 seconds timeout because Biloop can be slow to return giant lists
            resp = requests.get(url, headers=headers, params=params if company_id else None, timeout=15)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    
                    if data.get('data') and isinstance(data['data'], list):
                        records = data['data']
                        print(f"Success! Found {len(records)} records.")
                        if len(records) > 0:
                            print("\n=== SAMPLE RECORD STRUCT ===")
                            print(json.dumps(records[0], indent=2, ensure_ascii=False))
                            return # We got what we needed!
                    elif data.get('data'):
                        print("Success! Data content:")
                        print(json.dumps(data['data'], indent=2, ensure_ascii=False)[:1000])
                    else:
                         print(f"Response but no data: {json.dumps(data)}")
                         
                except Exception as ex:
                    print("Could not parse JSON.", ex)
            else:
                try:
                    print(f"Error body: {resp.json()}")
                except:
                    pass
        except requests.exceptions.Timeout:
            print("Request Timed Out (15s)")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    test_new_endpoints()
