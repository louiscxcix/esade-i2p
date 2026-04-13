import { fetchInvoiceData } from '../lib/sheets.mjs';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkHeaders() {
   try {
       const data = await fetchInvoiceData();
       if (data && data.length > 0) {
           console.log(Object.keys(data[0]));
           console.log(data[0]);
       } else {
           console.log("No data returned or empty.");
       }
   } catch(e) {
       console.log(e);
   }
}
checkHeaders();
