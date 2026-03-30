import requests, biloop_client
token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY}

res = requests.get(f"{biloop_client.BILOOP_BASE_URL}/billing/getERPCustomers?Company_id=E67652", headers=headers)
try:
    data = res.json()
    for c in data.get('data', []):
        print(c.get('trade_name'), "|", c.get('name'), "|", c.get('nif'))
except Exception as e:
    print(e, res.text)
