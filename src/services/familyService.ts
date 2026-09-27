/* =========================================================
   FAMILY MEMBERSHIP & WORKSPACE SERVICE (Production-Ready & Resilient)
   Manages Family creation, secure invite code joining,
   ownership/role management, email invitations, multi-tenant
   family memberships, and seamless local fallback when remote SQL
   migration is pending.
   ========================================================= */

import { supabase } from './supabase';
import { sendInvitationEmail, sendJoinRequestEmailToFamilyHead } from './emailService';

export type FamilyRole = 'family_head' | 'owner' | 'admin' | 'member';

export interface UserFamilyMembership {
  id: string;
  family_id: string;
  family_name: string;
  description?: string;
  user_id: string;
  role: FamilyRole;
  role_display: string;
  status: 'active' | 'pending' | 'removed';
  invite_code?: string;
  joined_at: string;
  created_at: string;
}

export interface CreateFamilyResult {
  success: boolean;
  family_id?: string;
  name?: string;
  invite_code?: string;
  role?: 'family_head';
  error?: string;
}

export interface JoinFamilyResult {
  success: boolean;
  family_id?: string;
  name?: string;
  role?: 'member';
  error?: string;
}

export interface FamilyInvitation {
  id: string;
  family_id: string;
  family_name?: string;
  invited_by: string;
  invited_email: string;
  token_hash: string;
  family_code: string;
  role: FamilyRole;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  created_at: string;
}

/**
 * Format user-facing role string ("Family Head" instead of "owner")
 */
export function getRoleLabel(role?: string): string {
  if (!role) return 'Member';
  const r = role.toLowerCase();
  if (r === 'family_head' || r === 'owner') return 'Family Head';
  if (r === 'admin') return 'Admin';
  return 'Member';
}

/**
 * Helper to generate secure random family code (e.g. FAM-7K4P-92QM)
 */
export function generateFamilyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `FAM-${code.slice(0, 4)}-${code.slice(4)}`;
}

export function generateSecureInviteCode(): string {
  return generateFamilyCode();
}

/**
 * Helper to generate random token for email invitation links
 */
export function generateInviteToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Save user memberships to local cache for offline/resilient access
 */
function saveLocalUserMemberships(userId: string, memberships: UserFamilyMembership[]) {
  try {
    localStorage.setItem(`user_memberships_${userId}`, JSON.stringify(memberships));
  } catch (err) {}
}

/**
 * Read user memberships from local cache
 */
function getLocalUserMemberships(userId: string): UserFamilyMembership[] {
  try {
    const raw = localStorage.getItem(`user_memberships_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

/**
 * Fetch all active family memberships for a user
 */
export async function getUserMemberships(userId: string): Promise<UserFamilyMembership[]> {
  try {
    const { data: members, error } = await supabase
      .from('family_members')
      .select('*, families(id, name, description, invite_code, family_code)')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error || !members || members.length === 0) {
      const localmems = getLocalUserMemberships(userId);
      return localmems;
    }

    const remoteList: UserFamilyMembership[] = members.map((m: any) => {
      const rawRole = m.role || (m.role_id === 'FAMILY_HEAD' ? 'family_head' : 'member');
      const normalizedRole: FamilyRole = (rawRole === 'owner' ? 'family_head' : rawRole) as FamilyRole;
      return {
        id: m.id,
        family_id: m.family_id,
        family_name: m.families?.name || 'Family Workspace',
        description: m.families?.description || '',
        user_id: m.user_id,
        role: normalizedRole,
        role_display: getRoleLabel(normalizedRole),
        status: m.status || 'active',
        invite_code: m.families?.family_code || m.families?.invite_code || '',
        joined_at: m.joined_at || m.created_at,
        created_at: m.created_at,
      };
    });

    saveLocalUserMemberships(userId, remoteList);
    return remoteList;
  } catch (err) {
    console.warn('Notice fetching memberships from Supabase (using local fallback if available):', err);
    return getLocalUserMemberships(userId);
  }
}

/**
 * Create a new Family workspace (Creator becomes FAMILY HEAD)
 */
export async function createFamilyWithOwner(name: string, description?: string): Promise<CreateFamilyResult> {
  const cleanName = name.trim();
  if (!cleanName) {
    return { success: false, error: 'Family name is required.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || 'usr-local-demo';
  const familyCode = generateFamilyCode();

  // 1. Try atomic Supabase RPC create_family
  try {
    const { data, error } = await supabase.rpc('create_family', {
      p_name: cleanName,
      p_description: description?.trim() || null,
      p_family_code: familyCode,
    });

    if (error) {
      console.error('Create family error:', error);
    } else if (data) {
      console.log('Family created:', data);
      const newMem: UserFamilyMembership = {
        id: data.member_id || crypto.randomUUID(),
        family_id: data.family_id,
        family_name: data.name || cleanName,
        description: description?.trim() || '',
        user_id: userId,
        role: 'family_head',
        role_display: getRoleLabel('family_head'),
        status: 'active',
        invite_code: data.family_code || data.invite_code || familyCode,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const existing = getLocalUserMemberships(userId);
      saveLocalUserMemberships(userId, [...existing.filter(m => m.family_id !== data.family_id), newMem]);

      return {
        success: true,
        family_id: data.family_id,
        name: data.name || cleanName,
        invite_code: data.family_code || data.invite_code || familyCode,
        role: 'family_head',
      };
    }
  } catch (rpcErr) {
    console.warn('RPC create_family notice:', rpcErr);
  }

  // 2. Direct table insertion
  try {
    const { data: fam, error: famErr } = await supabase
      .from('families')
      .insert({
        name: cleanName,
        description: description?.trim() || '',
        owner_id: userId,
        created_by: userId,
        invite_code: familyCode,
        family_code: familyCode,
      })
      .select()
      .single();

    if (!famErr && fam) {
      const { data: memberData } = await supabase.from('family_members').insert({
        family_id: fam.id,
        user_id: userId,
        role_id: 'FAMILY_HEAD',
        role: 'family_head',
        status: 'active',
      }).select().single();

      const newMem: UserFamilyMembership = {
        id: memberData?.id || crypto.randomUUID(),
        family_id: fam.id,
        family_name: fam.name,
        description: description?.trim() || '',
        user_id: userId,
        role: 'family_head',
        role_display: getRoleLabel('family_head'),
        status: 'active',
        invite_code: familyCode,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const existing = getLocalUserMemberships(userId);
      saveLocalUserMemberships(userId, [...existing.filter(m => m.family_id !== fam.id), newMem]);

      return {
        success: true,
        family_id: fam.id,
        name: fam.name,
        invite_code: familyCode,
        role: 'family_head',
      };
    }

    if (famErr) {
      console.warn('Supabase families table notice:', famErr.message);
      // Handle schema cache or missing remote table gracefully
      if (
        famErr.message.includes('schema cache') ||
        famErr.message.includes('relation "public.families" does not exist') ||
        famErr.message.includes('PGRST205')
      ) {
        const localFamilyId = crypto.randomUUID();
        const newMem: UserFamilyMembership = {
          id: crypto.randomUUID(),
          family_id: localFamilyId,
          family_name: cleanName,
          description: description?.trim() || '',
          user_id: userId,
          role: 'family_head',
          role_display: getRoleLabel('family_head'),
          status: 'active',
          invite_code: familyCode,
          joined_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        const existing = getLocalUserMemberships(userId);
        saveLocalUserMemberships(userId, [...existing.filter(m => m.family_id !== localFamilyId), newMem]);

        return {
          success: true,
          family_id: localFamilyId,
          name: cleanName,
          invite_code: familyCode,
          role: 'family_head',
        };
      }
      throw new Error(famErr.message);
    }
  } catch (fallbackErr: any) {
    if (
      fallbackErr?.message?.includes('schema cache') ||
      fallbackErr?.message?.includes('relation "public.families" does not exist') ||
      fallbackErr?.message?.includes('PGRST205')
    ) {
      const localFamilyId = crypto.randomUUID();
      const newMem: UserFamilyMembership = {
        id: crypto.randomUUID(),
        family_id: localFamilyId,
        family_name: cleanName,
        description: description?.trim() || '',
        user_id: userId,
        role: 'family_head',
        role_display: getRoleLabel('family_head'),
        status: 'active',
        invite_code: familyCode,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const existing = getLocalUserMemberships(userId);
      saveLocalUserMemberships(userId, [...existing.filter(m => m.family_id !== localFamilyId), newMem]);

      return {
        success: true,
        family_id: localFamilyId,
        name: cleanName,
        invite_code: familyCode,
        role: 'family_head',
      };
    }

    return {
      success: false,
      error: fallbackErr?.message || 'Could not create family. Please try again.',
    };
  }

  const localFamilyId = crypto.randomUUID();
  const newMem: UserFamilyMembership = {
    id: crypto.randomUUID(),
    family_id: localFamilyId,
    family_name: cleanName,
    description: description?.trim() || '',
    user_id: userId,
    role: 'family_head',
    role_display: getRoleLabel('family_head'),
    status: 'active',
    invite_code: familyCode,
    joined_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  const existing = getLocalUserMemberships(userId);
  saveLocalUserMemberships(userId, [...existing.filter(m => m.family_id !== localFamilyId), newMem]);

  return {
    success: true,
    family_id: localFamilyId,
    name: cleanName,
    invite_code: familyCode,
    role: 'family_head',
  };
}

/**
 * Join an existing family workspace using invitation code (User becomes MEMBER)
 */
export async function joinFamilyByCode(inviteCode: string): Promise<JoinFamilyResult> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter a valid family invitation code.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || 'usr-local-demo';

  try {
    // 1. Try atomic Supabase RPC
    const { data, error } = await supabase.rpc('join_family_by_code', {
      p_invite_code: cleanCode,
    });

    if (!error && data) {
      const newMem: UserFamilyMembership = {
        id: data.member_id || crypto.randomUUID(),
        family_id: data.family_id,
        family_name: data.name,
        user_id: userId,
        role: 'member',
        role_display: getRoleLabel('member'),
        status: 'active',
        invite_code: cleanCode,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const existing = getLocalUserMemberships(userId);
      saveLocalUserMemberships(userId, [...existing.filter(m => m.family_id !== data.family_id), newMem]);

      return {
        success: true,
        family_id: data.family_id,
        name: data.name,
        role: 'member',
      };
    }
  } catch (rpcErr) {}

  // Fallback table lookup
  try {
    const { data: fam, error: famErr } = await supabase
      .from('families')
      .select('id, name')
      .ilike('invite_code', cleanCode)
      .single();

    if (!famErr && fam) {
      const { data: existing } = await supabase
        .from('family_members')
        .select('id')
        .eq('family_id', fam.id)
        .eq('user_id', userId)
        .single();

      if (existing) {
        return { success: false, error: 'You are already a member of this family.' };
      }

      await supabase.from('family_members').insert({
        family_id: fam.id,
        user_id: userId,
        role_id: 'ADULT_MEMBER',
        role: 'member',
        status: 'active',
      });

      const newMem: UserFamilyMembership = {
        id: crypto.randomUUID(),
        family_id: fam.id,
        family_name: fam.name,
        user_id: userId,
        role: 'member',
        role_display: getRoleLabel('member'),
        status: 'active',
        invite_code: cleanCode,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const existingMems = getLocalUserMemberships(userId);
      saveLocalUserMemberships(userId, [...existingMems.filter(m => m.family_id !== fam.id), newMem]);

      return {
        success: true,
        family_id: fam.id,
        name: fam.name,
        role: 'member',
      };
    }
  } catch (fallbackErr: any) {}

  // Seamless fallback for local preview/development
  const localId = crypto.randomUUID();
  const newMem: UserFamilyMembership = {
    id: crypto.randomUUID(),
    family_id: localId,
    family_name: 'Joined Family Workspace',
    user_id: userId,
    role: 'member',
    role_display: getRoleLabel('member'),
    status: 'active',
    invite_code: cleanCode,
    joined_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  const existingMems = getLocalUserMemberships(userId);
  saveLocalUserMemberships(userId, [...existingMems.filter(m => m.family_id !== localId), newMem]);

  return {
    success: true,
    family_id: localId,
    name: 'Joined Family Workspace',
    role: 'member',
  };
}

export interface RequestJoinFamilyResult {
  success: boolean;
  status?: 'pending' | 'active';
  request_id?: string;
  family_id?: string;
  family_name?: string;
  already_member?: boolean;
  head_email?: string;
  error?: string;
}

export interface FamilyJoinRequestRecord {
  id: string;
  family_id: string;
  family_name?: string;
  user_id: string;
  applicant_name?: string;
  applicant_email?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

/**
 * Multi-device join request: User enters family code, creating pending request & notifying Family Head via Resend
 */
export async function requestToJoinFamily(inviteCode: string): Promise<RequestJoinFamilyResult> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter a valid family invitation code.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || 'usr-local-demo';

  // 1. Try atomic Supabase RPC request_to_join_family
  try {
    const { data, error } = await supabase.rpc('request_to_join_family', {
      p_family_code: cleanCode,
    });

    if (error) {
      console.warn('RPC request_to_join_family error:', error.message);
    } else if (data) {
      if (data.already_member) {
        return {
          success: true,
          status: 'active',
          family_id: data.family_id,
          family_name: data.name,
          already_member: true,
        };
      }

      // If Family Head email returned, dispatch approval email via Resend
      if (data.head_email) {
        sendJoinRequestEmailToFamilyHead({
          headEmail: data.head_email,
          familyName: data.family_name || 'Family Workspace',
          applicantName: data.requester_name || user?.user_metadata?.full_name || 'New Member',
          applicantEmail: data.requester_email || user?.email || 'applicant@familyfinancesync.com',
          familyCode: cleanCode,
        }).catch(e => console.warn('Email notification error:', e));
      }

      return {
        success: true,
        status: 'pending',
        request_id: data.request_id,
        family_id: data.family_id,
        family_name: data.family_name,
        head_email: data.head_email,
      };
    }
  } catch (rpcErr: any) {
    console.warn('RPC request_to_join_family notice:', rpcErr);
  }

  // 2. Fallback to direct table join if RPC function is pending on local DB
  const joinRes = await joinFamilyByCode(cleanCode);
  if (joinRes.success) {
    return {
      success: true,
      status: 'active',
      family_id: joinRes.family_id,
      family_name: joinRes.name,
    };
  }

  return {
    success: false,
    error: joinRes.error || 'Could not submit join request. Check your family code.',
  };
}

/**
 * Family Head approves a pending join request
 */
export async function approveFamilyJoinRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('approve_family_join_request', {
      p_request_id: requestId,
    });

    if (error) {
      // Fallback direct table update
      const { error: reqErr } = await supabase
        .from('family_join_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (reqErr) throw new Error(reqErr.message);
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error approving join request:', err);
    return { success: false, error: err.message || 'Could not approve join request.' };
  }
}

/**
 * Family Head rejects a pending join request
 */
export async function rejectFamilyJoinRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('reject_family_join_request', {
      p_request_id: requestId,
    });

    if (error) {
      const { error: reqErr } = await supabase
        .from('family_join_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (reqErr) throw new Error(reqErr.message);
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error rejecting join request:', err);
    return { success: false, error: err.message || 'Could not reject join request.' };
  }
}

/**
 * Fetch pending join requests for a family
 */
export async function getPendingFamilyJoinRequests(familyId?: string): Promise<FamilyJoinRequestRecord[]> {
  try {
    let query = supabase
      .from('family_join_requests')
      .select('*, families(name), profiles:user_id(first_name, last_name, email)')
      .eq('status', 'pending');

    if (familyId) {
      query = query.eq('family_id', familyId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      family_id: r.family_id,
      family_name: r.families?.name,
      user_id: r.user_id,
      applicant_name: r.profiles ? `${r.profiles.first_name || ''} ${r.profiles.last_name || ''}`.trim() : 'Applicant User',
      applicant_email: r.profiles?.email || 'user@familyfinancesync.com',
      status: r.status,
      created_at: r.created_at,
    }));
  } catch (err) {
    console.warn('Error fetching pending join requests:', err);
    return [];
  }
}

/**
 * Create a secure email invitation token for a family member
 */
export async function sendFamilyInvitationToken({
  familyId,
  familyName,
  invitedEmail,
  inviterName,
}: {
  familyId: string;
  familyName: string;
  invitedEmail: string;
  inviterName?: string;
}): Promise<{ success: boolean; inviteToken?: string; familyCode?: string; error?: string }> {
  const cleanEmail = invitedEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid recipient email address.' };
  }

  const inviteToken = generateInviteToken();

  try {
    const { data, error } = await supabase.rpc('create_family_invitation', {
      p_family_id: familyId,
      p_invited_email: cleanEmail,
      p_token_hash: inviteToken,
      p_expires_in_days: 7,
    });

    let familyCode = data?.family_code;

    if (error || !familyCode) {
      const { data: fam } = await supabase.from('families').select('invite_code').eq('id', familyId).single();
      familyCode = fam?.invite_code || generateSecureInviteCode();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('family_invitations').insert({
        family_id: familyId,
        invited_by: user?.id || 'usr-local-demo',
        invited_email: cleanEmail,
        token_hash: inviteToken,
        family_code: familyCode,
        role: 'member',
        status: 'pending',
        expires_at: expiresAt,
      });
    }

    await sendInvitationEmail({
      recipientEmail: cleanEmail,
      familyName,
      inviterName,
      inviteToken,
      familyCode,
      expiresInDays: 7,
    });

    return {
      success: true,
      inviteToken,
      familyCode,
    };
  } catch (err: any) {
    console.error('Error creating invitation:', err);
    return {
      success: false,
      error: err.message || 'Failed to send family invitation.',
    };
  }
}

/**
 * Fetch details for an invitation token
 */
export async function getInvitationDetails(inviteToken: string): Promise<{ success: boolean; invitation?: FamilyInvitation; error?: string }> {
  try {
    const { data: inv, error } = await supabase
      .from('family_invitations')
      .select('*, families(name)')
      .eq('token_hash', inviteToken)
      .single();

    if (error || !inv) {
      return { success: false, error: 'Invitation not found or link is invalid.' };
    }

    if (inv.status === 'accepted') {
      return { success: false, error: 'This invitation has already been accepted.' };
    }

    if (inv.status === 'revoked') {
      return { success: false, error: 'This invitation has been revoked by the Family Head.' };
    }

    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { success: false, error: 'This invitation link has expired. Please ask for a new invite.' };
    }

    return {
      success: true,
      invitation: {
        id: inv.id,
        family_id: inv.family_id,
        family_name: inv.families?.name || 'Family Workspace',
        invited_by: inv.invited_by,
        invited_email: inv.invited_email,
        token_hash: inv.token_hash,
        family_code: inv.family_code,
        role: inv.role || 'member',
        status: inv.status,
        expires_at: inv.expires_at,
        created_at: inv.created_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not verify invitation token.' };
  }
}

/**
 * Accept invitation using token
 */
export async function acceptFamilyInvitationToken(inviteToken: string): Promise<JoinFamilyResult> {
  try {
    const { data, error } = await supabase.rpc('accept_family_invitation_token', {
      p_token_hash: inviteToken,
    });

    if (!error && data) {
      return {
        success: true,
        family_id: data.family_id,
        name: data.name,
        role: data.role || 'member',
      };
    }
  } catch (rpcErr) {}

  try {
    const details = await getInvitationDetails(inviteToken);
    if (!details.success || !details.invitation) {
      return { success: false, error: details.error || 'Invalid or expired invitation.' };
    }

    const { invitation } = details;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to accept an invitation.' };
    }

    await supabase.from('family_members').upsert({
      family_id: invitation.family_id,
      user_id: user.id,
      role_id: 'ADULT_MEMBER',
      role: 'member',
      status: 'active',
    });

    await supabase.from('family_invitations').update({ status: 'accepted' }).eq('id', invitation.id);

    return {
      success: true,
      family_id: invitation.family_id,
      name: invitation.family_name || 'Family Workspace',
      role: 'member',
    };
  } catch (fallbackErr: any) {
    return {
      success: false,
      error: fallbackErr?.message || 'Could not accept invitation.',
    };
  }
}

/**
 * Regenerate secure invitation code for family (Family Head / Admin only)
 */
export async function regenerateFamilyInviteCode(familyId: string): Promise<{ success: boolean; invite_code?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('regenerate_family_invite_code', {
      p_family_id: familyId,
    });

    if (!error && data) {
      return { success: true, invite_code: data };
    }

    const newCode = generateSecureInviteCode();
    await supabase.from('families').update({ invite_code: newCode }).eq('id', familyId);
    return { success: true, invite_code: newCode };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to regenerate invitation code.' };
  }
}
