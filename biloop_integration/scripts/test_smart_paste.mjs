/**
 * Simulated test for the processSmartPaste logic from index.html
 */

function toISODate(val) {
    if (!val) return "";
    val = String(val).trim();
    const parts = val.match(/(\d{1,4})/g);
    if (!parts || parts.length < 3) return "";

    let day, month, year;
    if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1].padStart(2, '0');
        day = parts[2].padStart(2, '0');
    } else {
        day = parts[0].padStart(2, '0');
        month = parts[1].padStart(2, '0');
        year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    }
    return `${year}-${month}-${day}`;
}

const userText = `
Cliente	Candidato	Posición	Fecha Factura	Fecha Est. Pago
Editable
Importe	Estado	Fecha Pago
Editable

MC Recruiting	Michele de Marzo	CFO	
02/02/2026

12/12/2026
€ 22	

Inminente
`;

function testParser(text) {
    const allTokens = text.split(/\s{2,}|\t|\n+/).map(t => t.trim()).filter(t => t.length > 0);
    const headersToIgnore = ['cliente', 'candidato', 'posición', 'posicion', 'fecha factura', 'fecha est. pago', 'importe', 'estado', 'fecha pago', 'editable'];
    const tokens = allTokens.filter(t => !headersToIgnore.includes(t.toLowerCase()));

    let client = "", candidate = "", position = "", date = "", estDate = "", amount = "", status = "";
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
    const amountRegex = /(?:€|\$|EUR|USD)?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:\.\d{2})?)/;

    tokens.forEach(t => {
        if (dateRegex.test(t)) {
            const iso = toISODate(t);
            if (!date) date = iso;
            else if (!estDate) estDate = iso;
        } else if (amountRegex.test(t) && t.includes('€')) {
            const matched = t.match(amountRegex);
            if (matched) {
                let val = matched[1].replace(/\./g, '').replace(',', '.');
                amount = val;
            }
        } else if (['pendiente', 'cobrado', 'inminente', 'vencido', 'paid', 'pending', 'overdue'].includes(t.toLowerCase())) {
            status = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        } else {
             if (!client && (!candidate || t.toLowerCase().includes('recruiting') || t.toLowerCase().includes('s.l') || t.toLowerCase().includes('s.a'))) {
                client = t;
            } else if (!candidate && (t.split(' ').length >= 2)) {
                candidate = t;
            } else if (!position && t.length < 30) {
                position = t;
            }
        }
    });

    return { client, candidate, position, date, estDate, amount, status };
}

console.log("Parsed result:", testParser(userText));
