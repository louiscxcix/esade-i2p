import requests
from biloop_client import get_auth_token, BILOOP_BASE_URL, SUBSCRIPTION_KEY

def test_company_ids():
    token = get_auth_token()
    if not token:
        print("Could not acquire token.")
        return

    url = f"{BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices"
    print(f"\n--- Brute-Forcing Company IDs ---")

    headers = {
        "token": token,
        "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY,
        "Accept": "application/json"
    }

    import concurrent.futures
    import threading

    found = False
    lock = threading.Lock()

    def check_id(cid):
        nonlocal found
        if found: return
        try:
            response = requests.get(url, headers=headers, params={"company_id": cid}, timeout=10)
            if "Empresa suministrada no existente" not in response.text:
                with lock:
                    if not found:
                        found = True
                        print(f"\n>>> SUCCESS! Found valid company_id: {cid} <<<")
                        print(f"Status: {response.status_code}")
                        print(f"Response: {response.text[:500]}")
        except Exception:
            pass

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        for i in range(1, 1000):
            executor.submit(check_id, i)

    if not found:
        print("\nFinished brute-force up to 1000. No valid company_id found.")

if __name__ == "__main__":
    test_company_ids()
