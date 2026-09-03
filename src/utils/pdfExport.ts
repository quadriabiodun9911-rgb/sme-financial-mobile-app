import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface ExportData {
  title: string;
  date: string;
  sections: {
    name: string;
    data: Array<{ label: string; value: string | number }>;
  }[];
  summary?: { label: string; value: string | number }[];
}

// Renders `data` into a real PDF, cross-platform. This used to write the
// raw HTML string to a path merely NAMED "*.pdf" (and hand it to sharePDF
// with an application/pdf mime type) -- the bytes on disk were never
// actually a PDF, so every export in this app (Business Passport, Funding
// Readiness Pack, Lender Summary, Post-Financing share -- the documents
// this app hands to an actual lender) would fail to open, or show raw
// markup, in whatever PDF reader received it. expo-sharing, the share step
// itself, also wasn't a declared dependency at all, so on a real device
// tapping Export would throw "module not found" before any of that even
// mattered.
export const generatePDF = async (data: ExportData): Promise<string> => {
  const htmlContent = generateHTMLContent(data);

  if (Platform.OS === 'web') {
    // expo-print's web shim ignores whatever `html` it's given and just
    // calls window.print() on the CURRENT page -- there's no web
    // equivalent of "render this HTML to a PDF file" the way native has.
    // Opening the report in its own window and invoking THAT window's own
    // print dialog lets the browser's native "Save as PDF" produce a real
    // PDF instead. sharePDF is a no-op on web (see below) -- this is the
    // complete web flow, nothing left to hand off afterward.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error("Could not open the print window — check your browser's popup blocker.");
    }
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return '';
  }

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
    return uri;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
};

// Every value interpolated into this HTML document ultimately traces back
// to business-entered data (transaction descriptions, business names, asset
// names) -- without escaping, a description like
// `<img src=x onerror="...">` would be preserved verbatim and rendered as
// real markup/script when the exported file is opened, since generatePDF
// renders this string as an actual text/html document on web. Every
// interpolation point below goes through this.
const escapeHtml = (val: string | number): string => {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const generateHTMLContent = (data: ExportData): string => {
  const summaryHTML = data.summary
    ? `<div style="margin-bottom: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px;">
         ${data.summary.map(item => `<p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</p>`).join('')}
       </div>`
    : '';

  const sectionsHTML = data.sections
    .map(
      section => `
    <div style="margin-bottom: 20px;">
      <h3 style="border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">${escapeHtml(section.name)}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${section.data.map(item => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${escapeHtml(item.label)}</td>
            <td style="padding: 8px; text-align: right;">${escapeHtml(item.value)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(data.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
        h3 { color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        .header { text-align: center; margin-bottom: 30px; }
        .date { color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${escapeHtml(data.title)}</h1>
        <p class="date">Generated on ${escapeHtml(data.date)}</p>
      </div>
      ${summaryHTML}
      ${sectionsHTML}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
        <p>Exported from Quad360 Financial Management App</p>
      </div>
    </body>
    </html>
  `;
};

export const sharePDF = async (filePath: string, title: string): Promise<void> => {
  // generatePDF already handled the whole web flow by opening the
  // browser's own print dialog -- nothing left to share.
  if (Platform.OS === 'web') return;

  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }
    await Sharing.shareAsync(filePath, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw error;
  }
};

export const savePDFToDevice = async (filePath: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      return;
    }

    const FileSystem = require('expo-file-system');
    const fileName = filePath.split('/').pop() || 'export.pdf';
    await FileSystem.copyAsync({
      from: filePath,
      to: `${FileSystem.documentDirectory}${fileName}`,
    });
  } catch (error) {
    console.error('Error saving PDF:', error);
    throw error;
  }
};
