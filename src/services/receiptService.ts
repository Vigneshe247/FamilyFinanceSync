/* =========================================================
   RECEIPT STORAGE & SECURE ACCESS SERVICE
   Provides secure upload, signed temporary URLs, and private downloads
   for family transaction receipts. Path structure: <FAMILY_ID>/<USER_ID>/<UUID>-<filename>
   ========================================================= */

import { supabase } from './supabase';

export interface UploadReceiptParams {
  familyId: string;
  file: File;
  transactionId?: string;
}

export interface UploadReceiptResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

/**
 * Upload a receipt file to the private 'receipts' bucket
 * Path format: FAMILY_ID/USER_ID/UUID-filename
 */
export async function uploadReceipt({
  familyId,
  file,
  transactionId,
}: UploadReceiptParams): Promise<UploadReceiptResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User is not authenticated' };
    }

    if (!familyId) {
      return { success: false, error: 'Active family ID is required' };
    }

    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${familyId}/${user.id}/${uniqueId}-${cleanFileName}`;

    const { data, error } = await supabase
      .storage
      .from('receipts')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Receipt upload failed:', error);
      return { success: false, error: error.message || 'Receipt upload failed' };
    }

    const receiptPath = data.path;

    // Store receipt reference in PostgreSQL transactions table if transactionId provided
    if (transactionId) {
      const { error: updateErr } = await supabase
        .from('transactions')
        .update({ receipt_path: receiptPath })
        .eq('id', transactionId);

      if (updateErr) {
        console.warn('Updated storage path, but failed to link receipt_path to transaction:', updateErr.message);
      }
    }

    return {
      success: true,
      path: receiptPath,
    };
  } catch (err: any) {
    console.error('Unexpected receipt upload error:', err);
    return { success: false, error: err.message || 'Failed to upload receipt' };
  }
}

/**
 * Generate a temporary signed URL for viewing/downloading private receipts
 * Default expiration: 5 minutes (300 seconds)
 */
export async function getReceiptSignedUrl(
  receiptPath: string,
  expiresInSeconds: number = 300
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .storage
      .from('receipts')
      .createSignedUrl(receiptPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Could not generate signed URL' };
    }

    return { success: true, url: data.signedUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create signed URL' };
  }
}

/**
 * Directly download a private receipt file as Blob
 */
export async function downloadReceipt(receiptPath: string): Promise<{ success: boolean; blob?: Blob; error?: string }> {
  try {
    const { data, error } = await supabase
      .storage
      .from('receipts')
      .download(receiptPath);

    if (error || !data) {
      return { success: false, error: error?.message || 'Could not download receipt file' };
    }

    return { success: true, blob: data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Receipt download failed' };
  }
}
