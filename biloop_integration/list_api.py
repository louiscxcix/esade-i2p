import json

with open("api_v1.json", "r") as f:
    text = f.read().strip()
    
try:
    d = json.loads(text)
except json.JSONDecodeError as e:
    text = text[:e.pos]
    text = text[:text.rfind('}')+1] + "}"
    d = json.loads(text)

endpoints = d.get("paths", {}).keys()
print('\n'.join([p for p in endpoints if "client" in p.lower() or "master" in p.lower()]))
