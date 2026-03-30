import requests, time, biloop_client
token = biloop_client.get_auth_token()
headers = {"token": token, "SUBSCRIPTION_KEY": biloop_client.SUBSCRIPTION_KEY, "Content-Type": "application/json"}

# 1. Create client
nif = "X88877765"
client_data = {
  "postERPCustomers": {
    "company_id": "E67652",
    "name": "MC Headhunting",
    "trade_name": "MC Headhunting",
    "nif": nif,
    "email": "test@mcheadhunting.com"
  }
}
res = requests.post(f"{biloop_client.BILOOP_BASE_URL}/billing/postERPCustomers", headers=headers, json=client_data)
print("CREATE CLIENT:", res.text)
