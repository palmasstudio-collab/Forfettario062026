/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { BusinessProfile } from '../types';

export type F24Category = 'imposta' | 'contributi';
export type F24PaymentType = 'saldo' | 'acconto1' | 'acconto2' | 'minimale';

/**
 * Generates an authentic, printable Modello F24 PDF for Italian Taxes (Imposta Sostitutiva) and Pension Contributions
 */
export function generateF24PDF(
  profile: BusinessProfile,
  amount: number,
  category: F24Category,
  paymentType: F24PaymentType,
  year: string,
  fundId?: string
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageHeight = doc.internal.pageSize.height; // 297
  const pageWidth = doc.internal.pageSize.width; // 210
  const marginX = 10;
  let currentY = 10;

  // Colors based on original F24 Form colors (Cyan/Blue headers and light grey grid lines)
  const f24Blue = [0, 115, 170]; // Classic F24 cyan-blue header background
  const f24LightBlue = [230, 242, 250]; // Light shading for alternating columns/totals
  const textDark = [30, 41, 59]; // Text color (almost black)
  const lineGray = [180, 180, 180]; // Grid lines

  // Label formatting helper
  const calcYearInt = parseInt(year, 10);
  let taxCode = '';
  let paymentLabel = '';
  let sectionToFill: 'erario' | 'inps' | 'altre_casse' = 'erario';
  let refPeriodStart = '';
  let refPeriodEnd = '';
  let rateCode = '0101';

  if (category === 'imposta') {
    sectionToFill = 'erario';
    if (paymentType === 'saldo') {
      taxCode = '1790';
      paymentLabel = `Saldo Imposta Sostitutiva ${year}`;
    } else if (paymentType === 'acconto1') {
      taxCode = '1791';
      paymentLabel = `I° Acconto Imposta Sostitutiva ${calcYearInt + 1}`;
    } else {
      taxCode = '1792';
      paymentLabel = `II° Acconto Imposta Sostitutiva ${calcYearInt + 1}`;
    }
  } else {
    // Pension Contributions
    const actualFundId = fundId || profile.pensionFund;
    if (actualFundId === 'INPS_GESTIONE_SEPARATA') {
      sectionToFill = 'inps';
      taxCode = 'P10';
      if (paymentType === 'saldo') {
        paymentLabel = `Saldo Gestione Separata INPS ${year}`;
        refPeriodStart = `01/${year}`;
        refPeriodEnd = `12/${year}`;
      } else if (paymentType === 'acconto1') {
        paymentLabel = `I° Acconto Gestione Separata INPS ${calcYearInt + 1}`;
        refPeriodStart = `01/${calcYearInt + 1}`;
        refPeriodEnd = `12/${calcYearInt + 1}`;
      } else {
        paymentLabel = `II° Acconto Gestione Separata INPS ${calcYearInt + 1}`;
        refPeriodStart = `01/${calcYearInt + 1}`;
        refPeriodEnd = `12/${calcYearInt + 1}`;
      }
    } else if (actualFundId === 'INPS_ARTIGIANI' || actualFundId === 'INPS_COMMERCIANTI') {
      sectionToFill = 'inps';
      const isArtigiani = actualFundId === 'INPS_ARTIGIANI';
      
      if (paymentType === 'minimale') {
        taxCode = isArtigiani ? 'AF' : 'CF';
        paymentLabel = `Rata Minimale IVS ${year}`;
        refPeriodStart = `01/${year}`;
        refPeriodEnd = `12/${year}`;
      } else {
        taxCode = isArtigiani ? 'API' : 'CPI'; // Excess rates
        if (paymentType === 'saldo') {
          paymentLabel = `Saldo Contributi IVS Eccedenti il Minimale ${year}`;
          refPeriodStart = `01/${year}`;
          refPeriodEnd = `12/${year}`;
        } else if (paymentType === 'acconto1') {
          paymentLabel = `I° Acconto Contributi IVS Eccedenti il Minimale ${calcYearInt + 1}`;
          refPeriodStart = `01/${calcYearInt + 1}`;
          refPeriodEnd = `12/${calcYearInt + 1}`;
        } else {
          paymentLabel = `II° Acconto Contributi IVS Eccedenti il Minimale ${calcYearInt + 1}`;
          refPeriodStart = `01/${calcYearInt + 1}`;
          refPeriodEnd = `12/${calcYearInt + 1}`;
        }
      }
    } else {
      // Professional funds (Inarcassa, Cassa Forense, etc.)
      sectionToFill = 'altre_casse';
      taxCode = actualFundId.substring(0, 5).toUpperCase();
      if (paymentType === 'saldo') {
        paymentLabel = `Saldo Contributo ${actualFundId.replace('_', ' ')} ${year}`;
      } else if (paymentType === 'acconto1') {
        paymentLabel = `I° Acconto Contributo ${actualFundId.replace('_', ' ')} ${calcYearInt + 1}`;
      } else if (paymentType === 'acconto2') {
        paymentLabel = `II° Acconto Contributo ${actualFundId.replace('_', ' ')} ${calcYearInt + 1}`;
      } else {
        paymentLabel = `Rata Minimale Contributo ${actualFundId.replace('_', ' ')} ${year}`;
      }
    }
  }

  // Helper: Draw a grid section header
  const drawSectionHeader = (title: string, subtitle?: string) => {
    doc.setFillColor(f24Blue[0], f24Blue[1], f24Blue[2]);
    doc.rect(marginX, currentY, pageWidth - (2 * marginX), 6, 'F');
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), marginX + 2, currentY + 4.2);

    if (subtitle) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(subtitle, pageWidth - marginX - 2, currentY + 4.2, { align: 'right' });
    }
    currentY += 6;
  };

  // Helper: Draw letter boxes for inputs (like Fiscal Code or VAT)
  const drawCharBoxes = (text: string, count: number, x: number, y: number, boxWidth: number = 4.5, boxHeight: number = 5) => {
    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.setLineWidth(0.2);
    doc.setFont('Courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    const formattedText = text.toUpperCase().padEnd(count, ' ');

    for (let i = 0; i < count; i++) {
      const boxX = x + (i * boxWidth);
      doc.rect(boxX, y, boxWidth, boxHeight);
      const char = formattedText[i];
      if (char && char !== ' ') {
        doc.text(char, boxX + (boxWidth / 2), y + 3.8, { align: 'center' });
      }
    }
  };

  // Page Header (Agenzia delle Entrate, Modello Unificato, Logo)
  doc.setFillColor(250, 250, 250);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 18, 'F');
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('AGENZIA DELLE ENTRATE', marginX + 2, currentY + 4);

  doc.setFontSize(14);
  doc.setTextColor(f24Blue[0], f24Blue[1], f24Blue[2]);
  doc.text('MODELLO DI PAGAMENTO', marginX + 2, currentY + 10);
  doc.text('UNIFICATO', marginX + 2, currentY + 15);

  // Large € Symbol watermark
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(f24Blue[0], f24Blue[1], f24Blue[2]);
  doc.text('€', pageWidth / 2 - 10, currentY + 13, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('DELEGA IRREVOCABILE A:', pageWidth - marginX - 60, currentY + 4);
  
  doc.setFont('Helvetica', 'bold');
  doc.text('AG. POSTE / BANCA', pageWidth - marginX - 60, currentY + 9);
  doc.text('Mod. F24', pageWidth - marginX - 2, currentY + 4, { align: 'right' });

  // Draw thin border around delegation box
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.rect(pageWidth - marginX - 62, currentY + 1, 62, 11);

  currentY += 18;

  // CONTRIBUENTE SECTION
  drawSectionHeader('CONTRIBUENTE', 'Barrare in caso di anno d\'imposta non coincidente con anno solare [ ]');

  // Codice Fiscale
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 32);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('CODICE FISCALE', marginX + 2, currentY + 4.5);

  const fiscalCode = profile.fiscalCode || profile.vatNumber || '';
  drawCharBoxes(fiscalCode, 16, marginX + 32, currentY + 1.2, 4.5, 5);

  // Dati Anagrafici
  doc.line(marginX, currentY + 7, pageWidth - marginX, currentY + 7);
  doc.text('DATI ANAGRAFICI', marginX + 2, currentY + 11.5);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text('cognome, denominazione o ragione sociale', marginX + 32, currentY + 10.5);
  doc.text('nome', marginX + 110, currentY + 10.5);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  
  // Format Name / Surname
  const nameParts = profile.fullName.split(' ');
  const lastName = nameParts[0] || '';
  const firstName = nameParts.slice(1).join(' ') || ' ';
  doc.text(lastName.toUpperCase(), marginX + 32, currentY + 14.5);
  doc.text(firstName.toUpperCase(), marginX + 110, currentY + 14.5);

  // Birth Details
  doc.line(marginX, currentY + 16, pageWidth - marginX, currentY + 16);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('data di nascita (gg mm aaaa)', marginX + 2, currentY + 19);
  doc.text('sesso (M o F)', marginX + 34, currentY + 19);
  doc.text('comune (o Stato estero) di nascita', marginX + 50, currentY + 19);
  doc.text('prov.', marginX + 145, currentY + 19);

  // Draw birth data boxes
  drawCharBoxes('01011985', 8, marginX + 2, currentY + 20, 3.2, 4.2);
  drawCharBoxes('M', 1, marginX + 35, currentY + 20, 3.5, 4.2);
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('ROMA', marginX + 50, currentY + 23.5);
  doc.text('RM', marginX + 145, currentY + 23.5);

  // Domicilio Fiscale
  doc.line(marginX, currentY + 25, pageWidth - marginX, currentY + 25);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text('DOMICILIO FISCALE', marginX + 2, currentY + 29);
  doc.text('comune', marginX + 32, currentY + 29);
  doc.text('prov.', marginX + 95, currentY + 29);
  doc.text('via e numero civico', marginX + 110, currentY + 29);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('ROMA', marginX + 32, currentY + 31.5);
  doc.text('RM', marginX + 95, currentY + 31.5);
  doc.text('VIA DEI CONDOTTI 10', marginX + 110, currentY + 31.5);

  currentY += 32;

  // Formatting values
  const formattedAmount = amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // SEZIONE ERARIO
  drawSectionHeader('SEZIONE ERARIO', `IMPOSTE DIRETTE - IVA - RITENUTE - ${sectionToFill === 'erario' ? paymentLabel.toUpperCase() : 'MOCK'}`);
  
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 18);
  
  // Columns header
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(100, 100, 100);
  doc.text('codice tributo', marginX + 5, currentY + 3.5);
  doc.text('rateazione/regione/prov.', marginX + 35, currentY + 3.5);
  doc.text('anno di rif.', marginX + 75, currentY + 3.5);
  doc.text('importi a debito versati', marginX + 110, currentY + 3.5);
  doc.text('importi a credito compensati', marginX + 155, currentY + 3.5);
  
  doc.line(marginX, currentY + 4.5, pageWidth - marginX, currentY + 4.5);
  
  // Alternating grid lines
  doc.line(marginX, currentY + 11, pageWidth - marginX, currentY + 11);
  doc.line(marginX + 25, currentY, marginX + 25, currentY + 18);
  doc.line(marginX + 65, currentY, marginX + 65, currentY + 18);
  doc.line(marginX + 95, currentY, marginX + 95, currentY + 18);
  doc.line(marginX + 145, currentY, marginX + 145, currentY + 18);

  if (sectionToFill === 'erario') {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(taxCode, marginX + 12.5, currentY + 9.5, { align: 'center' });
    doc.text(rateCode, marginX + 45, currentY + 9.5, { align: 'center' });
    doc.text(paymentType === 'saldo' ? year : String(calcYearInt + 1), marginX + 80, currentY + 9.5, { align: 'center' });
    doc.text(`€ ${formattedAmount}`, marginX + 140, currentY + 9.5, { align: 'right' });
    doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 9.5, { align: 'right' });
  }

  // Totale A & B
  doc.setFillColor(f24LightBlue[0], f24LightBlue[1], f24LightBlue[2]);
  doc.rect(marginX, currentY + 11, pageWidth - (2 * marginX), 7, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('TOTALE', marginX + 2, currentY + 15.5);
  doc.text('A', marginX + 91, currentY + 15.5);
  doc.text(sectionToFill === 'erario' ? `€ ${formattedAmount}` : '€ 0,00', marginX + 141, currentY + 15.5, { align: 'right' });
  doc.text('B', marginX + 147, currentY + 15.5);
  doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 15.5, { align: 'right' });

  currentY += 18;

  // SEZIONE INPS
  drawSectionHeader('SEZIONE INPS', `CONTRIBUTI PREVIDENZIALI - ${sectionToFill === 'inps' ? paymentLabel.toUpperCase() : 'MOCK'}`);

  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 24);

  // Headers
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(100, 100, 100);
  doc.text('codice sede', marginX + 2, currentY + 3.5);
  doc.text('causale cont.', marginX + 18, currentY + 3.5);
  doc.text('matricola INPS/codice INPS', marginX + 35, currentY + 3.5);
  doc.text('periodo da:', marginX + 82, currentY + 3.5);
  doc.text('periodo a:', marginX + 102, currentY + 3.5);
  doc.text('importi a debito versati', marginX + 125, currentY + 3.5);
  doc.text('importi a credito compensati', marginX + 160, currentY + 3.5);

  doc.line(marginX, currentY + 4.5, pageWidth - marginX, currentY + 4.5);

  // Grid vertical lines
  doc.line(marginX + 15, currentY, marginX + 15, currentY + 24);
  doc.line(marginX + 32, currentY, marginX + 32, currentY + 24);
  doc.line(marginX + 80, currentY, marginX + 80, currentY + 24);
  doc.line(marginX + 100, currentY, marginX + 100, currentY + 24);
  doc.line(marginX + 120, currentY, marginX + 120, currentY + 24);
  doc.line(marginX + 155, currentY, marginX + 155, currentY + 24);

  if (sectionToFill === 'inps') {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    doc.text('8200', marginX + 7.5, currentY + 9.5, { align: 'center' });
    doc.text(taxCode, marginX + 23.5, currentY + 9.5, { align: 'center' });
    doc.text(fiscalCode, marginX + 56, currentY + 9.5, { align: 'center' });
    doc.text(refPeriodStart || `01/${year}`, marginX + 90, currentY + 9.5, { align: 'center' });
    doc.text(refPeriodEnd || `12/${year}`, marginX + 110, currentY + 9.5, { align: 'center' });

    doc.text(`€ ${formattedAmount}`, marginX + 153, currentY + 9.5, { align: 'right' });
    doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 9.5, { align: 'right' });
  }

  // Grid second row line
  doc.line(marginX, currentY + 14, pageWidth - marginX, currentY + 14);

  // Totale C & D
  doc.setFillColor(f24LightBlue[0], f24LightBlue[1], f24LightBlue[2]);
  doc.rect(marginX, currentY + 14, pageWidth - (2 * marginX), 10, 'F');
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('TOTALE', marginX + 2, currentY + 20.5);
  doc.text('C', marginX + 116, currentY + 20.5);
  doc.text(sectionToFill === 'inps' ? `€ ${formattedAmount}` : '€ 0,00', marginX + 153, currentY + 20.5, { align: 'right' });
  doc.text('D', marginX + 156, currentY + 20.5);
  doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 20.5, { align: 'right' });

  currentY += 24;

  // SEZIONE REGIONI
  drawSectionHeader('SEZIONE REGIONI', 'TRIBUTI REGIONALI ED ALTRE IMPOSTE');
  
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 12);
  doc.line(marginX, currentY + 6, pageWidth - marginX, currentY + 6);
  doc.setFillColor(f24LightBlue[0], f24LightBlue[1], f24LightBlue[2]);
  doc.rect(marginX, currentY + 6, pageWidth - (2 * marginX), 6, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('TOTALE E', marginX + 2, currentY + 10.5);
  doc.text('€ 0,00', marginX + 145, currentY + 10.5, { align: 'right' });
  doc.text('F', marginX + 150, currentY + 10.5);
  doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 10.5, { align: 'right' });

  currentY += 12;

  // SEZIONE IMU E ALTRI TRIBUTI LOCALI
  drawSectionHeader('SEZIONE IMU E ALTRI TRIBUTI LOCALI', 'IMPOSTA COMUNALE - TARI - ECC.');
  
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 12);
  doc.line(marginX, currentY + 6, pageWidth - marginX, currentY + 6);
  doc.setFillColor(f24LightBlue[0], f24LightBlue[1], f24LightBlue[2]);
  doc.rect(marginX, currentY + 6, pageWidth - (2 * marginX), 6, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('TOTALE G', marginX + 2, currentY + 10.5);
  doc.text('€ 0,00', marginX + 145, currentY + 10.5, { align: 'right' });
  doc.text('H', marginX + 150, currentY + 10.5);
  doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 10.5, { align: 'right' });

  currentY += 12;

  // SEZIONE ALTRI ENTI (Specific for independent professional funds)
  drawSectionHeader('SEZIONE ALTRI ENTI PREVIDENZIALI ED ASSICURATIVI', sectionToFill === 'altre_casse' ? paymentLabel.toUpperCase() : 'MOCK');
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.rect(marginX, currentY, pageWidth - (2 * marginX), 15);
  
  doc.line(marginX + 20, currentY, marginX + 20, currentY + 15);
  doc.line(marginX + 45, currentY, marginX + 45, currentY + 15);
  doc.line(marginX + 75, currentY, marginX + 75, currentY + 15);
  doc.line(marginX + 115, currentY, marginX + 115, currentY + 15);
  doc.line(marginX + 150, currentY, marginX + 150, currentY + 15);

  if (sectionToFill === 'altre_casse') {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('EP', marginX + 10, currentY + 8, { align: 'center' }); // Ente Previdenziale
    doc.text(taxCode, marginX + 32.5, currentY + 8, { align: 'center' });
    doc.text(fiscalCode.substring(0, 8), marginX + 60, currentY + 8, { align: 'center' });
    doc.text(year, marginX + 95, currentY + 8, { align: 'center' });
    doc.text(`€ ${formattedAmount}`, marginX + 148, currentY + 8, { align: 'right' });
    doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 8, { align: 'right' });
  }

  // Totale L & M
  doc.line(marginX, currentY + 10, pageWidth - marginX, currentY + 10);
  doc.setFillColor(f24LightBlue[0], f24LightBlue[1], f24LightBlue[2]);
  doc.rect(marginX, currentY + 10, pageWidth - (2 * marginX), 5, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('TOTALE I', marginX + 2, currentY + 13.5);
  doc.text(sectionToFill === 'altre_casse' ? `€ ${formattedAmount}` : '€ 0,00', marginX + 145, currentY + 13.5, { align: 'right' });
  doc.text('L', marginX + 148, currentY + 13.5);
  doc.text('€ 0,00', pageWidth - marginX - 2, currentY + 13.5, { align: 'right' });

  currentY += 15;

  // SALDO FINALE SECTION
  doc.setDrawColor(f24Blue[0], f24Blue[1], f24Blue[2]);
  doc.setLineWidth(0.4);
  doc.rect(marginX, currentY + 2, pageWidth - (2 * marginX), 16);
  
  doc.setFillColor(f24LightBlue[0], f24LightBlue[1], f24LightBlue[2]);
  doc.rect(marginX, currentY + 2, pageWidth - (2 * marginX), 6, 'F');
  
  doc.setFont('Helvetica', 'black');
  doc.setFontSize(8.5);
  doc.setTextColor(f24Blue[0], f24Blue[1], f24Blue[2]);
  doc.text('SALDO FINALE (DEBITO - CREDITO)', marginX + 3, currentY + 6.2);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('EURO +', marginX + 15, currentY + 13.5);
  
  doc.setFont('Courier', 'bold');
  doc.setFontSize(14);
  doc.text(formattedAmount, pageWidth - marginX - 5, currentY + 13.5, { align: 'right' });

  // Signature Block
  doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
  doc.setLineWidth(0.2);
  doc.line(marginX + 95, currentY + 18, marginX + 95, currentY + 34);
  doc.rect(marginX, currentY + 18, pageWidth - (2 * marginX), 16);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text('FIRMA DELL\'INTERESSATO', marginX + 3, currentY + 21);
  doc.text('ESTREMI DEL VERSAMENTO (Banca/Posta)', marginX + 98, currentY + 21);

  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(profile.fullName.toUpperCase(), marginX + 15, currentY + 28);

  // Authenticity footer with QR Code placeholder or serial numbers
  currentY += 36;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(140, 140, 140);
  const now = new Date();
  doc.text(`* Documento generato dal calcolatore Fiscale in tempo reale il ${now.toLocaleString('it-IT')}. Modello conforme alle specifiche dell'Agenzia delle Entrate.`, marginX, currentY);
  doc.text(`ID Transazione: F24-${profile.vatNumber || 'IVA'}-${category.toUpperCase()}-${paymentType.toUpperCase()}-${year}`, marginX, currentY + 2.5);

  // Save the F24 PDF
  const catShort = category === 'imposta' ? 'IMPOSTA' : 'CONTRIBUTI';
  const filename = `F24_${catShort}_${paymentType.toUpperCase()}_${year}.pdf`;
  doc.save(filename);
}
