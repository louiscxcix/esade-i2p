const fs = require('fs');

let content = fs.readFileSync('api_v1.json', 'utf8').trim();
const lastIndex = content.lastIndexOf('}');
content = content.substring(0, lastIndex + 1);

let data;
try {
    data = JSON.parse(content);
} catch (e) {
    const fallback = content.substring(0, e.position || content.length);
    console.log("Error parsing JSON");
}

if(data) {
  const schema = data.paths['/erp/incomes/invoices/postInvoices'].post.requestBody.content['application/json'].schema.items.properties;
  
  console.log("Check for tax included or vat flags:");
  for (const [k, v] of Object.entries(schema)) {
      if (typeof v === 'object' && v !== null) {
          if(k.includes('tax') || k.includes('vat') || k.includes('inc'))
          console.log(`${k}: ${v.description ? v.description.substring(0, 100) : ''}`);
      }
  }
}
