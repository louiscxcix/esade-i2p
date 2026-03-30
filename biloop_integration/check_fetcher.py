import google_sheets_fetcher as gsf
df = gsf.fetch_google_sheets_data()
import json
print(json.dumps(gsf.map_to_biloop_json(df)[:2], indent=2, ensure_ascii=False))
