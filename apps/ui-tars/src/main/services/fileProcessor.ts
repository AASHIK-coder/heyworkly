import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface ProcessedFile {
  type: 'image' | 'text';
  fileName: string;
  content: string; // base64 for images, markdown text for documents
  mimeType: string;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_IMAGE_DIMENSION = 1024;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (PDFs can be larger)
const MAX_PDF_PAGES = 20;

async function processImage(
  filePath: string,
  fileName: string,
): Promise<ProcessedFile[]> {
  const sharp = (await import('sharp')).default;
  const image = sharp(filePath);
  const metadata = await image.metadata();

  let resized = image;
  if (
    (metadata.width && metadata.width > MAX_IMAGE_DIMENSION) ||
    (metadata.height && metadata.height > MAX_IMAGE_DIMENSION)
  ) {
    resized = image.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const buffer = await resized.jpeg({ quality: 85 }).toBuffer();
  return [
    {
      type: 'image',
      fileName,
      content: buffer.toString('base64'),
      mimeType: 'image/jpeg',
    },
  ];
}

async function processDocx(
  filePath: string,
  fileName: string,
): Promise<ProcessedFile[]> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value.trim();
  const content = `--- File: ${fileName} ---\n${text}\n--- End File ---`;

  return [
    {
      type: 'text',
      fileName,
      content,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  ];
}

function sheetToMarkdownTable(
  XLSX: typeof import('xlsx'),
  sheet: any,
): string {
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length === 0) return '';

  const header = rows[0].map((cell) => String(cell ?? ''));
  const separator = header.map(() => '---');
  const dataRows = rows.slice(1).map((row) => {
    return header.map((_, i) => String(row[i] ?? ''));
  });

  const lines = [
    '| ' + header.join(' | ') + ' |',
    '| ' + separator.join(' | ') + ' |',
    ...dataRows.map((row) => '| ' + row.join(' | ') + ' |'),
  ];

  return lines.join('\n');
}

async function processExcel(
  filePath: string,
  fileName: string,
): Promise<ProcessedFile[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile(filePath);
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const table = sheetToMarkdownTable(XLSX, sheet);
    if (table) {
      sections.push(`[Sheet: ${sheetName}]\n${table}`);
    }
  }

  const content = `--- File: ${fileName} ---\n${sections.join('\n\n')}\n--- End File ---`;

  return [
    {
      type: 'text',
      fileName,
      content,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  ];
}

async function processCsv(
  filePath: string,
  fileName: string,
): Promise<ProcessedFile[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile(filePath, { type: 'file' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const table = sheetToMarkdownTable(XLSX, sheet);

  const content = `--- File: ${fileName} ---\n${table}\n--- End File ---`;

  return [
    {
      type: 'text',
      fileName,
      content,
      mimeType: 'text/csv',
    },
  ];
}

async function processPdf(
  filePath: string,
  fileName: string,
): Promise<ProcessedFile[]> {
  const sharp = (await import('sharp')).default;
  const { createCanvas } = require('canvas') as typeof import('canvas');
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = new Uint8Array(dataBuffer);
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const numPages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const results: ProcessedFile[] = [];

  // 1. Extract text from all pages
  const textParts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();
    if (pageText) {
      textParts.push(pageText);
    }
  }

  if (textParts.length > 0) {
    const fullText = textParts.join('\n\n');
    results.push({
      type: 'text',
      fileName,
      content: `--- File: ${fileName} ---\n${fullText}\n--- End File ---`,
      mimeType: 'application/pdf',
    });
  }

  // 2. Render each page as an image (captures charts, diagrams, images)
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });

    const nodeCanvas = createCanvas(viewport.width, viewport.height);
    const context = nodeCanvas.getContext('2d');

    await page.render({
      canvas: null,
      canvasContext: context as any,
      viewport,
    }).promise;

    const pngBuffer = nodeCanvas.toBuffer('image/png');
    const jpegBuffer = await sharp(pngBuffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    results.push({
      type: 'image',
      fileName: `${fileName} (page ${i})`,
      content: jpegBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    });
  }

  if (doc.numPages > MAX_PDF_PAGES) {
    results.push({
      type: 'text',
      fileName: `${fileName} (truncation notice)`,
      content: `[Note: PDF has ${doc.numPages} pages but only the first ${MAX_PDF_PAGES} were rendered as images. Full text was extracted from all pages.]`,
      mimeType: 'text/plain',
    });
  }

  return results;
}

export async function processFileFromPath(
  filePath: string,
): Promise<ProcessedFile[]> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return processImage(filePath, fileName);
  } else if (ext === '.pdf') {
    return processPdf(filePath, fileName);
  } else if (ext === '.docx') {
    return processDocx(filePath, fileName);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return processExcel(filePath, fileName);
  } else if (ext === '.csv') {
    return processCsv(filePath, fileName);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export async function processFileFromBase64(
  name: string,
  base64Data: string,
): Promise<ProcessedFile[]> {
  const tempDir = path.join(os.tmpdir(), 'heyworkly-uploads');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempPath = path.join(tempDir, `${Date.now()}-${safeName}`);
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `File "${name}" exceeds maximum size of 50MB (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`,
    );
  }
  fs.writeFileSync(tempPath, buffer);

  try {
    const results = await processFileFromPath(tempPath);
    // Restore original file name (temp path has timestamp prefix + sanitized name)
    const originalBase = path.basename(name);
    return results.map((r) => ({
      ...r,
      fileName: r.fileName.includes(safeName)
        ? r.fileName.replace(path.basename(tempPath), originalBase)
        : r.fileName,
    }));
  } finally {
    fs.unlinkSync(tempPath);
  }
}
