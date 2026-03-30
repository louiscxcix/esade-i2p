import fitz
doc = fitz.open("test_iva_inc.pdf")
text = ""
for page in doc:
    text += page.get_text("text")

lines = text.split("\n")
table_start = -1
for i, line in enumerate(lines):
    if "Artículo" in line and "Precio" in line:
        table_start = i
        break

if table_start != -1:
    print("--- LINE ITEMS ---")
    for j in range(table_start, min(table_start+15, len(lines))):
        print(lines[j])

print("\n--- BOTTOM TOTALS ---")
for i in range(len(lines)-20, len(lines)):
    print(lines[i])
