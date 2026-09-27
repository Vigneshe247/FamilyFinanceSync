/* =========================================================
   FAMILY DATA BACKUP & PRIVATE EXPORT SERVICE (Module 14-20)
   Generates secure, structured JSON data backups for family workspaces.
   Saves exports privately under exports/<FAMILY_ID>/<YEAR>/family-export-<DATE>.json
   and provides browser download functionality.
   ========================================================= */

import { supabase } from './supabase';

export interface FamilyBackupData {
  backupVersion: number;
  exportedAt: string;
  family: {
    id: string;
    name: string;
    description?: string;
  };
  members: any[];
  accounts: any[];
  categories: any[];
  transactions: any[];
  budgets: any[];
}

export interface GenerateBackupParams {
  familyId: string;
  familyName: string;
  familyDescription?: string;
  members?: any[];
  accounts?: any[];
  categories?: any[];
  transactions?: any[];
  budgets?: any[];
}

export interface BackupResult {
  success: boolean;
  filePath?: string;
  signedUrl?: string;
  backupData?: FamilyBackupData;
  error?: string;
}

/**
 * Generate and upload a private JSON data backup to the 'exports' bucket
 */
export async function generateFamilyBackup({
  familyId,
  familyName,
  familyDescription,
  members = [],
  accounts = [],
  categories = [],
  transactions = [],
  budgets = [],
}: GenerateBackupParams): Promise<BackupResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User is not authenticated' };
    }

    if (!familyId) {
      return { success: false, error: 'Active family ID is required' };
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const yearStr = now.getFullYear().toString();

    // Clean sensitive user credentials / internal tokens if any
    const cleanMembers = members.map(m => ({
      id: m.id,
      user_id: m.user_id || m.id,
      name: m.user?.name || m.name || 'Member',
      role: m.role || 'member',
      status: m.status || 'active',
      joined_at: m.joined_at || m.created_at,
    }));

    const cleanAccounts = accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: a.currency || 'INR',
    }));

    const cleanCategories = categories.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
    }));

    const cleanTransactions = transactions.map(t => ({
      id: t.id,
      amount: t.amountPaise ? t.amountPaise / 100 : t.amount,
      type: t.type,
      category_id: t.categoryId || t.category_id,
      description: t.description,
      transaction_date: t.transactionDate || t.transaction_date,
      payment_method: t.paymentMethod || t.payment_method,
      receipt_path: t.receipt_path || t.receiptPath || null,
    }));

    const backupData: FamilyBackupData = {
      backupVersion: 1,
      exportedAt: now.toISOString(),
      family: {
        id: familyId,
        name: familyName,
        description: familyDescription || '',
      },
      members: cleanMembers,
      accounts: cleanAccounts,
      categories: cleanCategories,
      transactions: cleanTransactions,
      budgets: budgets,
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const fileName = `family-export-${dateStr}.json`;
    const filePath = `${familyId}/${yearStr}/${fileName}`;

    // Upload to private 'exports' bucket
    const fileBlob = new Blob([jsonString], { type: 'application/json' });
    const { data: uploadData, error: uploadErr } = await supabase
      .storage
      .from('exports')
      .upload(filePath, fileBlob, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      console.warn('Storage export notice:', uploadErr.message);
    }

    // Trigger local browser download
    triggerBrowserDownload(jsonString, `FamilyFinanceSync-Backup-${dateStr}.json`);

    // Create temporary signed URL for storage backup reference
    let signedUrl = '';
    if (uploadData?.path) {
      const { data: signedData } = await supabase
        .storage
        .from('exports')
        .createSignedUrl(uploadData.path, 300);
      signedUrl = signedData?.signedUrl || '';
    }

    return {
      success: true,
      filePath: uploadData?.path || filePath,
      signedUrl,
      backupData,
    };
  } catch (err: any) {
    console.error('Backup generation error:', err);
    return { success: false, error: err.message || 'Failed to generate backup' };
  }
}

/**
 * Trigger immediate browser download of backup file Blob
 */
export function triggerBrowserDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
