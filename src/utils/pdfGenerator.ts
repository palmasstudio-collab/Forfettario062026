/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { BusinessProfile, Invoice, TaxReturnCalculation, AtecoCode, PensionFundConfig } from '../types';

export function generateTaxAndInvoicePDF(
  profile: BusinessProfile,
  invoices: Invoice[],
  results: TaxReturnCalculation,
  selectedAteco: AtecoCode,
  selectedFund: PensionFundConfig,
  yearOfActivity: number
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Base configurations
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const marginX = 15;
  let currentY = 15;

  // Primary colors matching the professional web design
  const primaryColor = [15, 23, 42]; // slate-900 (deep charcoal)
  const secondaryColor = [16, 185, 129]; // emerald-500 (emerald green)
  const grayColor = [100, 116, 139]; // slate-500 (mid slate)
  const lightGrayColor = [248, 250, 252]; // slate-50 (very soft off-white background)

  // Header template helper
  const addHeader = (title: string, subtitle?: string) => {
    // Top colored accents bar
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(marginX, currentY - 5, pageWidth - (2 * marginX), 1.5, 'F');
    currentY += 2;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(title, marginX, currentY);
    currentY += 5;
    
    if (subtitle) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(subtitle, marginX, currentY);
      currentY += 6;
    }

    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(marginX, currentY, pageWidth - marginX, currentY);
    currentY += 10;
  };

  const drawSectionTitle = (title: string) => {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(title, marginX, currentY);
    currentY += 1.5;
    
    doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.setLineWidth(1.0);
    doc.line(marginX, currentY, marginX + 22, currentY);
    currentY += 6;
  };

  const drawRow = (label: string, value: string, isHeader = false, customY?: number): number => {
    const activeY = customY || currentY;
    if (isHeader) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    } else {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    }
    
    doc.text(label, marginX, activeY);
    doc.setFont('Helvetica', 'bold');
    doc.text(value, pageWidth - marginX, activeY, { align: 'right' });
    
    if (!customY) {
      currentY += 5.5;
    }
    return activeY;
  };

  // ==========================================
  // PAGE 1: REPORT FISCALE E SIMULAZIONE DETTAGLIATA
  // ==========================================
  addHeader('REPORT FISCALE FORFETTARIO COMPLETO', `Generato il ${new Date().toLocaleDateString('it-IT')} - Simulatore d'Imposta Consolidato`);

  // Sezione 1: Profilo Professionista
  drawSectionTitle('Configurazione della Posizione Contabile');
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  
  const leftColX = marginX;
  const rightColX = pageWidth / 2 + 5;
  let infoY = currentY;

  // Background card styling for Profile
  doc.setFillColor(lightGrayColor[0], lightGrayColor[1], lightGrayColor[2]);
  doc.setDrawColor(241, 245, 249); // slate-100
  doc.roundedRect(marginX, infoY - 2, pageWidth - 2 * marginX, 28, 3, 3, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.text('Dettagli del Contribuente', leftColX + 4, infoY + 4);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Nominativo: ${profile.fullName || 'Mario Rossi'}`, leftColX + 4, infoY + 10);
  doc.text(`Partita IVA: ${profile.vatNumber || 'Non impostata'}`, leftColX + 4, infoY + 16);
  doc.text(`Codice ATECO: ${profile.atecoCode} (Coeff. ${(selectedAteco.coefficient * 100).toFixed(0)}%)`, leftColX + 4, infoY + 22);

  doc.setFont('Helvetica', 'bold');
  doc.text('Regime / Cassa', rightColX + 4, infoY + 4);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Cassa: ${selectedFund.name}`, rightColX + 4, infoY + 10);
  doc.text(`Regime: ${profile.isStartup ? 'Startup Agevolata (Aliquota 5%)' : 'Ordinario (Aliquota 15%)'}`, rightColX + 4, infoY + 16);
  doc.text(`Anzianità d'Impresa: ${yearOfActivity}° Anno di Attività`, rightColX + 4, infoY + 22);

  currentY = infoY + 34;

  // Sezione 2: Riepilogo Finanziario Calcolato
  drawSectionTitle('Riconciliazione Fiscale e Redditività Netta');

  // Draw background box for main totals
  doc.setFillColor(lightGrayColor[0], lightGrayColor[1], lightGrayColor[2]);
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(marginX, currentY, pageWidth - 2 * marginX, 58, 3, 3, 'FD');
  
  let boxY = currentY + 6;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  
  // Highlight Netto Consolidato
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('NETTO CONSOLIDATO STIMATO IN TASCA:', marginX + 5, boxY);
  doc.text(`€ ${results.netIncome.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY, { align: 'right' });
  doc.setFontSize(9.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(marginX + 5, boxY + 3, pageWidth - marginX - 5, boxY + 3);
  
  boxY += 9;
  doc.setFont('Helvetica', 'normal');
  doc.text('Fatturato Lordo Incassato (Principio di Cassa Corrente):', marginX + 5, boxY);
  doc.setFont('Helvetica', 'bold');
  doc.text(`€ ${results.grossRevenue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY, { align: 'right' });
  doc.setFont('Helvetica', 'normal');

  boxY += 6;
  doc.text(`Reddito Imponibile Lordo (Lordo x Coefficiente di Redditività):`, marginX + 5, boxY);
  doc.setFont('Helvetica', 'bold');
  doc.text(`€ ${results.grossTaxableIncome.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY, { align: 'right' });
  doc.setFont('Helvetica', 'normal');

  boxY += 1;
  boxY += 5;
  doc.text("Contributi Previdenziali Versati nell'Anno (Cassa/Dedotti):", marginX + 5, boxY);
  doc.setFont('Helvetica', 'bold');
  doc.text(`- € ${results.deductibleContributions.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY, { align: 'right' });
  doc.setFont('Helvetica', 'normal');

  boxY += 6;
  doc.text('Reddito Imponibile Netto Sostitutivo (Base Imponibile Reale):', marginX + 5, boxY);
  doc.setFont('Helvetica', 'bold');
  doc.text(`€ ${results.netTaxableIncome.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY, { align: 'right' });
  doc.setFont('Helvetica', 'normal');

  boxY += 7;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(marginX + 5, boxY - 1, pageWidth - marginX - 5, boxY - 1);

  // Imposte e contributi correnti
  doc.setTextColor(225, 29, 72); // rose-600
  doc.text(`Imposta Sostitutiva Dovuta col. LM39 (${(results.taxRate * 100).toFixed(0)}%):`, marginX + 5, boxY + 3);
  doc.setFont('Helvetica', 'bold');
  doc.text(`€ ${results.substituteTax.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY + 3, { align: 'right' });
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(37, 99, 235); // blue-600

  doc.text('Contributi Previdenziali Correnti dovuti (Anno Corrente):', marginX + 5, boxY + 9);
  doc.setFont('Helvetica', 'bold');
  doc.text(`€ ${results.currentYearContributions.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - marginX - 5, boxY + 9, { align: 'right' });
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

  currentY += 66;

  // Sezione 3: Quadro LM Simulato
  drawSectionTitle('Determinazione Righi Redditi Persone Fisiche (LM/RR)');
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  
  const drawQuadroRow = (label: string, field: string, value: string) => {
    // Alternating rows separator line
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.25);
    doc.line(marginX, currentY + 1.5, pageWidth - marginX, currentY + 1.5);
    currentY += 4.5;

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(field, marginX + 1, currentY);
    
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text(label, marginX + 40, currentY);
    
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(value, pageWidth - marginX - 1, currentY, { align: 'right' });
  };

  drawQuadroRow('Codice Attività ATECO compilato', 'LM22 col. 1', profile.atecoCode);
  drawQuadroRow('Coefficiente di Redditività associato', 'LM22 col. 2', `${(selectedAteco.coefficient * 100).toFixed(0)}%`);
  drawQuadroRow('Ricavi Totali Dichiarati (Fatturato)', 'LM22 col. 3', `€ ${results.grossRevenue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
  drawQuadroRow('Reddito Imponibile Lordo', 'LM34', `€ ${results.grossTaxableIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
  drawQuadroRow('Contributi previdenziali deducibili per cassa', 'LM35', `€ ${results.deductibleContributions.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
  drawQuadroRow('Reddito Imponibile Netto Autonomo', 'LM36', `€ ${results.netTaxableIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
  drawQuadroRow(`Imposta Sostitutiva Dovuta (${(results.taxRate * 100).toFixed(0)}%)`, 'LM39 col. 1', `€ ${results.substituteTax.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
  
  if (results.isSectionI) {
    drawQuadroRow('Reddito d\'impresa', 'RR2 col. 1', `€ ${results.rr2Col1?.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}`);
    drawQuadroRow('Reddito minimale', 'RR2 col. 2', `€ ${results.rr2Col2?.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}`);
    drawQuadroRow('Contributi IVS dovuti sul minimale', 'Contributi IVS', `€ ${results.contributiIVSMinimale?.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}`);
    
    const excessIncome = results.redditoEccedenteMinimale || 0;
    const excessContr = results.contributiEccedenteMinimale || 0;
    
    // Output empty or 0 if Gross Taxable Income is <= the 2025 minimale
    drawQuadroRow('Reddito eccedente il minimale', 'Eccedenza col. 1', excessIncome > 0 ? `€ ${excessIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '0,00');
    drawQuadroRow('Contributi eccedenti il minimale', 'Eccedenza col. 2', excessContr > 0 ? `€ ${excessContr.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '0,00');
  } else {
    drawQuadroRow(`Cassa di Appartenenza con aliquota ${(selectedFund.rate * 100).toFixed(2)}%`, 'RR Sez. II', selectedFund.id);
    drawQuadroRow('Base Imponibile dei Contributi Quadro RR', 'RR col. 4', `€ ${results.grossTaxableIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
    drawQuadroRow(`Quota di Contribuzione Previdenziale Corrente`, 'RR col. 5', `€ ${results.currentYearContributions.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`);
  }

  // Footer visual template on page 1
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
  doc.text(`Regime Forfettario 2026  |  Codice Backup Cloud: ${profile.vatNumber || 'Simulatore'}`, marginX, pageHeight - 10);
  doc.text('Pagina 1 di 2', pageWidth - marginX, pageHeight - 10, { align: 'right' });

  // ==========================================
  // PAGE 2: ARCHIVIO GENERALE FATTURE EMESSE
  // ==========================================
  doc.addPage();
  currentY = 15;
  addHeader('REGISTRO CRONOLOGICO FATTURE ATTIVE', `Storico Documenti Commerciali Anno 2026 - ${profile.fullName}`);

  drawSectionTitle('Riepilogo Avanzato ed Efficacia Finanziaria');
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalPaid = invoices.filter(inv => inv.isPaid).reduce((sum, inv) => sum + inv.amount, 0);
  const totalUnpaid = totalInvoiced - totalPaid;
  const totalStamps = invoices.filter(inv => inv.hasStampDuty).length * 2.0;

  drawRow('Totale Fatturato Emesso complessivamente (Lordo):', `€ ${totalInvoiced.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  drawRow('Totale Incassato (Base Imponibile Effettiva - Cassa):', `€ ${totalPaid.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  drawRow('Totale in Attesa di Pagamento (Credito in essere):', `€ ${totalUnpaid.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  drawRow('Imposta di Bollo Virtuale dovuta sui righi (2,00 € cad.):', `€ ${totalStamps.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  currentY += 8;

  drawSectionTitle('Elenco Dettagliato delle Operazioni');

  if (invoices.length === 0) {
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text('Nessun record di fatturazione registrato all\'interno di questa posizione contabile.', marginX, currentY);
  } else {
    // Generate simple custom table headers with flat-dark design
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(marginX, currentY, pageWidth - 2 * marginX, 6.5, 'F');
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    
    let tableY = currentY + 4.5;
    doc.text('ID FATTURA', marginX + 3, tableY);
    doc.text('DATA INCASSO', marginX + 26, tableY);
    doc.text('CLIENTE / RAGIONE SOCIALE', marginX + 50, tableY);
    doc.text('NETTO BASE (€)', pageWidth - marginX - 44, tableY, { align: 'right' });
    doc.text('BOLLO', pageWidth - marginX - 25, tableY, { align: 'right' });
    doc.text('STATO REGOLAMENTO', pageWidth - marginX - 3, tableY, { align: 'right' });
    
    currentY += 6.5;

    doc.setFontSize(8);
    invoices.forEach((inv, idx) => {
      // Check for page overflow
      if (currentY > pageHeight - 20) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Segue su pagina successiva...', pageWidth - marginX, pageHeight - 10, { align: 'right' });
        
        doc.addPage();
        currentY = 15;
        addHeader('REGISTRO CRONOLOGICO (Continua)', `Storico Documenti Commerciali Anno 2026 - ${profile.fullName}`);
        
        // Redraw table headers on new page
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(marginX, currentY, pageWidth - 2 * marginX, 6.5, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        tableY = currentY + 4.5;
        doc.text('ID FATTURA', marginX + 3, tableY);
        doc.text('DATA INCASSO', marginX + 26, tableY);
        doc.text('CLIENTE / RAGIONE SOCIALE', marginX + 50, tableY);
        doc.text('NETTO BASE (€)', pageWidth - marginX - 44, tableY, { align: 'right' });
        doc.text('BOLLO', pageWidth - marginX - 25, tableY, { align: 'right' });
        doc.text('STATO REGOLAMENTO', pageWidth - marginX - 3, tableY, { align: 'right' });
        currentY += 6.5;
      }

      // Alternating row styling
      doc.setDrawColor(241, 245, 249);
      if (idx % 2 === 0) {
        doc.setFillColor(252, 253, 254);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(marginX, currentY, pageWidth - 2 * marginX, 7, 'F');
      
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      tableY = currentY + 4.8;
      
      // Invoice No
      doc.text(inv.number, marginX + 3, tableY);
      
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      
      // Date
      const formattedDate = new Date(inv.date).toLocaleDateString('it-IT');
      doc.text(formattedDate, marginX + 26, tableY);
      
      // Client Name and VAT
      let clientText = inv.clientName;
      if (inv.clientVat) {
        clientText += ` (P.IVA: ${inv.clientVat})`;
      }
      if (clientText.length > 34) {
        clientText = clientText.substring(0, 31) + '...';
      }
      doc.text(clientText, marginX + 50, tableY);
      
      // Amount
      doc.text(`€ ${inv.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, pageWidth - marginX - 44, tableY, { align: 'right' });
      
      // Stamp duty
      const stampText = inv.hasStampDuty ? '2,00 €' : '-';
      doc.text(stampText, pageWidth - marginX - 25, tableY, { align: 'right' });
      
      // Status
      if (inv.isPaid) {
        doc.setTextColor(16, 185, 129); // green
        doc.setFont('Helvetica', 'bold');
        doc.text('INCASSATA', pageWidth - marginX - 3, tableY, { align: 'right' });
      } else {
        doc.setTextColor(225, 29, 72); // rose
        doc.setFont('Helvetica', 'bold');
        doc.text('IN ATTESA', pageWidth - marginX - 3, tableY, { align: 'right' });
      }

      doc.setLineWidth(0.2);
      doc.setDrawColor(230, 235, 241);
      doc.line(marginX, currentY + 7, pageWidth - marginX, currentY + 7);
      
      currentY += 7;
    });
  }

  // Final footer page 2
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
  doc.text(`Regime Forfettario 2026  |  Esportazione Registro Fatture  | Unicamente per Archivio Personale.`, marginX, pageHeight - 10);
  doc.text('Pagina 2 di 2', pageWidth - marginX, pageHeight - 10, { align: 'right' });

  // Save the PDF locally on trigger
  const safeName = (profile.fullName || 'professionista').replace(/\s+/g, '_').toLowerCase();
  doc.save(`Riepilogo_Fiscale_2026_${safeName}.pdf`);
}
