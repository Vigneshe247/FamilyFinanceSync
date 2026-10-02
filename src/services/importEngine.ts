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
 * Auto-detect column mapping by inspecting header names
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    ignoredCols: [],
  };

  const norm = headers.map(h => ({ original: h, clean: h.trim().toLowerCase() }));

  // Date column
  const dateMatch = norm.find(h =>
    h.clean.includes('date') ||
    h.clean.includes('time') ||
    h.clean === 'dt' ||
    h.clean.includes('txn_dt') ||
    h.clean.includes('posted')
  );
  if (dateMatch) mapping.dateCol = dateMatch.original;

  // Description column
  const descMatch = norm.find(h =>
    h.clean.includes('desc') ||
    h.clean.includes('detail') ||
    h.clean.includes('narr') ||
    h.clean.includes('payee') ||
    h.clean.includes('remark') ||
    h.clean.includes('memo') ||
    h.clean === 'name' ||
    h.clean === 'title'
  );
  if (descMatch) mapping.descCol = descMatch.original;

  // Debit / Credit separate columns
  const debitMatch = norm.find(h =>
    h.clean.includes('debit') ||
    h.clean.includes('withdrawal') ||
    h.clean.includes('spent') ||
    h.clean.includes('expense')
  );
  const creditMatch = norm.find(h =>
    h.clean.includes('credit') ||
    h.clean.includes('deposit') ||
    h.clean.includes('income') ||
    h.clean.includes('inflow')
  );

  if (debitMatch && creditMatch) {
    mapping.debitCol = debitMatch.original;
    mapping.creditCol = creditMatch.original;
  } else {
    // Single Amount column
    const amountMatch = norm.find(h =>
      h.clean.includes('amount') ||
      h.clean.includes('price') ||
      h.clean.includes('value') ||
      h.clean.includes('total') ||
      h.clean === 'amt' ||
      h.clean.includes('balance')
    );
    if (amountMatch) mapping.amountCol = amountMatch.original;
  }

  // Type column
  const typeMatch = norm.find(h =>
    h.clean === 'type' ||
    h.clean.includes('txn_type') ||
    h.clean.includes('category_type') ||
    h.clean.includes('kind')
  );
  if (typeMatch) mapping.typeCol = typeMatch.original;

  // Category column
  const catMatch = norm.find(h =>
    h.clean.includes('cat') ||
    h.clean.includes('tag') ||
    h.clean.includes('classification')
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
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '', raw: false });

    if (rawRows.length === 0) throw new Error('Spreadsheet worksheet contains no data.');

    const headers = Object.keys(rawRows[0] || {});
    const rows: RawParsedRow[] = rawRows.map((data, idx) => ({
      rowNumber: idx + 2, // Header is row 1
      data,
      errors: [],
    }));

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
          const headers = results.meta.fields || Object.keys(rawRows[0] || {});
          const rows: RawParsedRow[] = rawRows.map((data, idx) => ({
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

  for (const row of rows) {
    const d = row.data;

    // 1. Extract Date
    const rawDate = mapping.dateCol ? d[mapping.dateCol] : (d.date || d.Date);
    const date = normalizeDate(rawDate);

    // 2. Extract Description
    const rawDesc = mapping.descCol ? d[mapping.descCol] : (d.description || d.Description || d.name || d.title);
    const description = (rawDesc ? String(rawDesc).trim() : `Imported Row #${row.rowNumber}`) || 'Imported Transaction';

    // 3. Extract Amount and Type
    let amountPaise = 0;
    let type: 'income' | 'expense' | 'transfer' = 'expense';

    if (mapping.debitCol && mapping.creditCol) {
      const debitVal = d[mapping.debitCol];
      const creditVal = d[mapping.creditCol];

      const debitResult = parseAmountToPaise(debitVal);
      const creditResult = parseAmountToPaise(creditVal);

      if (creditResult.amountPaise > 0) {
        amountPaise = creditResult.amountPaise;
        type = 'income';
      } else {
        amountPaise = debitResult.amountPaise;
        type = 'expense';
      }
    } else {
      const rawAmount = mapping.amountCol ? d[mapping.amountCol] : (d.amount || d.Amount || d.price);
      const parsed = parseAmountToPaise(rawAmount);
      amountPaise = parsed.amountPaise;

      // Determine type
      if (mapping.typeCol && d[mapping.typeCol]) {
        const typeStr = String(d[mapping.typeCol]).toLowerCase();
        if (typeStr.includes('inc') || typeStr.includes('credit') || typeStr.includes('deposit')) {
          type = 'income';
        } else if (typeStr.includes('transfer')) {
          type = 'transfer';
        } else {
          type = 'expense';
        }
      } else if (parsed.isNegative) {
        type = 'expense';
      } else {
        // Default to expense unless positive explicitly marked or zero
        type = 'expense';
      }
    }

    // 4. Extract Category & Account
    const categoryName = mapping.categoryCol ? String(d[mapping.categoryCol] || '').trim() : undefined;
    const accountName = mapping.accountCol ? String(d[mapping.accountCol] || '').trim() : undefined;
    const notes = mapping.notesCol ? String(d[mapping.notesCol] || '').trim() : undefined;

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

  // 1. Upload original file to private Storage
  const storageUpload = await uploadOriginalImportFile(file, familyId, batchId);

  // 2. Create import_batches record in PostgreSQL
  try {
    await supabase.from('import_batches').insert({
      id: batchId,
      family_id: familyId,
      uploaded_by: userId,
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

  // 3. Build database transaction rows
  const dbTransactions = selectedRecords.map(r => ({
    family_id: familyId,
    user_id: userId,
    account_id: accountId || null,
    category_id: categoryId || null,
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
    created_by: userId,
  }));

  // Chunk insertions to prevent payload size limits (50 items per chunk)
  const chunkSize = 50;
  let insertedCount = 0;

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
    console.error('PostgreSQL transaction insert failed:', insertErr);
    return {
      success: false,
      batchId,
      totalImported: insertedCount,
      totalSkipped: skippedCount,
      totalDuplicates: duplicateCount,
      error: insertErr?.message || 'Failed to save transactions to database.',
    };
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
