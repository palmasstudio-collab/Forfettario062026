import jsPDF from 'jspdf';
import { ParsedInvoice } from './xmlInvoiceParser';

export function generateInvoicePDFDocument(parsed: ParsedInvoice, originalFileName: string): File {
  const doc = new jsPDF();
  
  // Clean file name
  const safeName = originalFileName.replace('.xml', '');
  const pdfFileName = `${safeName}.pdf`;

  // Start building PDF
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text('Fattura Elettronica di Cortesia', 15, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('NB: Questo documento non ha validità fiscale. È solo una rappresentazione leggibile.', 15, 28);

  doc.line(15, 32, 195, 32);

  // Issuer
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text('Dati Emittente:', 15, 45);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(`Nome: ${parsed.issuerName || 'Non specificato'}`, 15, 53);
  doc.text(`P.IVA: ${parsed.issuerVat || 'Non specificata'}`, 15, 60);
  doc.text(`C.F.: ${parsed.issuerCf || 'Non specificato'}`, 15, 67);

  // Client
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text('Dati Cliente:', 110, 45);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(`Nome: ${parsed.clientName || 'Non specificato'}`, 110, 53);
  doc.text(`P.IVA / C.F.: ${parsed.clientVat || 'Non specificata'}`, 110, 60);

  doc.line(15, 75, 195, 75);

  // Invoice Details
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text('Dettagli Documento:', 15, 88);

  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(`Numero Fattura: ${parsed.number || 'N/A'}`, 15, 96);
  doc.text(`Data Fattura: ${parsed.date || 'N/A'}`, 15, 103);
  
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(`Totale Documento: € ${parsed.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 15, 115);

  if (parsed.hasStampDuty) {
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text('Marca da bollo applicata (2,00 €)', 15, 122);
  }

  // Causale / Note
  if (parsed.notes) {
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text('Causale / Oggetto:', 15, 135);
    
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    
    // Split text to fit page width
    const splitNotes = doc.splitTextToSize(parsed.notes, 180);
    doc.text(splitNotes, 15, 142);
  }

  // Generate Blob
  const pdfBlob = doc.output('blob');
  
  return new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
}
