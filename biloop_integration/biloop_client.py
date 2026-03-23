import json
import requests
import os

BILOOP_BASE_URL = "https://angulargroup.biloop.es/api-global/v1"
SUBSCRIPTION_KEY = "64ae70d3-026a-4969-8123-c4aa6cf4f1e1"
USER = "46144651G"
PASSWORD = "Q0JXVxfuNY"
_cached_token = None

def get_auth_token():
    """Fetches a Bearer token from Biloop using the USER/PASSWORD headers."""
    global _cached_token
    if _cached_token:
        return _cached_token
        
    url = f"{BILOOP_BASE_URL}/token"
    headers = {
        "user": USER,
        "password": PASSWORD,
        "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY
    }
    
    print("Requesting new Biloop Authentication Token...")
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        if data.get("status") == "OK" and "token" in data.get("data", {}):
            _cached_token = data["data"]["token"]
            print("Token acquired successfully.")
            return _cached_token
        else:
            print(f"Token error: {data}")
            return None
    except Exception as e:
        print(f"Failed to fetch auth token: {e}")
        return None

def push_invoice_to_biloop(invoice_json):
    """
    Pushes the formatted invoice JSON to Biloop API using the authenticated token.
    """
    token = get_auth_token()
    if not token:
        print("Cannot push invoice. Authentication failed.")
        return False
        
    url = f"{BILOOP_BASE_URL}/erp/incomes/invoices/postInvoices"
    
    headers = {
        "token": token,
        "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY,
        "Content-Type": "application/json"
    }
    
    # We use Candidato property below since this is what we mapped the spreadsheet to.
    cand_name = invoice_json.get('Candidato', 'Unknown')
    print(f"Pushing Invoice for {cand_name} to {url}")
    
    try:
        # NOTE: Biloop might wrap the body in a specific key, or accept it as a list.
        # Sending exactly the JSON schema we built earlier.
        payload = {k: v for k, v in invoice_json.items() if not k.startswith('_')}
        response = requests.post(url, json=payload, headers=headers)
        
        # Print for debugging
        print(f"Status Code: {response.status_code}")
        try:
            resp_body = response.json()
            print(f"Response: {resp_body}")
            if resp_body.get('status') == 'KO':
                return False
        except:
             print(f"Response (text): {response.text}")
             
        response.raise_for_status()
        print("Successfully pushed to Biloop!")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Error pushing to Biloop: {e}")
        return False

if __name__ == "__main__":
    # Test auth alone
    print("--- Testing Auth Token ---")
    get_auth_token()
