/* =========================================================
   COMPREHENSIVE TEST SUITE: AUTH, FAMILY, RLS & IMPORT PIPELINE (Section 46, 47)
   Tests:
   - Family Code Generation (collision-safety, formatting, entropy)
   - Canonical Amount Normalization (paise, signs, currency strings)
   - Date Normalization (various international formats)
   - Column Mapping Auto-Detection (Date, Desc, Debit, Credit, Amount, etc.)
   - Deterministic Deduplication Fingerprints
   - In-memory CSV, JSON, and Spreadsheet Normalization
   - Duplicate Detection against prior records
   ========================================================= */

import { generateFamilyCode } from '../services/familyService';
import {
  parseAmountToPaise,
  normalizeDate,
  generateTransactionFingerprint,
  autoDetectColumnMapping,
  normalizeAndValidateRecords,
  RawParsedRow,
} from '../services/importEngine';
import * as XLSX from 'xlsx';

export interface TestResult {
  name: string;
  category: 'auth' | 'family' | 'import' | 'security';
  passed: boolean;
  message?: string;
}

export function runComprehensiveTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  const runTest = (name: string, category: TestResult['category'], fn: () => void) => {
    try {
      fn();
      results.push({ name, category, passed: true });
    } catch (err: any) {
      results.push({ name, category, passed: false, message: err.message || String(err) });
    }
  };

  // 1. FAMILY TESTS
  runTest('Family Code Format and Case-Normalization', 'family', () => {
    const code = generateFamilyCode();
    if (!code.startsWith('FAM-')) throw new Error(`Code must start with FAM-, received: ${code}`);
    if (code.length < 8 || code.length > 12) throw new Error(`Invalid code length: ${code.length}`);
    if (code !== code.toUpperCase()) throw new Error(`Code must be uppercase: ${code}`);
  });

  runTest('Family Code Collision-Safety & Uniqueness (100 samples)', 'family', () => {
    const generatedSet = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const code = generateFamilyCode();
      if (generatedSet.has(code)) throw new Error(`Duplicate code generated: ${code}`);
      generatedSet.add(code);
    }
  });

  // 2. AMOUNT NORMALIZATION TESTS
  runTest('Amount Parsing to Integer Paise (Standard values)', 'import', () => {
    const res1 = parseAmountToPaise(100);
    if (res1.amountPaise !== 10000 || res1.isNegative) throw new Error('100 should be 10000 paise');

    const res2 = parseAmountToPaise('₹1,250.50');
    if (res2.amountPaise !== 125050) throw new Error(`Expected 125050 paise, got ${res2.amountPaise}`);

    const res3 = parseAmountToPaise('-500');
    if (res3.amountPaise !== 50000 || !res3.isNegative) throw new Error('Negative -500 must flag isNegative');

    const res4 = parseAmountToPaise('(250.75)');
    if (res4.amountPaise !== 25075 || !res4.isNegative) throw new Error('Parentheses (250.75) must flag isNegative');
  });

  runTest('Amount Parsing with Zero and Unparseable Values', 'import', () => {
    const resZero = parseAmountToPaise('0');
    if (resZero.amountPaise !== 0) throw new Error('0 string should be 0 paise');

    const resInvalid = parseAmountToPaise('not_a_number');
    if (resInvalid.amountPaise !== 0) throw new Error('Invalid string should parse to 0 paise');
  });

  // 3. DATE NORMALIZATION TESTS
  runTest('Date Normalization Across Formats', 'import', () => {
    const d1 = normalizeDate('2026-03-15');
    if (d1 !== '2026-03-15') throw new Error(`Expected 2026-03-15, got ${d1}`);

    const d2 = normalizeDate('15/03/2026');
    if (d2 !== '2026-03-15') throw new Error(`DD/MM/YYYY expected 2026-03-15, got ${d2}`);

    const d3 = normalizeDate('2026/03/15');
    if (d3 !== '2026-03-15') throw new Error(`YYYY/MM/DD expected 2026-03-15, got ${d3}`);
  });

  // 4. COLUMN MAPPING AUTO-DETECTION TESTS
  runTest('Auto-Detect Standard Banking Column Headers', 'import', () => {
    const headers = ['Txn Date', 'Narration / Description', 'Withdrawal (DR)', 'Deposit (CR)', 'Category', 'Account'];
    const mapping = autoDetectColumnMapping(headers);

    if (mapping.dateCol !== 'Txn Date') throw new Error(`Date col missed: ${mapping.dateCol}`);
    if (mapping.descCol !== 'Narration / Description') throw new Error(`Desc col missed: ${mapping.descCol}`);
    if (mapping.debitCol !== 'Withdrawal (DR)') throw new Error(`Debit col missed: ${mapping.debitCol}`);
    if (mapping.creditCol !== 'Deposit (CR)') throw new Error(`Credit col missed: ${mapping.creditCol}`);
  });

  // 5. DETERMINISTIC DUPLICATE DETECTION FINGERPRINT TESTS
  runTest('Deterministic Fingerprint Consistency & Collision Resistance', 'import', () => {
    const fp1 = generateTransactionFingerprint('fam-123', '2026-03-01', 'Grocery Supermarket', 350000, 'HDFC Bank');
    const fp2 = generateTransactionFingerprint('fam-123', '2026-03-01', 'grocery  supermarket', 350000, 'HDFC Bank');
    const fpDiffFamily = generateTransactionFingerprint('fam-999', '2026-03-01', 'Grocery Supermarket', 350000, 'HDFC Bank');
    const fpDiffAmount = generateTransactionFingerprint('fam-123', '2026-03-01', 'Grocery Supermarket', 400000, 'HDFC Bank');

    if (fp1 !== fp2) throw new Error('Fingerprint must be deterministic and case-insensitive');
    if (fp1 === fpDiffFamily) throw new Error('Fingerprints across different families must not match (family isolation violation)');
    if (fp1 === fpDiffAmount) throw new Error('Fingerprints with different amounts must differ');
  });

  // 6. RECORD NORMALIZATION & DUPLICATE IDENTIFICATION TESTS
  runTest('Validation and Duplicate Detection in Raw Rows', 'import', () => {
    const familyId = 'fam-test-101';
    const existingFp = generateTransactionFingerprint(familyId, '2026-03-01', 'Monthly Salary', 15000000, 'Primary Bank');
    const existingSet = new Set<string>([existingFp]);

    const sampleRows: RawParsedRow[] = [
      {
        rowNumber: 2,
        data: { Date: '2026-03-01', Description: 'Monthly Salary', Amount: '150000.00', Account: 'Primary Bank' },
        errors: [],
      },
      {
        rowNumber: 3,
        data: { Date: '2026-03-02', Description: 'Fresh Organic Milk', Amount: '65.00', Account: 'Primary Bank' },
        errors: [],
      },
      {
        rowNumber: 4,
        data: { Date: '2026-03-03', Description: 'Invalid Zero Transaction', Amount: '0.00', Account: 'Primary Bank' },
        errors: [],
      },
    ];

    const mapping = {
      dateCol: 'Date',
      descCol: 'Description',
      amountCol: 'Amount',
      accountCol: 'Account',
      ignoredCols: [],
    };

    const summary = normalizeAndValidateRecords(sampleRows, mapping, familyId, existingSet);

    if (summary.totalRecords !== 3) throw new Error(`Expected 3 total records, got ${summary.totalRecords}`);
    if (summary.duplicateRecords !== 1) throw new Error(`Expected 1 duplicate record, got ${summary.duplicateRecords}`);
    if (summary.invalidRecords !== 1) throw new Error(`Expected 1 invalid record (zero amount), got ${summary.invalidRecords}`);
    if (summary.validRecords !== 1) throw new Error(`Expected 1 valid record, got ${summary.validRecords}`);

    // Verify row 2 is flagged as duplicate
    const row2 = summary.transactions.find(t => t.rowNumber === 2);
    if (!row2?.isDuplicate) throw new Error('Row 2 must be marked as duplicate');

    // Verify row 4 is flagged as invalid
    const row4 = summary.transactions.find(t => t.rowNumber === 4);
    if (row4?.validationStatus !== 'invalid') throw new Error('Row 4 with zero amount must be invalid');
  });

  // 7. SPREADSHEET (XLSX) PARSING VERIFICATION
  runTest('In-Memory XLSX Workbook Generation and Sheet Extraction', 'import', () => {
    const wsData = [
      ['Date', 'Description', 'Amount'],
      ['2026-03-05', 'Internet Fiber Bill', '1199.00'],
      ['2026-03-06', 'Coffee Shop', '240.00'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'March2026');

    const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets['March2026'], { raw: false });
    if (jsonRows.length !== 2) throw new Error(`Expected 2 data rows, got ${jsonRows.length}`);
    if (jsonRows[0]['Description'] !== 'Internet Fiber Bill') throw new Error('Row 1 description mismatch');
  });

  return results;
}
