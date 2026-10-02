/* =========================================================
   SUPABASE REAL-TIME DATA REPOSITORY & MUTATION SERVICE
   Specification: Sections 1, 7, 8, 9, 10, 24, 36, 45
   Implements:
   - Family Workspace Data Fetching
   - Real-Time Pub/Sub Channel Subscriptions: family:{familyId}
   - Transactional mutations & automatic audit logging
   ========================================================= */

import { supabase } from './supabase';
import { saveKnownProfile, updateFamilyMemberRole } from './familyService';
import {
  Family,
  FamilyMember,
  Account,
  Category,
  Transaction,
  Budget,
  SavingsGoal,
  ExpenseRequest,
  AuditLogItem,
  NotificationItem,
} from '../types';

export type RealtimeChangeHandler = (
  table: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: any,
  oldRow: any
) => void;

export const supabaseDataService = {
  /**
   * Fetch all records for a family workspace
   */
  async fetchFamilyWorkspace(familyId: string) {
    try {
      const [
        familyRes,
        membersRes,
        accountsRes,
        categoriesRes,
        transactionsRes,
        budgetsRes,
        goalsRes,
        requestsRes,
        auditLogsRes,
      ] = await Promise.all([
        supabase.from('families').select('*').eq('id', familyId).maybeSingle(),
        supabase.from('family_members').select('id, family_id, user_id, role, status, joined_at, created_at, updated_at').eq('family_id', familyId),
        supabase.from('accounts').select('*').eq('family_id', familyId),
        supabase.from('categories').select('*').eq('family_id', familyId),
        supabase
          .from('transactions')
          .select('*')
          .eq('family_id', familyId)
          .order('transaction_date', { ascending: false })
          .limit(100),
        supabase.from('budgets').select('*, budget_categories(*)').eq('family_id', familyId),
        supabase.from('savings_goals').select('*').eq('family_id', familyId),
        supabase.from('requests').select('*').eq('family_id', familyId).order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').eq('family_id', familyId).order('created_at', { ascending: false }).limit(50),
      ]);

      const rawMembers = membersRes.data || [];
      const userIds = rawMembers.map((m: any) => m.user_id).filter(Boolean);

      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, email, phone, avatar_url, updated_at')
            .in('id', userIds);

          if (profs && profs.length > 0) {
            profs.forEach((p: any) => {
              profilesMap[p.id] = p;
              saveKnownProfile(p.id, {
                id: p.id,
                name: p.full_name || p.email?.split('@')[0] || 'Family Member',
                email: p.email || '',
                avatar_url: p.avatar_url,
              });
            });
          }
        } catch (pErr) {
          console.warn('Supabase profiles query notice:', pErr);
        }
      }

      const enrichedMembers = rawMembers.map((m: any) => {
        const prof = profilesMap[m.user_id];
        const memberName = prof?.full_name || (m.role === 'family_head' ? 'Family Head' : 'Family Member');
        const memberEmail = prof?.email || '';
        const avatarUrl = prof?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`;

        return {
          ...m,
          user: {
            id: m.user_id,
            name: memberName,
            email: memberEmail,
            avatar_url: avatarUrl,
            created_at: m.created_at || new Date().toISOString(),
            updated_at: m.updated_at || new Date().toISOString(),
          }
        };
      });

      return {
        family: familyRes.data || null,
        members: enrichedMembers,
        accounts: accountsRes.data || [],
        categories: categoriesRes.data || [],
        transactions: transactionsRes.data || [],
        budgets: budgetsRes.data || [],
        goals: goalsRes.data || [],
        requests: requestsRes.data || [],
        auditLogs: auditLogsRes.data || [],
      };
    } catch (err) {
      console.warn('Supabase fetchFamilyWorkspace fallback:', err);
      return null;
    }
  },

  /**
   * Subscribe to real-time events on the family-scoped channel (Section 8, 10, 36)
   */
  subscribeToFamilyRealtime(familyId: string, onEvent: RealtimeChangeHandler): () => void {
    const channelName = `family:${familyId}`;

    const channel = supabase
      .channel(channelName)
      // 1. Transactions stream
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `family_id=eq.${familyId}` },
        payload => {
          onEvent('transactions', payload.eventType as any, payload.new, payload.old);
        }
      )
      // 2. Requests stream
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests', filter: `family_id=eq.${familyId}` },
        payload => {
          onEvent('requests', payload.eventType as any, payload.new, payload.old);
        }
      )
      // 3. Accounts stream
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `family_id=eq.${familyId}` },
        payload => {
          onEvent('accounts', payload.eventType as any, payload.new, payload.old);
        }
      )
      // 4. Audit Logs stream (Activity Feed)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: `family_id=eq.${familyId}` },
        payload => {
          onEvent('audit_logs', 'INSERT', payload.new, null);
        }
      )
      // 5. Savings Goals stream
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'savings_goals', filter: `family_id=eq.${familyId}` },
        payload => {
          onEvent('savings_goals', payload.eventType as any, payload.new, payload.old);
        }
      )
      // 6. Family Members stream (instant real-time display when a new member joins)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        payload => {
          onEvent('family_members', payload.eventType as any, payload.new, payload.old);
        }
      )
      // 7. Real-time broadcast for instant inter-client member sync
      .on(
        'broadcast',
        { event: 'member_joined' },
        payload => {
          onEvent('family_members', 'INSERT', payload.payload, null);
        }
      )
      // 8. Real-time broadcast for instant member role update across browsers
      .on(
        'broadcast',
        { event: 'member_updated' },
        payload => {
          onEvent('family_members', 'UPDATE', payload.payload, null);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Supabase Realtime] Connected to live channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`[Supabase Realtime] Subscription error on ${channelName}:`, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Record a financial transaction in Supabase PostgreSQL
   * (Step 6 of Section 7: Manual Entry Workflow)
   */
  async createTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          family_id: tx.family_id,
          user_id: tx.user_id,
          account_id: tx.account_id,
          category_id: tx.category_id,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          transaction_date: tx.transaction_date,
          payment_method: tx.payment_method,
          is_shared: tx.is_shared,
          status: tx.status || 'cleared',
        })
        .select()
        .single();

      if (error) throw error;

      // Update account balance
      if (tx.account_id) {
        const delta = tx.type === 'income' ? tx.amount : -tx.amount;
        await this.adjustAccountBalance(tx.account_id, delta);
      }

      // Log system audit action
      await this.logAudit({
        family_id: tx.family_id || '',
        user_id: tx.user_id,
        action: 'TRANSACTION_CREATED',
        entity_type: 'transaction',
        entity_id: data?.id,
        metadata: {
          amount: tx.amount,
          type: tx.type,
          description: tx.description,
        },
      });

      return { success: true, data };
    } catch (err: any) {
      console.error('Error creating transaction in Supabase:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Delete / Void transaction
   */
  async deleteTransaction(txId: string, accountId: string, amount: number, type: string, familyId: string, userId: string) {
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', txId);
      if (error) throw error;

      // Reverse account balance
      const delta = type === 'income' ? -amount : amount;
      await this.adjustAccountBalance(accountId, delta);

      await this.logAudit({
        family_id: familyId,
        user_id: userId,
        action: 'TRANSACTION_DELETED',
        entity_type: 'transaction',
        entity_id: txId,
        metadata: { amount, type },
      });

      return { success: true };
    } catch (err: any) {
      console.error('Error deleting transaction in Supabase:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Adjust account balance helper
   */
  async adjustAccountBalance(accountId: string, deltaPaise: number) {
    try {
      const { data: acc } = await supabase.from('accounts').select('balance').eq('id', accountId).maybeSingle();
      if (acc) {
        const newBalance = (acc.balance || 0) + deltaPaise;
        await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId);
      }
    } catch (err) {
      console.warn('Could not adjust account balance:', err);
    }
  },

  /**
   * Submit an expense request (Member -> Family Head / Co-Manager approval workflow)
   */
  async createExpenseRequest(req: {
    family_id: string;
    requested_by: string;
    amount: number;
    category_id: string;
    title: string;
    description: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('requests')
        .insert({
          family_id: req.family_id,
          requested_by: req.requested_by,
          amount: req.amount,
          category_id: req.category_id,
          title: req.title,
          description: req.description,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      await this.logAudit({
        family_id: req.family_id,
        user_id: req.requested_by,
        action: 'REQUEST_SUBMITTED',
        entity_type: 'request',
        entity_id: data?.id,
        metadata: { title: req.title, amount: req.amount },
      });

      return { success: true, data };
    } catch (err: any) {
      console.error('Error creating request in Supabase:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Review (Approve/Reject) an expense request
   */
  async reviewExpenseRequest(
    requestId: string,
    status: 'approved' | 'rejected',
    reviewerId: string,
    comment?: string
  ) {
    try {
      const { data, error } = await supabase
        .from('requests')
        .update({
          status,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          review_comment: comment || (status === 'approved' ? 'Approved by Family Head' : 'Declined'),
        })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err: any) {
      console.error('Error reviewing request in Supabase:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Log an immutable audit action (Section 30)
   */
  async logAudit(log: {
    family_id: string;
    user_id?: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      await supabase.from('audit_logs').insert({
        family_id: log.family_id,
        user_id: log.user_id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        metadata: log.metadata || {},
      });
    } catch (err) {
      console.warn('Audit log write deferred:', err);
    }
  },

  /**
   * Persist a member's custom permission overrides to Supabase (family_members table).
   * Called by Family Head when clicking "Save Changes" on the Permissions Matrix.
   */
  async updateMemberPermissions(
    memberId: string,
    customPermissions: Partial<Record<string, boolean>>,
    familyId: string,
    actorUserId: string
  ) {
    try {
      const { error } = await supabase
        .from('family_members')
        .update({ custom_permissions: customPermissions })
        .eq('id', memberId);

      if (error) throw error;

      await this.logAudit({
        family_id: familyId,
        user_id: actorUserId,
        action: 'MEMBER_PERMISSIONS_SAVED',
        entity_type: 'family_member',
        entity_id: memberId,
        metadata: { custom_permissions: customPermissions },
      });

      return { success: true };
    } catch (err: any) {
      console.error('[Supabase] Error saving member permissions:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Update a family member's role (Family Head governance)
   */
  async updateMemberRole(familyId: string, memberId: string, newRole: string) {
    return updateFamilyMemberRole(familyId, memberId, newRole);
  },
};

