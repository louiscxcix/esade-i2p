import os
import json
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

def create_invoice_pdf(invoice_data, invoice_id, output_dir="invoices"):
    """
    Creates a PDF invoice from the mapped JSON invoice data.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    if not invoice_id:
        print("Skipping PDF generation for record with no invoice ID.")
        return
        
    pdf_filename = os.path.join(output_dir, f"Invoice_{invoice_id}.pdf")
    
    doc = SimpleDocTemplate(pdf_filename, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
    styles = getSampleStyleSheet()
    
    # Custom styles
    right_align_style = ParagraphStyle(name="RightAlign", parent=styles['Normal'], alignment=TA_RIGHT)
    title_style = styles['Heading1']
    title_style.alignment = TA_CENTER
    
    elements = []
    
    # Header: Company details (Mocked for now)
    elements.append(Paragraph("<b>YOUR COMPANY NAME</b>", title_style))
    elements.append(Paragraph("123 Business Rd, City, Country", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Invoice Details
    elements.append(Paragraph(f"<b>INVOICE #{invoice_id}</b>", styles['Heading2']))
    elements.append(Paragraph(f"<b>Date:</b> {invoice_data.get('Fecha Factura', '')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Bill To
    elements.append(Paragraph("<b>BILL TO:</b>", styles['Heading3']))
    elements.append(Paragraph(f"{invoice_data.get('Cliente', '')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Content Table
    cand_name = invoice_data.get('Candidato', '')
    position = invoice_data.get('Proceso', '')
    
    # Define table data
    table_data = [
        ["Description", "Amount (EUR)"],
        [f"Recruitment Fee for {position}\n({cand_name})", f"{invoice_data.get('Importe factura', 0):,.2f}"],
    ]
    
    # Create main table
    t = Table(table_data, colWidths=[350, 100])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    elements.append(t)
    elements.append(Spacer(1, 20))
    
    # Totals Section
    totals_data = [
        ["Subtotal:", f"EUR {invoice_data.get('Factura neta', 0):,.2f}"],
        ["VAT/IVA:", f"EUR {invoice_data.get('IVA', 0):,.2f}"],
        ["TOTAL DUE:", f"EUR {invoice_data.get('Importe Cobro', 0):,.2f}"]
    ]
    
    totals_table = Table(totals_data, colWidths=[350, 100])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.firebrick),
    ]))
    
    elements.append(totals_table)
    elements.append(Spacer(1, 40))
    
    # Footer
    elements.append(Paragraph("Thank you for your business!", title_style))
    elements.append(Paragraph("Payment Terms: Please pay within 30 days of the invoice date.", styles['Normal']))
    elements.append(Paragraph("Bank Details: IBAN XX00 0000 0000 0000 0000 00", styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    print(f"Generated PDF: {pdf_filename}")

if __name__ == "__main__":
    # Test with generated mapped JSON
    try:
        with open("mapped_invoices.json", "r", encoding="utf-8") as f:
            invoices = json.load(f)
            
        print(f"Found {len(invoices)} invoices. Generating PDFs...")
        for idx, inv in enumerate(invoices, start=1):
            create_invoice_pdf(inv, idx)
    except FileNotFoundError:
        print("mapped_invoices.json not found. Run google_sheets_fetcher.py first.")
