import json
import requests
import sys

# Import credentials from existing client
import biloop_client

BILOOP_BASE_URL = biloop_client.BILOOP_BASE_URL
SUBSCRIPTION_KEY = biloop_client.SUBSCRIPTION_KEY

def test_fetch_endpoints():
    token = biloop_client.get_auth_token()
    if not token:
        print("Failed to get token.")
        sys.exit(1)

    headers = {
        "token": token,
        "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY,
        "Content-Type": "application/json"
    }

    print("\n--- Testing GET Endpoints ---")
    
    endpoints_to_try = [
        "/erp/incomes/invoices",
        "/erp/incomes/invoices/getInvoices",
        "/erp/incomes/invoices/list",
        "/invoices"
    ]
    
    for ep in endpoints_to_try:
        url = f"{BILOOP_BASE_URL}{ep}"
        print(f"\nTrying GET {url}")
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    print(f"Success! Response keys: {data.keys()}")
                    if data.get('data') and isinstance(data['data'], list) and len(data['data']) > 0:
                        print("Found sample invoice:")
                        print(json.dumps(data['data'][0], indent=2, ensure_ascii=False))
                        return
                    elif data.get('data'):
                        print("Data content:")
                        print(json.dumps(data['data'], indent=2, ensure_ascii=False)[:1000])
                        return
                except:
                    print("Could not parse JSON. Text snippet:")
                    print(resp.text[:500])
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    test_fetch_endpoints()
