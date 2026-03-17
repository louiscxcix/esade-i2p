import requests
import json

BASE_URL = "https://angulargroup.biloop.es/api-global/v1"
SUBSCRIPTION_KEY = "64ae70d3-026a-4969-8123-c4aa6cf4f1e1"
USER = "46144651G"
PASSWORD = "Q0JXVxfuNY"

def get_token():
    url = f"{BASE_URL}/token"
    print(f"Requesting token from {url} via GET")
    
    attempts = [
        {"USER": USER, "PASSWORD": PASSWORD, "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY},
        {"user": USER, "password": PASSWORD, "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY},
        {"Usuario": USER, "Contrasena": PASSWORD, "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY},
        {"Username": USER, "Password": PASSWORD, "SUBSCRIPTION_KEY": SUBSCRIPTION_KEY}
    ]
    
    for headers in attempts:
        print(f"\nAttempt Headers: {headers}")
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
        except Exception as e: print(e)
        
    print("\nAttempt Query Params (Uppercase)")
    try:
        response = requests.get(url, params={"USER": USER, "PASSWORD": PASSWORD})
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e: print(e)

if __name__ == "__main__":
    get_token()
