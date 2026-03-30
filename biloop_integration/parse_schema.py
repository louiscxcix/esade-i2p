import json

def extract_schema():
    with open("api_v1.json", "r") as f:
        # Read the file and strip the trailing `{}`
        content = f.read().strip()
        if content.endswith("{}"):
            content = content[:-2].strip()
        data = json.loads(content)
        
    post_invoices = data.get("paths", {}).get("/api-global/v1/erp/incomes/invoices/postInvoices", {}).get("post", {})
    
    if not post_invoices:
        print("Endpoint not found.")
        return
        
    schema_ref = None
    try:
        schema_ref = post_invoices["requestBody"]["content"]["application/json"]["schema"]["$ref"]
    except KeyError:
        print("Could not find direct schema ref in requestBody. Looking at structure...")
        print(json.dumps(post_invoices.get("requestBody", {}), indent=2))
        return
        
    print(f"Ref found: {schema_ref}")
    
    ref_path = schema_ref.lstrip("#/").split("/")
    schema = data
    for bit in ref_path:
        schema = schema.get(bit, {})
        
    print("\n=== POST INVOICES SCHEMA ===")
    print(json.dumps(schema, indent=2, ensure_ascii=False))

    if "properties" in schema:
        print("\n=== RESOLVING NESTED REFS ===")
        for prop, details in schema["properties"].items():
            if "$ref" in details:
                nested_ref = details["$ref"].lstrip("#/").split("/")
                nested = data
                for bit in nested_ref:
                    nested = nested.get(bit, {})
                print(f"\nNested Schema for {prop}:")
                print(json.dumps(nested, indent=2, ensure_ascii=False))
            elif details.get("type") == "array" and "$ref" in details.get("items", {}):
                nested_ref = details["items"]["$ref"].lstrip("#/").split("/")
                nested = data
                for bit in nested_ref:
                    nested = nested.get(bit, {})
                print(f"\nNested Schema for array {prop}:")
                print(json.dumps(nested, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    extract_schema()
