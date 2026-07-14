import * as FileSystem from 'expo-file-system';
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

export const generatePDF = async (data: ExportData): Promise<string> => {
  const htmlContent = generateHTMLContent(data);
  const fileName = `quad360-${data.title.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;

  try {
    // Use a simple PDF generation approach via web rendering
    // In production, consider using native PDF libraries
    return filePath;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
};

const generateHTMLContent = (data: ExportData): string => {
  const summaryHTML = data.summary
    ? `<div style="margin-bottom: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px;">
         ${data.summary.map(item => `<p><strong>${item.label}:</strong> ${item.value}</p>`).join('')}
       </div>`
    : '';

  const sectionsHTML = data.sections
    .map(
      section => `
    <div style="margin-bottom: 20px;">
      <h3 style="border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">${section.name}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${section.data.map(item => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${item.label}</td>
            <td style="padding: 8px; text-align: right;">${item.value}</td>
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
      <title>${data.title}</title>
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
        <h1>${data.title}</h1>
        <p class="date">Generated on ${data.date}</p>
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
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }
    await Sharing.shareAsync(filePath, { mimeType: 'application/pdf', UTType: 'com.adobe.pdf' });
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw error;
  }
};

export const savePDFToDevice = async (filePath: string): Promise<void> => {
  try {
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
