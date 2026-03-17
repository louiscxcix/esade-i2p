import requests
from biloop_client import get_auth_token, BILOOP_BASE_URL, SUBSCRIPTION_KEY

def test_token_headers():
    token = get_auth_token()
    if not token:
        print("Could not acquire token. Cannot test read access.")
        return

    url = f"{BILOOP_BASE_URL}/erp/incomes/invoices/getInvoices"
    print(f"\n--- Brute-forcing Token Header against {url} ---")

    # A list of common ways APIs expect tokens in headers
    header_variations = [
        # Standard OAuth 2.0
        {"Authorization": f"Bearer {token}"},
        {"Authorization": f"Token {token}"},
        {"Authorization": token},
        
        # Simple custom headers
        {"token": token},
        {"Token": token},
        {"access_token": token},
        {"access-token": token},
        {"x-access-token": token},
        {"x-token": token},
        {"x-api-key": token},
        
        # Biloop specific guesses based on their other endpoints
        {"user_token": token},
        {"User-Token": token}
    ]

    success = False
    
    for variation in header_variations:
        # Build the full header dictionary by merging the current variation with the required subscription key
        headers = {
            "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY,
            "Accept": "application/json"
        }
        headers.update(variation)
        
        print(f"\nTesting Header Format: {list(variation.keys())[0]}")
        
        try:
            response = requests.get(url, headers=headers)
            try:
                data = response.json()
                if data.get("status") == "OK" or response.status_code == 200 and data.get("status") != "KO":
                    print(f"SUCCESS! Biloop accepted this header format: {variation.keys()}")
                    success = True
                    break
                else:
                    print(f"Rejected: {data.get('message', 'Unknown Error')}")
            except Exception:
                print(f"Status: {response.status_code}, Text: {response.text[:100]}")
                
        except Exception as e:
            print(f"Request Error: {e}")
            
    if not success:
        print("\n=== CONCLUSION ===")
        print("Every standard header format was rejected.")
        print("This means the account 46144651G most likely does NOT have permission to access /getInvoices.")

if __name__ == "__main__":
    test_token_headers()
