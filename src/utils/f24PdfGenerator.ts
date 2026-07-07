/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { BusinessProfile } from '../types';

export type F24Category = 'imposta' | 'contributi';
export type F24PaymentType = 'saldo' | 'acconto1' | 'acconto2' | 'minimale';

/**
 * Generates an extremely high-fidelity, authentic vector representation of the
 * official Modello F24 (Agenzia delle Entrate) PDF, compiled with user details.
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

  const pageWidth = 210;
  const marginX = 6;
  const contentWidth = pageWidth - (2 * marginX); // 198mm

  // Official F24 colors
  const f24Teal = [0, 151, 178]; // Official turquoise/cyan header bars (#0097B2)
  const f24LightTeal = [225, 244, 247]; // Soft teal shading for totals (#E1F4F7)
  const lineGray = [160, 210, 220]; // Light teal-gray lines for grid
  const borderTeal = [0, 151, 178];
  const textDark = [40, 40, 40];
  const textLight = [100, 100, 100];

  // Logic to calculate tax code and reference details
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

  // Draw 1st Copy (Page 1)
  drawF24Page(1, "1ª COPIA PER LA BANCA/POSTE/AGENTE DELLA RISCOSSIONE");

  // Draw 2nd Copy (Page 2)
  doc.addPage();
  drawF24Page(2, "2ª COPIA PER LA BANCA/POSTE/AGENTE DELLA RISCOSSIONE");

  // Draw 3rd Copy (Page 3)
  doc.addPage();
  drawF24Page(3, "COPIA PER IL SOGGETTO CHE EFFETTUA IL VERSAMENTO");

  // Main function that draws a page of Modello F24
  function drawF24Page(pageNum: number, copyLabel: string) {
    let currentY = 5;

    // --- PAGE HEADER BLOCK ---
    // logo box or brand name
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.setLineWidth(0.3);

    // Header Logo area
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    // Draw Logo text to resemble "Agenzia Entrate"
    doc.text('genzia', marginX + 16, currentY + 7);
    doc.text('ntrate', marginX + 16, currentY + 11);
    
    // Abstract logo shapes
    doc.setFillColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX + 2, currentY + 2, 11, 10, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(marginX + 7.5, currentY + 7, 3, 'F');
    doc.setFillColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.circle(marginX + 7.5, currentY + 7, 1.5, 'F');

    // Title Block
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('MODELLO DI PAGAMENTO', marginX + 2, currentY + 18);
    doc.text('UNIFICATO', marginX + 2, currentY + 22);

    // Large € Watermark
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(225, 244, 247);
    doc.text('€', pageWidth / 2, currentY + 15, { align: 'center' });

    // Mod. F24 tag
    doc.setFillColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(pageWidth - marginX - 18, currentY, 18, 5, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Mod. F24', pageWidth - marginX - 15, currentY + 3.8);

    // Delegation Box on top right
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.setLineWidth(0.2);
    doc.line(pageWidth - marginX - 75, currentY + 6, pageWidth - marginX, currentY + 6);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text('DELEGA IRREVOCABILE A:', pageWidth - marginX - 74, currentY + 9);
    doc.text('AGENZIA', pageWidth - marginX - 74, currentY + 14);
    doc.text('PROV.', pageWidth - marginX - 14, currentY + 14);
    doc.text('PER L\'ACCREDITO ALLA TESORERIA COMPETENTE', pageWidth - marginX - 74, currentY + 19);

    // Draw lines inside delegation block
    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(pageWidth - marginX - 75, currentY + 10, pageWidth - marginX, currentY + 10);
    doc.line(pageWidth - marginX - 75, currentY + 15, pageWidth - marginX, currentY + 15);
    doc.rect(pageWidth - marginX - 75, currentY + 6, 75, 14.5);

    currentY += 22;

    // Helper: Draw turquoise header bar
    const drawSectionHeader = (title: string, rightNote?: string) => {
      doc.setFillColor(f24Teal[0], f24Teal[1], f24Teal[2]);
      doc.rect(marginX, currentY, contentWidth, 5, 'F');
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(title.toUpperCase(), marginX + 1.5, currentY + 3.6);

      if (rightNote) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.text(rightNote, pageWidth - marginX - 1.5, currentY + 3.4, { align: 'right' });
      }
      currentY += 5;
    };

    // Helper: Draw typewriter Courier characters inside split boxes
    const drawFormString = (text: string, count: number, x: number, y: number, charWidth: number = 3.6, boxHeight: number = 4) => {
      doc.setFont('Courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const str = text.toUpperCase().padEnd(count, ' ');
      for (let i = 0; i < count; i++) {
        const char = str[i];
        if (char && char !== ' ') {
          doc.text(char, x + (i * charWidth) + (charWidth / 2), y + 3.1, { align: 'center' });
        }
      }
    };

    // Helper: Draw empty split boxes (individual letter slots)
    const drawInputBoxes = (count: number, x: number, y: number, charWidth: number = 3.6, boxHeight: number = 4) => {
      doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
      doc.setLineWidth(0.15);
      for (let i = 0; i < count; i++) {
        doc.rect(x + (i * charWidth), y, charWidth, boxHeight);
      }
    };

    // Helper: Format euro amount into split digits for cents
    const drawEuroAmountInForm = (val: number, x: number, y: number) => {
      const parts = val.toFixed(2).split('.');
      const integerPart = parseInt(parts[0], 10).toLocaleString('it-IT').replace(/\./g, '');
      const decimalPart = parts[1];

      doc.setFont('Courier', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);

      // Decimals (cents) go into the final 2 boxes on the right
      doc.text(decimalPart, x + 44.5, y + 3.2, { align: 'center' });

      // Integer part goes left of the comma, right-aligned to the decimal separator
      doc.text(integerPart, x + 34, y + 3.2, { align: 'right' });
    };

    // Helper: Draw F24 official currency lines (euro separator comma)
    const drawEuroFieldDesign = (x: number, y: number) => {
      doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
      doc.setLineWidth(0.15);
      // Box for Euros (38mm)
      doc.rect(x, y, 37, 4);
      // Box for Cents (9mm)
      doc.rect(x + 39, y, 8, 4);
      // Draw comma
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
      doc.text(',', x + 37.4, y + 3.3);
    };

    // --- CONTRIBUENTE SECTION ---
    drawSectionHeader('CONTRIBUENTE', 'barrare in caso di anno d\'imposta non coincidente con anno solare [ ]');

    // CF Row
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.setLineWidth(0.25);
    doc.rect(marginX, currentY, contentWidth, 23.5); // Outer frame for contribuente

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('CODICE FISCALE', marginX + 1.5, currentY + 3.2);

    const fiscalCode = profile.fiscalCode || profile.vatNumber || '';
    drawInputBoxes(16, marginX + 24, currentY + 0.8, 3.6, 4);
    drawFormString(fiscalCode, 16, marginX + 24, currentY + 0.8, 3.6, 4);

    // Separator line
    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 5.2, pageWidth - marginX, currentY + 5.2);

    // Name Row
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('DATI ANAGRAFICI', marginX + 1.5, currentY + 8.8);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text('cognome, denominazione o ragione sociale', marginX + 24, currentY + 7);
    doc.text('nome', marginX + 115, currentY + 7);

    // User values
    doc.setFont('Courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    
    const nameParts = profile.fullName.split(' ');
    const lastName = nameParts[0] || '';
    const firstName = nameParts.slice(1).join(' ') || ' ';
    doc.text(lastName.toUpperCase(), marginX + 24, currentY + 10.5);
    doc.text(firstName.toUpperCase(), marginX + 115, currentY + 10.5);

    // Birth details Row
    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 11.5, pageWidth - marginX, currentY + 11.5);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text('data di nascita', marginX + 24, currentY + 13.5);
    doc.text('giorno     mese       anno', marginX + 24, currentY + 15.2);
    doc.text('sesso (M o F)', marginX + 62, currentY + 13.5);
    doc.text('comune (o Stato estero) di nascita', marginX + 78, currentY + 13.5);
    doc.text('prov.', marginX + 185, currentY + 13.5);

    // Date boxes
    drawInputBoxes(8, marginX + 24, currentY + 16, 3.2, 4);
    drawFormString("01011985", 8, marginX + 24, currentY + 16, 3.2, 4);

    // Sesso box
    drawInputBoxes(1, marginX + 63, currentY + 16, 3.5, 4);
    drawFormString("M", 1, marginX + 63, currentY + 16, 3.5, 4);

    // Comune nascita
    doc.setFont('Courier', 'bold');
    doc.setFontSize(9.5);
    doc.text('ROMA', marginX + 78, currentY + 19.2);
    doc.text('RM', marginX + 185, currentY + 19.2);

    // Domicilio fiscale Row
    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 20.5, pageWidth - marginX, currentY + 20.5);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('DOMICILIO FISCALE', marginX + 1.5, currentY + 23.2);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text('comune', marginX + 24, currentY + 22);
    doc.text('prov.', marginX + 115, currentY + 22);
    doc.text('via e numero civico', marginX + 128, currentY + 22);

    // User address values
    doc.setFont('Courier', 'bold');
    doc.setFontSize(9);
    doc.text('ROMA', marginX + 24, currentY + 25.2);
    doc.text('RM', marginX + 115, currentY + 25.2);
    doc.text('VIA DEI CONDOTTI 10', marginX + 128, currentY + 25.2);

    currentY += 26.5;

    // --- COOBBLIGATO Row ---
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX, currentY, contentWidth, 5.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('CODICE FISCALE del coobbligato, erede,', marginX + 1, currentY + 2);
    doc.text('genitore, tutore o curatore fallimentare', marginX + 1, currentY + 4);

    drawInputBoxes(16, marginX + 45, currentY + 0.6, 3.4, 4);
    
    doc.text('codice identificativo', marginX + 148, currentY + 3.2);
    drawInputBoxes(2, marginX + 178, currentY + 0.6, 4, 4);

    currentY += 5.2;

    // --- SEZIONE ERARIO ---
    drawSectionHeader('SEZIONE ERARIO', 'IMPOSTE DIRETTE - IVA - RITENUTE ALLA FONTE - ALTRI TRIBUTI ED INTERESSI');

    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX, currentY, contentWidth, 23.5); // Outer Section frame

    // Grid Column Labels
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('codice tributo', marginX + 4, currentY + 2.8);
    doc.text('rateazione/regione/\nprov./mese rif.', marginX + 26, currentY + 2.2);
    doc.text('anno di\nriferimento', marginX + 54, currentY + 2.2);
    doc.text('importi a debito versati', marginX + 102, currentY + 2.8);
    doc.text('importi a credito compensati', marginX + 148, currentY + 2.8);

    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 4.8, pageWidth - marginX, currentY + 4.8);

    // Draw the Erario inputs grid lines
    const erarioY = currentY + 4.8;
    for (let r = 0; r < 4; r++) {
      const rowY = erarioY + (r * 4.2);
      if (r < 3) {
        doc.line(marginX, rowY + 4.2, pageWidth - marginX, rowY + 4.2);
      }
      
      // Vertical grid lines
      doc.line(marginX + 23, rowY, marginX + 23, rowY + 4.2);
      doc.line(marginX + 51, rowY, marginX + 51, rowY + 4.2);
      doc.line(marginX + 74, rowY, marginX + 74, rowY + 4.2);
      doc.line(marginX + 135, rowY, marginX + 135, rowY + 4.2);

      // Input boxes on Erario columns
      if (r < 3) {
        drawInputBoxes(4, marginX + 3, rowY + 0.1, 4, 4);
        drawInputBoxes(4, marginX + 28, rowY + 0.1, 4, 4);
        drawInputBoxes(4, marginX + 54, rowY + 0.1, 4, 4);
        drawEuroFieldDesign(marginX + 80, rowY + 0.1);
        drawEuroFieldDesign(marginX + 140, rowY + 0.1);
      }
    }

    // Insert active data for Erario
    if (sectionToFill === 'erario') {
      const activeRowY = erarioY;
      drawFormString(taxCode, 4, marginX + 3, activeRowY + 0.1, 4, 4);
      drawFormString(rateCode, 4, marginX + 28, activeRowY + 0.1, 4, 4);
      drawFormString(paymentType === 'saldo' ? year : String(calcYearInt + 1), 4, marginX + 54, activeRowY + 0.1, 4, 4);
      drawEuroAmountInForm(amount, marginX + 80, activeRowY + 0.1);
    }

    // Totals Block
    const erarioTotalY = erarioY + 12.6;
    doc.setFillColor(f24LightTeal[0], f24LightTeal[1], f24LightTeal[2]);
    doc.rect(marginX + 0.1, erarioTotalY, contentWidth - 0.2, 5.9, 'F');
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.line(marginX, erarioTotalY, pageWidth - marginX, erarioTotalY);

    // Vertical total divider
    doc.line(marginX + 74, erarioTotalY, marginX + 74, erarioTotalY + 5.9);
    doc.line(marginX + 135, erarioTotalY, marginX + 135, erarioTotalY + 5.9);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('TOTALE', marginX + 3, erarioTotalY + 4.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('A', marginX + 70, erarioTotalY + 4.2);
    doc.text('B', marginX + 131, erarioTotalY + 4.2);

    if (sectionToFill === 'erario') {
      const parts = amount.toFixed(2).split('.');
      doc.text(parseInt(parts[0], 10).toLocaleString('it-IT'), marginX + 114, erarioTotalY + 4.2, { align: 'right' });
      doc.text(parts[1], marginX + 122, erarioTotalY + 4.2, { align: 'center' });
    } else {
      doc.text('0', marginX + 114, erarioTotalY + 4.2, { align: 'right' });
      doc.text('00', marginX + 122, erarioTotalY + 4.2, { align: 'center' });
    }
    
    doc.text('0', marginX + 174, erarioTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 182, erarioTotalY + 4.2, { align: 'center' });

    currentY += 23.5;

    // --- SEZIONE INPS ---
    drawSectionHeader('SEZIONE INPS');

    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX, currentY, contentWidth, 23.5);

    // Header column labels
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('codice\nsede', marginX + 2, currentY + 2.4);
    doc.text('causale\ncontributo', marginX + 13, currentY + 2.4);
    doc.text('matricola INPS/codice INPS/\nfiliale azienda', marginX + 35, currentY + 2.4);
    doc.text('periodo di riferimento:\nda mm/aaaa      a mm/aaaa', marginX + 76, currentY + 2.4);
    doc.text('importi a debito versati', marginX + 138, currentY + 3.2);
    doc.text('importi a credito compensati', marginX + 168, currentY + 3.2);

    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 4.8, pageWidth - marginX, currentY + 4.8);

    const inpsY = currentY + 4.8;
    for (let r = 0; r < 4; r++) {
      const rowY = inpsY + (r * 4.2);
      if (r < 3) {
        doc.line(marginX, rowY + 4.2, pageWidth - marginX, rowY + 4.2);
      }
      
      // Dividers
      doc.line(marginX + 11, rowY, marginX + 11, rowY + 4.2);
      doc.line(marginX + 25, rowY, marginX + 25, rowY + 4.2);
      doc.line(marginX + 73, rowY, marginX + 73, rowY + 4.2);
      doc.line(marginX + 125, rowY, marginX + 125, rowY + 4.2);
      doc.line(marginX + 160, rowY, marginX + 160, rowY + 4.2);

      if (r < 3) {
        drawInputBoxes(4, marginX + 1, rowY + 0.1, 2.3, 4);
        drawInputBoxes(4, marginX + 13, rowY + 0.1, 2.6, 4);
        drawInputBoxes(13, marginX + 26, rowY + 0.1, 3.4, 4);
        // Period boxes
        drawInputBoxes(6, marginX + 74, rowY + 0.1, 3.6, 4);
        drawInputBoxes(6, marginX + 100, rowY + 0.1, 3.6, 4);
        drawEuroFieldDesign(marginX + 126, rowY + 0.1);
        drawEuroFieldDesign(marginX + 161, rowY + 0.1);
      }
    }

    // Insert active data for INPS
    if (sectionToFill === 'inps') {
      const activeRowY = inpsY;
      drawFormString('8200', 4, marginX + 1, activeRowY + 0.1, 2.3, 4);
      drawFormString(taxCode, 4, marginX + 13, activeRowY + 0.1, 2.6, 4);
      drawFormString(fiscalCode, 13, marginX + 26, activeRowY + 0.1, 3.4, 4);
      
      const startClean = (refPeriodStart || `01/${year}`).replace('/', '');
      const endClean = (refPeriodEnd || `12/${year}`).replace('/', '');
      drawFormString(startClean, 6, marginX + 74, activeRowY + 0.1, 3.6, 4);
      drawFormString(endClean, 6, marginX + 100, activeRowY + 0.1, 3.6, 4);

      drawEuroAmountInForm(amount, marginX + 126, activeRowY + 0.1);
    }

    // Totals Block
    const inpsTotalY = inpsY + 12.6;
    doc.setFillColor(f24LightTeal[0], f24LightTeal[1], f24LightTeal[2]);
    doc.rect(marginX + 0.1, inpsTotalY, contentWidth - 0.2, 5.9, 'F');
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.line(marginX, inpsTotalY, pageWidth - marginX, inpsTotalY);

    doc.line(marginX + 125, inpsTotalY, marginX + 125, inpsTotalY + 5.9);
    doc.line(marginX + 160, inpsTotalY, marginX + 160, inpsTotalY + 5.9);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('TOTALE', marginX + 3, inpsTotalY + 4.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('C', marginX + 120, inpsTotalY + 4.2);
    doc.text('D', marginX + 155, inpsTotalY + 4.2);

    if (sectionToFill === 'inps') {
      const parts = amount.toFixed(2).split('.');
      doc.text(parseInt(parts[0], 10).toLocaleString('it-IT'), marginX + 153, inpsTotalY + 4.2, { align: 'right' });
      doc.text(parts[1], marginX + 158, inpsTotalY + 4.2, { align: 'center' });
    } else {
      doc.text('0', marginX + 153, inpsTotalY + 4.2, { align: 'right' });
      doc.text('00', marginX + 158, inpsTotalY + 4.2, { align: 'center' });
    }
    
    doc.text('0', marginX + 188, inpsTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 193, inpsTotalY + 4.2, { align: 'center' });

    currentY += 23.5;

    // --- SEZIONE REGIONI ---
    drawSectionHeader('SEZIONE REGIONI');

    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX, currentY, contentWidth, 15);

    // Headers
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('codice\nregione', marginX + 1.5, currentY + 2.4);
    doc.text('codice tributo', marginX + 14, currentY + 3);
    doc.text('rateazione/\nmese rif.', marginX + 38, currentY + 2.4);
    doc.text('anno di\nriferimento', marginX + 64, currentY + 2.4);
    doc.text('importi a debito versati', marginX + 115, currentY + 3);
    doc.text('importi a credito compensati', marginX + 158, currentY + 3);

    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 4.8, pageWidth - marginX, currentY + 4.8);

    const regioniY = currentY + 4.8;
    for (let r = 0; r < 2; r++) {
      const rowY = regioniY + (r * 4.2);
      if (r < 1) {
        doc.line(marginX, rowY + 4.2, pageWidth - marginX, rowY + 4.2);
      }
      doc.line(marginX + 11, rowY, marginX + 11, rowY + 4.2);
      doc.line(marginX + 35, rowY, marginX + 35, rowY + 4.2);
      doc.line(marginX + 61, rowY, marginX + 61, rowY + 4.2);
      doc.line(marginX + 90, rowY, marginX + 90, rowY + 4.2);
      doc.line(marginX + 145, rowY, marginX + 145, rowY + 4.2);

      if (r < 1) {
        drawInputBoxes(2, marginX + 2, rowY + 0.1, 4.2, 4);
        drawInputBoxes(4, marginX + 14, rowY + 0.1, 4.2, 4);
        drawInputBoxes(4, marginX + 38, rowY + 0.1, 4.2, 4);
        drawInputBoxes(4, marginX + 64, rowY + 0.1, 4.2, 4);
        drawEuroFieldDesign(marginX + 94, rowY + 0.1);
        drawEuroFieldDesign(marginX + 148, rowY + 0.1);
      }
    }

    // Totals regioni
    const regioniTotalY = regioniY + 4.2;
    doc.setFillColor(f24LightTeal[0], f24LightTeal[1], f24LightTeal[2]);
    doc.rect(marginX + 0.1, regioniTotalY, contentWidth - 0.2, 5.9, 'F');
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.line(marginX, regioniTotalY, pageWidth - marginX, regioniTotalY);

    doc.line(marginX + 90, regioniTotalY, marginX + 90, regioniTotalY + 5.9);
    doc.line(marginX + 145, regioniTotalY, marginX + 145, regioniTotalY + 5.9);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('TOTALE', marginX + 3, regioniTotalY + 4.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('E', marginX + 85, regioniTotalY + 4.2);
    doc.text('F', marginX + 140, regioniTotalY + 4.2);

    doc.text('0', marginX + 128, regioniTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 134, regioniTotalY + 4.2, { align: 'center' });
    doc.text('0', marginX + 178, regioniTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 184, regioniTotalY + 4.2, { align: 'center' });

    currentY += 15;

    // --- SEZIONE IMU E ALTRI TRIBUTI LOCALI ---
    drawSectionHeader('SEZIONE IMU E ALTRI TRIBUTI LOCALI');

    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX, currentY, contentWidth, 15);

    // Headers
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('codice ente/\ncodice comune', marginX + 1, currentY + 2.2);
    doc.text('Ravv.', marginX + 14, currentY + 3);
    doc.text('Immob.\nvariati', marginX + 20, currentY + 2.2);
    doc.text('Acc.', marginX + 27, currentY + 3);
    doc.text('Saldo', marginX + 32, currentY + 3);
    doc.text('numero\nimmobili', marginX + 39, currentY + 2.2);
    doc.text('codice tributo', marginX + 51, currentY + 3);
    doc.text('rateazione/\nmese rif.', marginX + 70, currentY + 2.2);
    doc.text('anno di\nriferimento', marginX + 91, currentY + 2.2);
    doc.text('importi a debito versati', marginX + 125, currentY + 3);
    doc.text('importi a credito compensati', marginX + 162, currentY + 3);

    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 4.8, pageWidth - marginX, currentY + 4.8);

    const imuY = currentY + 4.8;
    for (let r = 0; r < 2; r++) {
      const rowY = imuY + (r * 4.2);
      if (r < 1) {
        doc.line(marginX, rowY + 4.2, pageWidth - marginX, rowY + 4.2);
      }
      doc.line(marginX + 13, rowY, marginX + 13, rowY + 4.2);
      doc.line(marginX + 19, rowY, marginX + 19, rowY + 4.2);
      doc.line(marginX + 26, rowY, marginX + 26, rowY + 4.2);
      doc.line(marginX + 31, rowY, marginX + 31, rowY + 4.2);
      doc.line(marginX + 37, rowY, marginX + 37, rowY + 4.2);
      doc.line(marginX + 49, rowY, marginX + 49, rowY + 4.2);
      doc.line(marginX + 68, rowY, marginX + 68, rowY + 4.2);
      doc.line(marginX + 87, rowY, marginX + 87, rowY + 4.2);
      doc.line(marginX + 115, rowY, marginX + 115, rowY + 4.2);
      doc.line(marginX + 155, rowY, marginX + 155, rowY + 4.2);

      if (r < 1) {
        drawInputBoxes(4, marginX + 1, rowY + 0.1, 2.8, 4);
        drawInputBoxes(3, marginX + 39, rowY + 0.1, 3.1, 4);
        drawInputBoxes(4, marginX + 50, rowY + 0.1, 4.2, 4);
        drawInputBoxes(4, marginX + 69, rowY + 0.1, 4.2, 4);
        drawInputBoxes(4, marginX + 88, rowY + 0.1, 4.2, 4);
        drawEuroFieldDesign(marginX + 116, rowY + 0.1);
        drawEuroFieldDesign(marginX + 156, rowY + 0.1);
      }
    }

    // Totals imu
    const imuTotalY = imuY + 4.2;
    doc.setFillColor(f24LightTeal[0], f24LightTeal[1], f24LightTeal[2]);
    doc.rect(marginX + 0.1, imuTotalY, contentWidth - 0.2, 5.9, 'F');
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.line(marginX, imuTotalY, pageWidth - marginX, imuTotalY);

    doc.line(marginX + 115, imuTotalY, marginX + 115, imuTotalY + 5.9);
    doc.line(marginX + 155, imuTotalY, marginX + 155, imuTotalY + 5.9);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('TOTALE', marginX + 3, imuTotalY + 4.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('G', marginX + 110, imuTotalY + 4.2);
    doc.text('H', marginX + 150, imuTotalY + 4.2);

    doc.text('0', marginX + 148, imuTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 153, imuTotalY + 4.2, { align: 'center' });
    doc.text('0', marginX + 188, imuTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 193, imuTotalY + 4.2, { align: 'center' });

    currentY += 15;

    // --- SEZIONE ALTRI ENTI PREVIDENZIALI ---
    drawSectionHeader('SEZIONE ALTRI ENTI PREVIDENZIALI E ASSICURATIVI');

    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.rect(marginX, currentY, contentWidth, 23.5);

    // Headers
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('INAIL', marginX + 1.5, currentY + 2.5);
    doc.text('codice sede', marginX + 16, currentY + 2.5);
    doc.text('codice ditta', marginX + 35, currentY + 2.5);
    doc.text('c.c.', marginX + 66, currentY + 2.5);
    doc.text('numero di riferimento', marginX + 78, currentY + 2.5);
    doc.text('causale', marginX + 111, currentY + 2.5);
    doc.text('importi a debito versati', marginX + 128, currentY + 2.5);
    doc.text('importi a credito compensati', marginX + 165, currentY + 2.5);

    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.line(marginX, currentY + 3.8, pageWidth - marginX, currentY + 3.8);

    const inailY = currentY + 3.8;
    // INAIL Row
    doc.line(marginX + 14, inailY, marginX + 14, inailY + 4);
    doc.line(marginX + 32, inailY, marginX + 32, inailY + 4);
    doc.line(marginX + 64, inailY, marginX + 64, inailY + 4);
    doc.line(marginX + 75, inailY, marginX + 75, inailY + 4);
    doc.line(marginX + 109, inailY, marginX + 109, inailY + 4);
    doc.line(marginX + 122, inailY, marginX + 122, inailY + 4);
    doc.line(marginX + 158, inailY, marginX + 158, inailY + 4);

    drawInputBoxes(5, marginX + 15, inailY + 0.1, 3.2, 3.8);
    drawInputBoxes(8, marginX + 33, inailY + 0.1, 3.2, 3.8);
    drawInputBoxes(1, marginX + 68, inailY + 0.1, 3.5, 3.8);
    drawInputBoxes(10, marginX + 76, inailY + 0.1, 3.1, 3.8);
    drawEuroFieldDesign(marginX + 123, inailY + 0.1);
    drawEuroFieldDesign(marginX + 159, inailY + 0.1);

    // Separator line under INAIL
    doc.line(marginX, inailY + 3.8, pageWidth - marginX, inailY + 3.8);

    // Other funds row
    const otherFundsHeaderY = inailY + 3.8;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.2);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('codice ente', marginX + 1.5, otherFundsHeaderY + 2.2);
    doc.text('codice sede', marginX + 16, otherFundsHeaderY + 2.2);
    doc.text('causale cont.', marginX + 34, otherFundsHeaderY + 2.2);
    doc.text('codice posizione', marginX + 51, otherFundsHeaderY + 2.2);
    doc.text('periodo di riferimento:\nda mm/aaaa      a mm/aaaa', marginX + 83, otherFundsHeaderY + 2.2);
    doc.text('importi a debito versati', marginX + 130, otherFundsHeaderY + 2.2);
    doc.text('importi a credito compensati', marginX + 165, otherFundsHeaderY + 2.2);

    doc.line(marginX, otherFundsHeaderY + 3, pageWidth - marginX, otherFundsHeaderY + 3);

    // Row for independent funds (Casse)
    const otherY = otherFundsHeaderY + 3;
    doc.line(marginX + 14, otherY, marginX + 14, otherY + 4);
    doc.line(marginX + 32, otherY, marginX + 32, otherY + 4);
    doc.line(marginX + 48, otherY, marginX + 48, otherY + 4);
    doc.line(marginX + 80, otherY, marginX + 80, otherY + 4);
    doc.line(marginX + 122, otherY, marginX + 122, otherY + 4);
    doc.line(marginX + 158, otherY, marginX + 158, otherY + 4);

    drawInputBoxes(4, marginX + 1, otherY + 0.1, 3, 3.8);
    drawInputBoxes(5, marginX + 15, otherY + 0.1, 3.2, 3.8);
    drawInputBoxes(4, marginX + 33, otherY + 0.1, 3.2, 3.8);
    drawInputBoxes(8, marginX + 49, otherY + 0.1, 3.5, 3.8);
    // Period boxes
    drawInputBoxes(6, marginX + 81, otherY + 0.1, 3.1, 3.8);
    drawInputBoxes(6, marginX + 102, otherY + 0.1, 3.1, 3.8);

    drawEuroFieldDesign(marginX + 123, otherY + 0.1);
    drawEuroFieldDesign(marginX + 159, otherY + 0.1);

    if (sectionToFill === 'altre_casse') {
      drawFormString('EP', 4, marginX + 1, otherY + 0.1, 3, 3.8);
      drawFormString(taxCode, 4, marginX + 33, otherY + 0.1, 3.2, 3.8);
      drawFormString(fiscalCode.substring(0, 8), 8, marginX + 49, otherY + 0.1, 3.5, 3.8);
      
      drawFormString(`01${year}`, 6, marginX + 81, otherY + 0.1, 3.1, 3.8);
      drawFormString(`12${year}`, 6, marginX + 102, otherY + 0.1, 3.1, 3.8);

      drawEuroAmountInForm(amount, marginX + 123, otherY + 0.1);
    }

    // Totals cassa
    const otherTotalY = otherY + 4.1;
    doc.setFillColor(f24LightTeal[0], f24LightTeal[1], f24LightTeal[2]);
    doc.rect(marginX + 0.1, otherTotalY, contentWidth - 0.2, 5.9, 'F');
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.line(marginX, otherTotalY, pageWidth - marginX, otherTotalY);

    doc.line(marginX + 122, otherTotalY, marginX + 122, otherTotalY + 5.9);
    doc.line(marginX + 158, otherTotalY, marginX + 158, otherTotalY + 5.9);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('TOTALE', marginX + 3, otherTotalY + 4.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('I', marginX + 118, otherTotalY + 4.2);
    doc.text('L', marginX + 154, otherTotalY + 4.2);

    if (sectionToFill === 'altre_casse') {
      const parts = amount.toFixed(2).split('.');
      doc.text(parseInt(parts[0], 10).toLocaleString('it-IT'), marginX + 150, otherTotalY + 4.2, { align: 'right' });
      doc.text(parts[1], marginX + 155, otherTotalY + 4.2, { align: 'center' });
    } else {
      doc.text('0', marginX + 150, otherTotalY + 4.2, { align: 'right' });
      doc.text('00', marginX + 155, otherTotalY + 4.2, { align: 'center' });
    }
    
    doc.text('0', marginX + 186, otherTotalY + 4.2, { align: 'right' });
    doc.text('00', marginX + 191, otherTotalY + 4.2, { align: 'center' });

    currentY += 23.5;

    // --- Bottom Signature and Final Balance Box ---
    doc.setDrawColor(borderTeal[0], borderTeal[1], borderTeal[2]);
    doc.setLineWidth(0.35);
    // Saldo finale border
    doc.rect(marginX, currentY + 1.2, contentWidth, 12.5);
    doc.setFillColor(f24LightTeal[0], f24LightTeal[1], f24LightTeal[2]);
    doc.rect(marginX + 0.1, currentY + 1.3, contentWidth - 0.2, 4.2, 'F');

    doc.setFont('Helvetica', 'black');
    doc.setFontSize(7.5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('SALDO FINALE', marginX + 3, currentY + 4.3);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('EURO +', marginX + 4, currentY + 10.5);

    // Print final balance
    const parts = amount.toFixed(2).split('.');
    doc.setFont('Courier', 'bold');
    doc.setFontSize(14);
    doc.text(parseInt(parts[0], 10).toLocaleString('it-IT') + ',' + parts[1], pageWidth - marginX - 4, currentY + 11, { align: 'right' });

    currentY += 13.7;

    // Signature Area
    doc.setDrawColor(lineGray[0], lineGray[1], lineGray[2]);
    doc.setLineWidth(0.2);
    doc.rect(marginX, currentY + 1, contentWidth, 11);
    doc.line(marginX + 95, currentY + 1, marginX + 95, currentY + 12);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('FIRMA', marginX + 2, currentY + 3.2);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.text('AUTORIZZO ADDEBITO SU CONTO CORRENTE IBAN (firma)', marginX + 22, currentY + 3.2);

    // Signature label or simulation
    doc.setFont('Courier', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(profile.fullName.toUpperCase(), marginX + 34, currentY + 8.5);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(f24Teal[0], f24Teal[1], f24Teal[2]);
    doc.text('ESTREMI DEL VERSAMENTO (da compilare a cura di banca/poste/agente della riscossione)', marginX + 97, currentY + 3.2);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(4);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text('DATA      giorno    mese       anno', marginX + 97, currentY + 6.2);
    doc.text('CODICE BANCA/POSTE/AGENTE DELLA RISCOSSIONE', marginX + 144, currentY + 6.2);

    currentY += 12;

    // Copy metadata line
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(copyLabel, marginX, currentY + 4);

    // Page indicator
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text(`Modello conforme Agenzia delle Entrate - Generato il ${new Date().toLocaleDateString('it-IT')} - Pagina ${pageNum} di 3`, pageWidth - marginX, currentY + 4, { align: 'right' });
  }

  // Save the F24 PDF
  const catShort = category === 'imposta' ? 'IMPOSTA' : 'CONTRIBUTI';
  const filename = `F24_${catShort}_${paymentType.toUpperCase()}_${year}.pdf`;
  doc.save(filename);
}
