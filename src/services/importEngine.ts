/* =========================================================
   HISTORICAL FINANCIAL FILE IMPORT ENGINE (Sections 19–41)
   Architecture:
   Import File -> Detect Type -> Upload Storage -> Extract Content ->
   Parse Records -> Normalize Fields -> Map Columns -> Validate Data ->
   Detect Duplicates -> Show Preview -> Confirm & Insert -> Realtime Sync
   ========================================================= */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import mammoth from 'mammoth';
import { supabase } from './supabase';
import { Transaction } from '../types';

export type SupportedFileType = 'xlsx' | 'xls' | 'csv' | 'ods' | 'json' | 'txt' | 'docx' | 'pdf';

export interface ColumnMapping {
  dateCol?: string;
  descCol?: string;
  amountCol?: string;
  typeCol?: string;
  debitCol?: string;
  creditCol?: string;
  categoryCol?: string;
  accountCol?: string;
  notesCol?: string;
  ignoredCols: string[];
}

export interface RawParsedRow {
  rowNumber: number;
  data: Record<string, any>;
  errors: string[];
}

export interface NormalizedImportTransaction {
  id: string;
  rowNumber: number;
  date: string;
  description: string;
  amountPaise: number;
  type: 'income' | 'expense' | 'transfer';
  categoryName?: string;
  accountName?: string;
  notes?: string;
  fingerprint: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  selected: boolean;
  validationStatus: 'valid' | 'warning' | 'invalid';
  validationMessage?: string;
  raw: Record<string, any>;
}

export interface ParseResult {
  fileType: SupportedFileType;
  fileName: string;
  fileSize: number;
  sheets?: string[];
  selectedSheet?: string;
  availableColumns: string[];
  detectedMapping: ColumnMapping;
  rows: RawParsedRow[];
}

export interface ImportPreviewSummary {
  totalRecords: number;
  validRecords: number;
  warningRecords: number;
  duplicateRecords: number;
  invalidRecords: number;
  transactions: NormalizedImportTransaction[];
}

export interface ImportCommitResult {
  success: boolean;
  batchId?: string;
  fileUrl?: string;
  totalImported: number;
  totalSkipped: number;
  totalDuplicates: number;
  error?: string;
}

/**
 * Generate a deterministic composite fingerprint for duplicate detection
 * H(family_id + date + normalized_description + amountPaise + account)
 */
export function generateTransactionFingerprint(
  familyId: string,
  date: string,
  description: string,
  amountPaise: number,
  accountName: string = ''
): string {
  const normDate = date.slice(0, 10);
  const normDesc = description.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const normAcc = accountName.trim().toLowerCase();
  const rawKey = `${familyId}:${normDate}:${normDesc}:${amountPaise}:${normAcc}`;

  // Simple, fast deterministic hash code (DJB2 / FNV variant)
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < rawKey.length; i++) {
    const char = rawKey.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }
  const part1 = Math.abs(hash1).toString(36).padStart(7, '0');
  const part2 = Math.abs(hash2).toString(36).padStart(7, '0');
  return `fp_${part1}${part2}`;
}

/**
 * Detect file type from filename and MIME type
 */
export function detectFileType(file: File): SupportedFileType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.xls')) return 'xls';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.ods')) return 'ods';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.txt')) return 'txt';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pdf')) return 'pdf';

  if (file.type === 'text/csv') return 'csv';
  if (file.type === 'application/json') return 'json';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (file.type === 'application/vnd.ms-excel') return 'xls';

  return null;
}

/**
 * Extract text from text-based PDF statement
 */
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const textDecoder = new TextDecoder('utf-8');
  const raw = textDecoder.decode(bytes);

  // Extract literal text within parenthesis inside PDF stream commands
  const textChunks: string[] = [];
  const textRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(raw)) !== null) {
    if (match[1] && match[1].length > 0) {
      textChunks.push(match[1]);
    }
  }

  // Also extract text inside array TJ commands: [(Text) 20 (More)] TJ
  const arrayRegex = /\[([^\]]+)\]\s*TJ/gi;
  while ((match = arrayRegex.exec(raw)) !== null) {
    const inner = match[1];
    const subMatches = inner.match(/\(([^)]+)\)/g);
    if (subMatches) {
      const merged = subMatches.map(m => m.slice(1, -1)).join(' ');
      if (merged.trim()) textChunks.push(merged);
    }
  }

  const combined = textChunks.join('\n');
  if (combined.length > 50) {
    return combined;
  }

  // Fallback: look for ASCII readable rows in streams
  const asciiLines = raw
    .split(/[\r\n]+/)
    .map(line => line.replace(/[^\x20-\x7E]/g, '').trim())
    .filter(line => line.length > 10 && /\d/.test(line));

  return asciiLines.join('\n');
}

/**
 * Helper to test if a row in a spreadsheet resembles a table header
 */
function isLikelyHeaderRow(row: any[]): boolean {
  if (!row || !Array.isArray(row) || row.length < 2) return false;
  const strCells = row.map(c => String(c ?? '').toLowerCase().trim());
  const hasDate = strCells.some(c =>
    c.includes('date') || c.includes('day') || c === 'dt' || c.includes('txn') || c.includes('time') || c.includes('posted')
  );
  const hasFinancialField = strCells.some(c =>
    c.includes('desc') || c.includes('source') || c.includes('payee') || c.includes('particular') ||
    c.includes('narr') || c.includes('detail') || c.includes('memo') || c.includes('remark') ||
    c.includes('amount') || c.includes('amt') || c.includes('price') || c.includes('debit') ||
    c.includes('credit') || c.includes('withdrawal') || c.includes('deposit') || c.includes('inflow') ||
    c.includes('outflow') || c.includes('spent') || c.includes('inr') || c.includes('balance') || c.includes('type')
  );
  return hasDate && hasFinancialField;
}

/**
 * Check if a spreadsheet row is a summary/total or empty row
 */
function isSummaryOrBlankRow(row: any[] | Record<string, any>): boolean {
  if (!row) return true;
  if (Array.isArray(row)) {
    const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length === 0) return true;
    const firstCell = String(nonEmpty[0] ?? '').toLowerCase().trim();
    const summaryPrefixes = ['total', 'subtotal', 'grand total', 'net savings', 'net total', 'closing balance', 'opening balance', 'summary'];
    return summaryPrefixes.some(p => firstCell.startsWith(p));
  } else {
    const values = Object.values(row);
    const nonEmpty = values.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length === 0) return true;
    const str = String(values[0] ?? '').toLowerCase().trim();
    const summaryPrefixes = ['total', 'subtotal', 'grand total', 'net savings', 'net total', 'closing balance', 'opening balance', 'summary'];
    return summaryPrefixes.some(p => str.startsWith(p));
  }
}

/**
 * Auto-detect column mapping by inspecting header names
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    ignoredCols: [],
  };

  const norm = headers.map(h => ({
    original: h,
    clean: h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));

  // Date column
  const dateMatch = norm.find(h =>
    h.clean === 'date' ||
    h.clean.includes('date') ||
    h.clean.includes('time') ||
    h.clean === 'dt' ||
    h.clean.includes('txndt') ||
    h.clean.includes('transdate') ||
    h.clean.includes('posted') ||
    h.clean === 'day'
  );
  if (dateMatch) mapping.dateCol = dateMatch.original;

  // Description column
  const descMatch = norm.find(h =>
    h.clean.includes('desc') ||
    h.clean.includes('detail') ||
    h.clean.includes('particular') ||
    h.clean.includes('narr') ||
    h.clean.includes('payee') ||
    h.clean.includes('source') ||
    h.clean.includes('incomesource') ||
    h.clean.includes('merchant') ||
    h.clean.includes('party') ||
    h.clean.includes('beneficiary') ||
    h.clean.includes('remark') ||
    h.clean.includes('memo') ||
    h.clean === 'name' ||
    h.clean === 'title' ||
    h.clean === 'item'
  );
  if (descMatch) mapping.descCol = descMatch.original;

  // Debit / Credit separate columns
  const debitMatch = norm.find(h =>
    h.clean.includes('debit') ||
    h.clean.includes('withdrawal') ||
    h.clean.includes('spent') ||
    h.clean === 'dr'
  );
  const creditMatch = norm.find(h =>
    h.clean.includes('credit') ||
    h.clean.includes('deposit') ||
    h.clean.includes('inflow') ||
    h.clean === 'cr'
  );

  if (debitMatch && creditMatch) {
    mapping.debitCol = debitMatch.original;
    mapping.creditCol = creditMatch.original;
  } else {
    // Single Amount column (prioritize amount / price / total / inr over balance)
    const amountMatch = norm.find(h =>
      h.clean === 'amount' ||
      h.clean.includes('amount') ||
      h.clean.includes('amt') ||
      h.clean.includes('price') ||
      h.clean.includes('value') ||
      (h.clean.includes('total') && !h.clean.includes('income') && !h.clean.includes('expense')) ||
      h.clean.includes('inr')
    ) || norm.find(h => h.clean.includes('balance'));
    if (amountMatch) mapping.amountCol = amountMatch.original;
  }

  // Type column
  const typeMatch = norm.find(h =>
    h.clean === 'type' ||
    h.clean.includes('txntype') ||
    h.clean.includes('categorytype') ||
    h.clean.includes('kind')
  );
  if (typeMatch) mapping.typeCol = typeMatch.original;

  // Category column
  const catMatch = norm.find(h =>
    h.clean.includes('cat') ||
    h.clean.includes('tag') ||
    h.clean.includes('classification') ||
    h.clean.includes('group')
  );
  if (catMatch) mapping.categoryCol = catMatch.original;

  // Account column
  const accMatch = norm.find(h =>
    h.clean.includes('account') ||
    h.clean.includes('wallet') ||
    h.clean.includes('bank') ||
    h.clean.includes('card')
  );
  if (accMatch) mapping.accountCol = accMatch.original;

  // Notes column
  const notesMatch = norm.find(h =>
    h.clean.includes('note') ||
    h.clean.includes('comment')
  );
  if (notesMatch) mapping.notesCol = notesMatch.original;

  return mapping;
}

/**
 * Parse an uploaded file into RawParsedRow records
 */
export async function parseUploadedFile(file: File, selectedSheet?: string): Promise<ParseResult> {
  const fileType = detectFileType(file);
  if (!fileType) {
    throw new Error('Unsupported file format. Please upload an Excel (.xlsx, .xls), CSV, ODS, Word (.docx), PDF, JSON, or TXT file.');
  }

  // 1. Excel (.xlsx, .xls) and OpenDocument (.ods)
  if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'ods') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetNames = workbook.SheetNames;
    if (sheetNames.length === 0) throw new Error('Spreadsheet has no sheets.');

    const sheetName = selectedSheet && sheetNames.includes(selectedSheet) ? selectedSheet : sheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawGrid = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (rawGrid.length === 0) throw new Error('Spreadsheet worksheet contains no data.');

    // Find all header row indices (for multi-section or single-section sheets)
    const headerIndices: number[] = [];
    for (let i = 0; i < rawGrid.length; i++) {
      if (isLikelyHeaderRow(rawGrid[i])) {
        headerIndices.push(i);
      }
    }
    if (headerIndices.length === 0) {
      headerIndices.push(0);
    }

    const allColumns = new Set<string>();
    const rows: RawParsedRow[] = [];
    let currentHeaderIdx = headerIndices[0];

    for (let rIdx = 0; rIdx < rawGrid.length; rIdx++) {
      if (headerIndices.includes(rIdx)) {
        currentHeaderIdx = rIdx;
        const hdrs = rawGrid[rIdx].map((c: any) => String(c ?? '').trim()).filter(Boolean);
        hdrs.forEach((h: string) => allColumns.add(h));
        continue;
      }

      if (isSummaryOrBlankRow(rawGrid[rIdx])) {
        continue;
      }

      const currentHeaders = rawGrid[currentHeaderIdx].map((c: any) => String(c ?? '').trim());
      const rowData = rawGrid[rIdx];

      const headerStr = currentHeaders.join(' ').toLowerCase();
      const isIncomeSection = headerStr.includes('income') && !headerStr.includes('expense');
      const isExpenseSection = headerStr.includes('expense') && !headerStr.includes('income');

      const dataObj: Record<string, any> = {};
      currentHeaders.forEach((h: string, colIdx: number) => {
        if (h) {
          dataObj[h] = rowData[colIdx];
        }
      });

      // Provide normalized aliases if missing
      if (!dataObj.Date && !dataObj.date) {
        const dKey = currentHeaders.find(h => /date|day|time/i.test(h));
        if (dKey && dataObj[dKey] !== undefined) dataObj.Date = dataObj[dKey];
      }

      if (!dataObj.Description && !dataObj.description) {
        const descKey = currentHeaders.find(h => /desc|source|payee|particular|narr|detail|remark|memo|title|name/i.test(h));
        if (descKey && dataObj[descKey] !== undefined) {
          dataObj.Description = dataObj[descKey];
          dataObj.description = dataObj[descKey];
        }
      }

      if (!dataObj.Amount && !dataObj.amount) {
        const amtKey = currentHeaders.find(h => /amount|amt|price|total|value|inr/i.test(h) && !/total (income|expense)/i.test(h));
        if (amtKey && dataObj[amtKey] !== undefined) {
          dataObj.Amount = dataObj[amtKey];
          dataObj.amount = dataObj[amtKey];
        }
      }

      if (!dataObj.Type && !dataObj.type) {
        const typeKey = currentHeaders.find(h => /^type$/i.test(h));
        if (typeKey && dataObj[typeKey]) {
          dataObj.Type = dataObj[typeKey];
        } else if (isIncomeSection) {
          dataObj.Type = 'income';
        } else if (isExpenseSection) {
          dataObj.Type = 'expense';
        }
      }

      rows.push({
        rowNumber: rIdx + 1,
        data: dataObj,
        errors: [],
      });
    }

    if (rows.length === 0) throw new Error('Spreadsheet worksheet contains no recognizable transaction data.');

    // Ensure canonical names are present in availableColumns
    ['Date', 'Description', 'Amount', 'Category', 'Type'].forEach(c => allColumns.add(c));
    const headers = Array.from(allColumns);

    return {
      fileType,
      fileName: file.name,
      fileSize: file.size,
      sheets: sheetNames,
      selectedSheet: sheetName,
      availableColumns: headers,
      detectedMapping: autoDetectColumnMapping(headers),
      rows,
    };
  }

  // 2. CSV
  if (fileType === 'csv') {
    const text = await file.text();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        complete: (results) => {
          if (!results.data || results.data.length === 0) {
            return reject(new Error('CSV file contains no readable records.'));
          }
          const rawRows = results.data as Record<string, any>[];
          const filteredRows = rawRows.filter(r => !isSummaryOrBlankRow(r));
          const headers = results.meta.fields || Object.keys(rawRows[0] || {});
          const rows: RawParsedRow[] = filteredRows.map((data, idx) => ({
            rowNumber: idx + 2,
            data,
            errors: [],
          }));

          resolve({
            fileType: 'csv',
            fileName: file.name,
            fileSize: file.size,
            availableColumns: headers,
            detectedMapping: autoDetectColumnMapping(headers),
            rows,
          });
        },
        error: (err: any) => reject(new Error(`Failed to parse CSV: ${err?.message || String(err)}`)),
      });
    });
  }

  // 3. JSON
  if (fileType === 'json') {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON format. Please ensure the file is valid JSON.');
    }

    const records = Array.isArray(parsed) ? parsed : parsed.transactions || parsed.records || parsed.data;
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('JSON file must contain an array of transaction objects.');
    }

    const headers = Array.from(new Set(records.flatMap(r => Object.keys(r || {}))));
    const rows: RawParsedRow[] = records.map((data, idx) => ({
      rowNumber: idx + 1,
      data,
      errors: [],
    }));

    return {
      fileType: 'json',
      fileName: file.name,
      fileSize: file.size,
      availableColumns: headers,
      detectedMapping: autoDetectColumnMapping(headers),
      rows,
    };
  }

  // 4. Word (.docx)
  if (fileType === 'docx') {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = result.value || '';
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      throw new Error('Word document contains no extractable text.');
    }

    // Try detecting tab-separated or pipe-separated table rows in word
    const tableRows: Record<string, any>[] = [];
    let detectedHeaders: string[] = ['Date', 'Description', 'Amount'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.includes('\t')
        ? line.split('\t').map(p => p.trim())
        : line.includes('|')
        ? line.split('|').map(p => p.trim()).filter(Boolean)
        : null;

      if (parts && parts.length >= 2) {
        if (tableRows.length === 0 && (parts[0].toLowerCase().includes('date') || parts[1].toLowerCase().includes('desc'))) {
          detectedHeaders = parts;
        } else {
          const rowObj: Record<string, any> = {};
          parts.forEach((p, idx) => {
            const h = detectedHeaders[idx] || `Column_${idx + 1}`;
            rowObj[h] = p;
          });
          tableRows.push(rowObj);
        }
      }
    }

    if (tableRows.length === 0) {
      // Fallback regex parsing for line-based financial records: "2026-05-10 Grocery 500"
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const dateMatch = line.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/);
        const amountMatch = line.match(/([₹$€£]?\s*[-+]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/);

        if (dateMatch && amountMatch) {
          const dateStr = dateMatch[0];
          const amtStr = amountMatch[0];
          const desc = line.replace(dateStr, '').replace(amtStr, '').replace(/[₹$€£]/g, '').trim();
          tableRows.push({
            Date: dateStr,
            Description: desc || 'Word Document Entry',
            Amount: amtStr,
          });
        }
      }
    }

    if (tableRows.length === 0) {
      throw new Error('No structured financial tables or transaction records could be detected in this Word document.');
    }

    const rows: RawParsedRow[] = tableRows.map((data, idx) => ({
      rowNumber: idx + 1,
      data,
      errors: [],
    }));

    return {
      fileType: 'docx',
      fileName: file.name,
      fileSize: file.size,
      availableColumns: detectedHeaders,
      detectedMapping: autoDetectColumnMapping(detectedHeaders),
      rows,
    };
  }

  // 5. TXT
  if (fileType === 'txt') {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error('Text file is empty.');

    const rows: Record<string, any>[] = [];
    const headers = ['Date', 'Description', 'Amount'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check delimiter
      let parts: string[] = [];
      if (line.includes('\t')) parts = line.split('\t').map(p => p.trim());
      else if (line.includes('|')) parts = line.split('|').map(p => p.trim()).filter(Boolean);
      else if (line.includes(',')) parts = line.split(',').map(p => p.trim());
      else {
        // Space separated line with date
        const match = line.match(/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+(.+?)\s+([-+]?\d+(?:\.\d+)?)$/);
        if (match) parts = [match[1], match[2], match[3]];
      }

      if (parts.length >= 2) {
        if (i === 0 && (parts[0].toLowerCase().includes('date') || parts[1].toLowerCase().includes('desc'))) {
          // Header line
          continue;
        }
        rows.push({
          Date: parts[0] || new Date().toISOString().slice(0, 10),
          Description: parts[1] || 'Text Entry',
          Amount: parts[2] || parts[parts.length - 1] || '0',
        });
      }
    }

    if (rows.length === 0) {
      throw new Error('No recognizable financial records detected in TXT file.');
    }

    return {
      fileType: 'txt',
      fileName: file.name,
      fileSize: file.size,
      availableColumns: headers,
      detectedMapping: autoDetectColumnMapping(headers),
      rows: rows.map((data, idx) => ({ rowNumber: idx + 1, data, errors: [] })),
    };
  }

  // 6. PDF (Text extraction)
  if (fileType === 'pdf') {
    const text = await extractTextFromPdf(file);
    if (!text || text.trim().length === 0) {
      throw new Error('Scanned or image-only PDF detected. Please upload a digital PDF, CSV, or Excel file.');
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const pdfRows: Record<string, any>[] = [];
    const headers = ['Date', 'Description', 'Amount', 'Type'];

    for (const line of lines) {
      // Look for date at start of line
      const dateMatch = line.match(/\b(\d{2}[-/.]\d{2}[-/.]\d{2,4}|\d{4}[-/.]\d{2}[-/.]\d{2})\b/);
      const amountMatch = line.match(/([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})/);

      if (dateMatch && amountMatch) {
        const dateStr = dateMatch[0];
        const amtStr = amountMatch[0];
        const desc = line.replace(dateStr, '').replace(amtStr, '').replace(/(?:CR|DR|Cr|Dr)/g, '').trim();
        const isCr = line.toUpperCase().includes('CR') || line.toLowerCase().includes('credit');

        pdfRows.push({
          Date: dateStr,
          Description: desc || 'PDF Statement Entry',
          Amount: amtStr,
          Type: isCr ? 'income' : 'expense',
        });
      }
    }

    if (pdfRows.length === 0) {
      throw new Error('Could not identify transaction tables in this PDF. The statement may be scanned or use an unsupported layout.');
    }

    return {
      fileType: 'pdf',
      fileName: file.name,
      fileSize: file.size,
      availableColumns: headers,
      detectedMapping: autoDetectColumnMapping(headers),
      rows: pdfRows.map((data, idx) => ({ rowNumber: idx + 1, data, errors: [] })),
    };
  }

  throw new Error(`File type ${fileType} is not supported.`);
}

/**
 * Parse an amount string or number safely into integer paise
 */
export function parseAmountToPaise(val: any): { amountPaise: number; isNegative: boolean } {
  if (val === null || val === undefined || val === '') {
    return { amountPaise: 0, isNegative: false };
  }

  if (typeof val === 'number') {
    const isNegative = val < 0;
    const amountPaise = Math.round(Math.abs(val) * 100);
    return { amountPaise, isNegative };
  }

  const str = String(val).trim();
  // Check for parenthesis representing negative: (100.00)
  const isParenNegative = /^\(.*\)$/.test(str);
  const cleanStr = str.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleanStr);

  if (isNaN(parsed)) {
    return { amountPaise: 0, isNegative: false };
  }

  const isNegative = isParenNegative || parsed < 0 || str.includes('-');
  const amountPaise = Math.round(Math.abs(parsed) * 100);
  return { amountPaise, isNegative };
}

/**
 * Standardize date strings into ISO format YYYY-MM-DD
 */
export function normalizeDate(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);

  if (val instanceof Date && !isNaN(val.getTime())) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const str = String(val).trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const yyyymmdd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY format
  const ddmmyyyy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalize raw parsed rows into canonical transactions, perform validation,
 * and cross-reference with existing fingerprints for duplicate detection.
 */
export function normalizeAndValidateRecords(
  rows: RawParsedRow[],
  mapping: ColumnMapping,
  familyId: string,
  existingFingerprints: Set<string>
): ImportPreviewSummary {
  let validCount = 0;
  let warningCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  const normalizedList: NormalizedImportTransaction[] = [];
  const localFingerprintSet = new Set<string>();

  const isValidUUID = (str?: string): boolean =>
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

  for (const row of rows) {
    const d = row.data;

    // 1. Extract Date
    const rawDate = mapping.dateCol ? d[mapping.dateCol] : (d.date || d.Date || d.day || d.Day || d['Transaction Date']);
    const date = normalizeDate(rawDate);

    // 2. Extract Description
    let rawDesc = mapping.descCol ? d[mapping.descCol] : undefined;
    if (!rawDesc || String(rawDesc).trim() === '') {
      rawDesc =
        d.description ||
        d.Description ||
        d['Description / Payee'] ||
        d['Income Source'] ||
        d.particulars ||
        d.Particulars ||
        d.narration ||
        d.Narration ||
        d.payee ||
        d.Payee ||
        d.details ||
        d.Details ||
        d.merchant ||
        d.Merchant ||
        d.party ||
        d.Party ||
        d.name ||
        d.Name ||
        d.title ||
        d.memo;
    }
    const description = (rawDesc ? String(rawDesc).trim() : `Imported Row #${row.rowNumber}`) || 'Imported Transaction';

    // 3. Extract Amount and Type
    let amountPaise = 0;
    let type: 'income' | 'expense' | 'transfer' = 'expense';

    const debitVal = mapping.debitCol ? d[mapping.debitCol] : (d.debit || d.Debit || d.withdrawal || d.Withdrawal || d['Withdrawal Amt.'] || d['Withdrawal Amount']);
    const creditVal = mapping.creditCol ? d[mapping.creditCol] : (d.credit || d.Credit || d.deposit || d.Deposit || d['Deposit Amt.'] || d['Deposit Amount'] || d.inflow || d.Inflow);

    const debitResult = debitVal !== undefined && debitVal !== '' ? parseAmountToPaise(debitVal) : { amountPaise: 0, isNegative: false };
    const creditResult = creditVal !== undefined && creditVal !== '' ? parseAmountToPaise(creditVal) : { amountPaise: 0, isNegative: false };

    if (creditResult.amountPaise > 0 && debitResult.amountPaise <= 0) {
      amountPaise = creditResult.amountPaise;
      type = 'income';
    } else if (debitResult.amountPaise > 0 && creditResult.amountPaise <= 0) {
      amountPaise = debitResult.amountPaise;
      type = 'expense';
    } else {
      let rawAmount = mapping.amountCol ? d[mapping.amountCol] : undefined;
      if (rawAmount === undefined || rawAmount === '') {
        rawAmount = d.amount ?? d.Amount ?? d['Amount (INR)'] ?? d.price ?? d.Price ?? d.total ?? d.Total;
      }
      const parsed = parseAmountToPaise(rawAmount);
      amountPaise = parsed.amountPaise;

      // Determine type
      const rawType = (mapping.typeCol && d[mapping.typeCol]) ? d[mapping.typeCol] : (d.type || d.Type);
      if (rawType) {
        const typeStr = String(rawType).toLowerCase();
        if (typeStr.includes('inc') || typeStr.includes('credit') || typeStr.includes('deposit') || typeStr.includes('salary')) {
          type = 'income';
        } else if (typeStr.includes('transfer')) {
          type = 'transfer';
        } else {
          type = 'expense';
        }
      } else if (parsed.isNegative) {
        type = 'expense';
      } else {
        type = 'expense';
      }
    }

    // 4. Extract Category & Account
    const categoryName = mapping.categoryCol
      ? String(d[mapping.categoryCol] || '').trim()
      : (d.category || d.Category || d.Classification || d.classification ? String(d.category || d.Category || d.Classification || d.classification).trim() : undefined);
    const accountName = mapping.accountCol
      ? String(d[mapping.accountCol] || '').trim()
      : (d.account || d.Account ? String(d.account || d.Account).trim() : undefined);
    const notes = mapping.notesCol
      ? String(d[mapping.notesCol] || '').trim()
      : (d.notes || d.Notes || d.comment ? String(d.notes || d.Notes || d.comment).trim() : undefined);

    // 5. Duplicate Detection Fingerprint
    const fingerprint = generateTransactionFingerprint(familyId, date, description, amountPaise, accountName);

    let isDuplicate = false;
    let duplicateReason: string | undefined = undefined;

    if (existingFingerprints.has(fingerprint)) {
      isDuplicate = true;
      duplicateReason = 'Matches an existing transaction already recorded in your family database.';
      duplicateCount++;
    } else if (localFingerprintSet.has(fingerprint)) {
      isDuplicate = true;
      duplicateReason = 'Duplicate entry found within this same imported file.';
      duplicateCount++;
    } else {
      localFingerprintSet.add(fingerprint);
    }

    // 6. Validation Assessment
    let validationStatus: 'valid' | 'warning' | 'invalid' = 'valid';
    let validationMessage: string | undefined = undefined;

    if (amountPaise <= 0) {
      validationStatus = 'invalid';
      validationMessage = 'Transaction amount is zero or could not be parsed.';
      invalidCount++;
    } else if (isDuplicate) {
      validationStatus = 'warning';
      validationMessage = duplicateReason;
      warningCount++;
    } else if (!rawDate) {
      validationStatus = 'warning';
      validationMessage = 'Missing date in file, defaulted to today.';
      warningCount++;
    } else {
      validCount++;
    }

    normalizedList.push({
      id: `imp-txn-${Date.now()}-${row.rowNumber}`,
      rowNumber: row.rowNumber,
      date,
      description,
      amountPaise,
      type,
      categoryName,
      accountName,
      notes,
      fingerprint,
      isDuplicate,
      duplicateReason,
      selected: !isDuplicate && validationStatus !== 'invalid',
      validationStatus,
      validationMessage,
      raw: d,
    });
  }

  return {
    totalRecords: rows.length,
    validRecords: validCount,
    warningRecords: warningCount,
    duplicateRecords: duplicateCount,
    invalidRecords: invalidCount,
    transactions: normalizedList,
  };
}

/**
 * Upload the original file to private Supabase Storage:
 * family-files/{familyId}/imports/{batchId}/{fileName}
 */
export async function uploadOriginalImportFile(
  file: File,
  familyId: string,
  batchId: string
): Promise<{ path: string; url?: string } | null> {
  try {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${familyId}/imports/${batchId}/${cleanFileName}`;

    const { data, error } = await supabase.storage
      .from('family-files')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('[Storage Notice] Could not upload original file to family-files bucket:', error.message);
      return null;
    }

    return { path: data.path };
  } catch (err) {
    console.warn('[Storage Error] File upload deferred:', err);
    return null;
  }
}

/**
 * Commit the confirmed imported transactions into Supabase PostgreSQL
 */
export async function commitImportBatch(
  file: File,
  familyId: string,
  userId: string,
  records: NormalizedImportTransaction[],
  accountId?: string,
  categoryId?: string
): Promise<ImportCommitResult> {
  const batchId = crypto.randomUUID();
  const selectedRecords = records.filter(r => r.selected);
  const skippedCount = records.length - selectedRecords.length;
  const duplicateCount = records.filter(r => r.isDuplicate).length;

  if (selectedRecords.length === 0) {
    return {
      success: false,
      error: 'No valid transactions selected for import.',
      totalImported: 0,
      totalSkipped: skippedCount,
      totalDuplicates: duplicateCount,
    };
  }

  const isValidUUID = (str?: string): boolean =>
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

  let resolvedFamilyId = isValidUUID(familyId) ? familyId : null;
  let resolvedUserId = isValidUUID(userId) ? userId : null;

  // Auto-resolve real UUIDs from session if running with demo/mock IDs
  if (!resolvedFamilyId || !resolvedUserId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        resolvedUserId = authData.user.id;
        const { data: mems } = await supabase
          .from('family_members')
          .select('family_id')
          .eq('user_id', authData.user.id)
          .limit(1);
        if (mems && mems.length > 0) {
          resolvedFamilyId = mems[0].family_id;
        }
      }
    } catch (resolveErr) {
      console.warn('Could not auto-resolve database workspace IDs:', resolveErr);
    }
  }

  // Auto-resolve account and category if not supplied or invalid UUID
  let resolvedAccountId = isValidUUID(accountId) ? accountId : null;
  let resolvedCategoryId = isValidUUID(categoryId) ? categoryId : null;

  if (resolvedFamilyId && (!resolvedAccountId || !resolvedCategoryId)) {
    try {
      if (!resolvedAccountId) {
        const { data: accs } = await supabase
          .from('accounts')
          .select('id')
          .eq('family_id', resolvedFamilyId)
          .limit(1);
        if (accs && accs.length > 0) {
          resolvedAccountId = accs[0].id;
        }
      }
      if (!resolvedCategoryId) {
        const { data: cats } = await supabase
          .from('categories')
          .select('id')
          .eq('family_id', resolvedFamilyId)
          .limit(1);
        if (cats && cats.length > 0) {
          resolvedCategoryId = cats[0].id;
        }
      }
    } catch (acErr) {
      console.warn('Could not auto-resolve default account/category:', acErr);
    }
  }

  // 1. Upload original file to private Storage
  const storageUpload = resolvedFamilyId
    ? await uploadOriginalImportFile(file, resolvedFamilyId, batchId)
    : null;

  // 2. Create import_batches record in PostgreSQL if workspace ID available
  if (resolvedFamilyId && resolvedUserId) {
    try {
      await supabase.from('import_batches').insert({
        id: batchId,
        family_id: resolvedFamilyId,
        uploaded_by: resolvedUserId,
        file_name: file.name,
        file_type: detectFileType(file) || 'other',
        file_path: storageUpload?.path || null,
        file_size: file.size,
        total_records: records.length,
        successful_records: selectedRecords.length,
        failed_records: records.filter(r => r.validationStatus === 'invalid').length,
        duplicate_records: duplicateCount,
        status: 'completed',
      });
    } catch (batchErr) {
      console.warn('[Notice] import_batches table insertion deferred:', batchErr);
    }
  }

  // 3. Build database transaction rows
  const dbTransactions = selectedRecords.map(r => ({
    family_id: resolvedFamilyId,
    user_id: resolvedUserId,
    account_id: resolvedAccountId,
    category_id: resolvedCategoryId,
    type: r.type,
    amount: r.amountPaise,
    description: r.description,
    transaction_date: `${r.date}T12:00:00.000Z`,
    payment_method: 'File Import',
    is_shared: true,
    status: 'cleared',
    source: 'import',
    source_file_id: file.name,
    import_batch_id: batchId,
    fingerprint: r.fingerprint,
    created_by: resolvedUserId,
  }));

  // Chunk insertions to prevent payload size limits (50 items per chunk)
  const chunkSize = 50;
  let insertedCount = 0;

  if (resolvedFamilyId) {
    try {
      for (let i = 0; i < dbTransactions.length; i += chunkSize) {
        const chunk = dbTransactions.slice(i, i + chunkSize);
        const { error } = await supabase.from('transactions').insert(chunk);
        if (error) {
          console.error('Failed to insert transaction chunk:', error);
          throw error;
        }
        insertedCount += chunk.length;
      }
    } catch (insertErr: any) {
      console.warn('PostgreSQL transaction insert deferred or restricted:', insertErr);
      return {
        success: false,
        batchId,
        totalImported: insertedCount,
        totalSkipped: skippedCount,
        totalDuplicates: duplicateCount,
        error: insertErr?.message || 'Failed to save transactions to database.',
      };
    }
  } else {
    // Local / Offline workspace import mode
    insertedCount = selectedRecords.length;
  }

  return {
    success: true,
    batchId,
    fileUrl: storageUpload?.path,
    totalImported: insertedCount,
    totalSkipped: skippedCount,
    totalDuplicates: duplicateCount,
  };
}

/**
 * Rollback / Undo an imported batch (Section 41)
 */
export async function undoImportBatch(batchId: string): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    // 1. Try atomic database RPC
    const { data, error } = await supabase.rpc('rollback_import_batch', {
      p_batch_id: batchId,
    });

    if (!error && data) {
      return { success: true, deletedCount: data.deleted_transactions };
    }
  } catch (rpcErr) {
    console.warn('RPC rollback_import_batch notice:', rpcErr);
  }

  // Direct table deletion fallback
  try {
    const { data, error } = await supabase
      .from('transactions')
      .delete()
      .eq('import_batch_id', batchId)
      .select();

    if (error) throw error;

    await supabase
      .from('import_batches')
      .update({ status: 'rolled_back' })
      .eq('id', batchId);

    return { success: true, deletedCount: data?.length || 0 };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to undo import.' };
  }
}
