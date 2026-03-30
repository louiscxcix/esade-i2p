const fs = require('fs');

try {
  let content = fs.readFileSync('api_v1.json', 'utf8').trim();
  // Find the last valid closing brace for the main object
  const lastIndex = content.lastIndexOf('}');
  content = content.substring(0, lastIndex + 1);
  
  // This might still throw if there are trailing commas or unbalanced braces,
  // but let's try a naive parse. If it fails, we'll use regex to extract the schema.
  
  let data;
  try {
      data = JSON.parse(content);
  } catch (e) {
      // If parse fails because of truncation, just extract the postInvoices block via regex
      console.log("JSON Parse failed, falling back to regex extraction");
      const postInvoicesMatch = content.match(/"\/erp\/incomes\/invoices\/postInvoices":\s*\{([\s\S]*?)(?="\/[a-z])/);
      if (postInvoicesMatch) {
          console.log("Found postInvoices block!");
      }
      process.exit(1);
  }
  
  const postInvoices = data.paths['/erp/incomes/invoices/postInvoices'];
  if (!postInvoices) {
      console.log("Endpoint not found");
      process.exit(1);
  }
  
  const schema = postInvoices.post.requestBody.content['application/json'].schema;
  const props = schema.items.properties;
  
  console.log("--- TOP LEVEL ---");
  for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'object' && v !== null) {
          console.log(`${k}: ${v.type} - ${v.description ? v.description.substring(0, 100) : ''}`);
      }
  }
  
  const lineProps = props.ERP_line.items.properties;
  console.log("\n--- LINE ITEMS ---");
  for (const [k, v] of Object.entries(lineProps)) {
      if (typeof v === 'object' && v !== null) {
          console.log(`${k}: ${v.type} - ${v.description ? v.description.substring(0, 100) : ''}`);
      }
  }
  
} catch (err) {
  console.error(err);
}
