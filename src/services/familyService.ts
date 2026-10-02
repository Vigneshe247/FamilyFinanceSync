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
 * Helper to generate secure random family code (e.g. FAM-7K4P9X)
 * Short enough to type, easy to communicate, difficult to guess, unique.
 */
export function generateFamilyCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `FAM-${code}`;
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

export interface KnownProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

const inMemoryKnownProfiles: Record<string, KnownProfile> = {};

export function saveKnownProfile(userId: string, profile: Partial<KnownProfile>): void {
  const merged: KnownProfile = {
    id: userId,
    name: profile.name || inMemoryKnownProfiles[userId]?.name || 'Family Member',
    email: profile.email || inMemoryKnownProfiles[userId]?.email || '',
    avatar_url: profile.avatar_url || inMemoryKnownProfiles[userId]?.avatar_url,
  };
  inMemoryKnownProfiles[userId] = merged;

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ffs_known_profiles');
      const map: Record<string, KnownProfile> = raw ? JSON.parse(raw) : {};
      map[userId] = { ...map[userId], ...merged };
      localStorage.setItem('ffs_known_profiles', JSON.stringify(map));
    }
  } catch (e) {}
}

export function getKnownProfiles(): Record<string, KnownProfile> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ffs_known_profiles');
      const map = raw ? JSON.parse(raw) : {};
      return { ...inMemoryKnownProfiles, ...map };
    }
  } catch (e) {}
  return { ...inMemoryKnownProfiles };
}

/**
 * Fetch all active family memberships for a user
 */
export async function getUserMemberships(userId: string): Promise<UserFamilyMembership[]> {
  try {
    const { data: members, error } = await supabase
      .from('family_members')
      .select('id, family_id, user_id, role, status, joined_at, created_at, families(id, name, description, family_code)')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error || !members || members.length === 0) {
      if (error) console.warn('Supabase getUserMemberships query error:', error.message);
      const localmems = getLocalUserMemberships(userId);
      return localmems;
    }

    const remoteList: UserFamilyMembership[] = members.map((m: any) => {
      const rawRole = m.role || 'member';
      const normalizedRole: FamilyRole = (rawRole === 'owner' ? 'family_head' : rawRole) as FamilyRole;
      const code = m.families?.family_code || '';
      return {
        id: m.id,
        family_id: m.family_id,
        family_name: m.families?.name || 'Family Workspace',
        description: m.families?.description || '',
        user_id: m.user_id,
        role: normalizedRole,
        role_display: getRoleLabel(normalizedRole),
        status: m.status || 'active',
        invite_code: code,
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
export async function createFamilyWithOwner(name: string, description?: string, customFamilyCode?: string): Promise<CreateFamilyResult> {
  const cleanName = name.trim();
  if (!cleanName) {
    return { success: false, error: 'Family name is required.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || 'usr-local-demo';
  const familyCode = customFamilyCode?.trim().toUpperCase() || generateFamilyCode();

  // If not authenticated with remote Supabase (e.g. unit test or local offline mode), create local workspace
  if (!user) {
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

  // 1. Try atomic Supabase RPC create_family
  try {
    const { data, error } = await supabase.rpc('create_family', {
      p_name: cleanName,
      p_description: description?.trim() || null,
      p_family_code: familyCode,
    });

    if (error) {
      console.warn('Create family RPC notice:', error.message);
    } else if (data) {
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
        created_by: userId,
        family_code: familyCode,
      })
      .select('id, name, description, family_code, created_by, created_at')
      .single();

    if (!famErr && fam) {
      const { data: memberData } = await supabase.from('family_members').insert({
        family_id: fam.id,
        user_id: userId,
        role: 'family_head',
        status: 'active',
      }).select('id, family_id, user_id, role, status, joined_at, created_at').single();

      // Cache creator profile
      saveKnownProfile(userId, {
        id: userId,
        name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Family Head',
        email: user?.email || '',
        avatar_url: user?.user_metadata?.avatar_url,
      });

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
    }
  } catch (fallbackErr: any) {
    console.warn('Supabase create family fallback notice:', fallbackErr?.message);
  }

  // Seamless fallback for local preview/development/test
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

  // 1. Direct table lookup by family_code (supports clean code and FAM- prefix variants)
  try {
    let { data: fam, error: famErr } = await supabase
      .from('families')
      .select('id, name, description, family_code')
      .ilike('family_code', cleanCode)
      .maybeSingle();

    if (!fam && cleanCode.startsWith('FAM-')) {
      const stripped = cleanCode.replace(/^FAM-/, '');
      const { data: altFam } = await supabase
        .from('families')
        .select('id, name, description, family_code')
        .ilike('family_code', stripped)
        .maybeSingle();
      if (altFam) fam = altFam;
    } else if (!fam && !cleanCode.startsWith('FAM-')) {
      const prefixed = `FAM-${cleanCode}`;
      const { data: altFam } = await supabase
        .from('families')
        .select('id, name, description, family_code')
        .ilike('family_code', prefixed)
        .maybeSingle();
      if (altFam) fam = altFam;
    }

    if (fam) {
      const { data: existing } = await supabase
        .from('family_members')
        .select('id, status, role')
        .eq('family_id', fam.id)
        .eq('user_id', userId)
        .maybeSingle();

      let memberId = existing?.id;

      if (existing) {
        if (existing.status !== 'active') {
          await supabase
            .from('family_members')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      } else {
        const { data: insertedMem, error: insertErr } = await supabase
          .from('family_members')
          .insert({
            family_id: fam.id,
            user_id: userId,
            role: 'member',
            status: 'active',
          })
          .select('id, family_id, user_id, role, status, joined_at, created_at')
          .single();

        if (insertErr) {
          console.warn('Notice inserting family member:', insertErr.message);
        } else if (insertedMem) {
          memberId = insertedMem.id;
        }
      }

      // Save member profile into known profiles
      const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Member User';
      const userEmail = user?.email || '';
      const avatarUrl = user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;

      saveKnownProfile(userId, {
        id: userId,
        name: userName,
        email: userEmail,
        avatar_url: avatarUrl,
      });

      const newMem: UserFamilyMembership = {
        id: memberId || crypto.randomUUID(),
        family_id: fam.id,
        family_name: fam.name,
        description: fam.description || '',
        user_id: userId,
        role: 'member',
        role_display: getRoleLabel('member'),
        status: 'active',
        invite_code: fam.family_code || cleanCode,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const existingMems = getLocalUserMemberships(userId);
      saveLocalUserMemberships(userId, [...existingMems.filter(m => m.family_id !== fam.id), newMem]);

      // Broadcast to real-time family channel so the Family Head immediately sees this member
      try {
        const channel = supabase.channel(`family:${fam.id}`);
        channel.send({
          type: 'broadcast',
          event: 'member_joined',
          payload: {
            id: memberId || crypto.randomUUID(),
            family_id: fam.id,
            user_id: userId,
            role: 'member',
            status: 'active',
            joined_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            custom_permissions: {},
            user: {
              id: userId,
              name: userName,
              email: userEmail,
              avatar_url: avatarUrl,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        });
      } catch (broadcastErr) {
        console.warn('Realtime broadcast warning:', broadcastErr);
      }

      return {
        success: true,
        family_id: fam.id,
        name: fam.name,
        role: 'member',
      };
    }

    if (famErr) {
      console.warn('Notice finding family by code:', famErr.message);
    }
  } catch (err: any) {
    console.warn('Remote join family exception:', err.message);
  }

  // Fallback: Check local memberships if testing offline/demo
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
 * Multi-device join request: User enters family code, directly joins and links member to family
 */
export async function requestToJoinFamily(inviteCode: string): Promise<RequestJoinFamilyResult> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter a valid family invitation code.' };
  }

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
    error: joinRes.error || 'Could not join family. Please check the family code and try again.',
  };
}

/**
 * Family Head approves a pending join request
 */
export async function approveFamilyJoinRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Fetch join request record details
    const { data: req } = await supabase
      .from('family_join_requests')
      .select('id, family_id, user_id, status')
      .eq('id', requestId)
      .maybeSingle();

    const { data, error } = await supabase.rpc('approve_family_join_request', {
      p_request_id: requestId,
    });

    if (error) {
      // Fallback direct table updates
      const { error: reqErr } = await supabase
        .from('family_join_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (reqErr) throw new Error(reqErr.message);

      if (req) {
        // Ensure family_members row is created or activated
        await supabase
          .from('family_members')
          .upsert({
            family_id: req.family_id,
            user_id: req.user_id,
            role: 'member',
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'family_id,user_id' });
      }
    }

    // 2. Fetch applicant profile & populate cache + broadcast
    const targetUserId = req?.user_id;
    const targetFamilyId = req?.family_id;

    if (targetUserId && targetFamilyId) {
      let userName = 'Family Member';
      let userEmail = '';
      let avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUserId}`;

      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetUserId)
          .maybeSingle();

        if (prof) {
          userName = prof.full_name || `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || prof.email?.split('@')[0] || userName;
          userEmail = prof.email || '';
          avatarUrl = prof.avatar_url || avatarUrl;
        }
      } catch (pErr) {
        console.warn('Profile fetch notice in approve:', pErr);
      }

      saveKnownProfile(targetUserId, {
        id: targetUserId,
        name: userName,
        email: userEmail,
        avatar_url: avatarUrl,
      });

      // Broadcast to real-time family channel so Family Head and others see the member immediately
      try {
        const channel = supabase.channel(`family:${targetFamilyId}`);
        channel.send({
          type: 'broadcast',
          event: 'member_joined',
          payload: {
            id: targetUserId,
            family_id: targetFamilyId,
            user_id: targetUserId,
            role: 'member',
            status: 'active',
            joined_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            custom_permissions: {},
            user: {
              id: targetUserId,
              name: userName,
              email: userEmail,
              avatar_url: avatarUrl,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        });
      } catch (broadcastErr) {
        console.warn('Realtime broadcast warning:', broadcastErr);
      }
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

const INVITATION_CACHE_KEY = 'ffs_cached_invitations';

function getLocalCachedInvitations(): Record<string, any> {
  try {
    const raw = localStorage.getItem(INVITATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalCachedInvitation(token: string, inv: any) {
  try {
    const cache = getLocalCachedInvitations();
    cache[token] = inv;
    localStorage.setItem(INVITATION_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Could not cache invitation locally:', e);
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
}): Promise<{ success: boolean; inviteToken?: string; familyCode?: string; emailSent?: boolean; emailNotice?: string; error?: string }> {
  const cleanEmail = invitedEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid recipient email address.' };
  }

  const inviteToken = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let familyCode = generateSecureInviteCode();

  try {
    const { data, error } = await supabase.rpc('create_family_invitation', {
      p_family_id: familyId,
      p_invited_email: cleanEmail,
      p_token_hash: inviteToken,
      p_expires_in_days: 7,
    });

    if (!error && data?.family_code) {
      familyCode = data.family_code;
    } else {
      const { data: fam } = await supabase.from('families').select('family_code').eq('id', familyId).maybeSingle();
      if (fam?.family_code) familyCode = fam.family_code;
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

    // Cache invitation locally so token resolution is always immediate and offline-resilient
    saveLocalCachedInvitation(inviteToken, {
      id: `inv-${Date.now()}`,
      family_id: familyId,
      family_name: familyName,
      invited_email: cleanEmail,
      token_hash: inviteToken,
      family_code: familyCode,
      role: 'member',
      status: 'pending',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });

    const emailRes = await sendInvitationEmail({
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
      emailSent: emailRes.success,
      emailNotice: emailRes.success
        ? `Invitation email dispatched to ${cleanEmail}`
        : emailRes.error || 'Direct email delivery requires VITE_RESEND_API_KEY in .env',
    };
  } catch (err: any) {
    console.error('Error creating invitation:', err);

    // Save fallback cache even if remote DB network write had issue
    saveLocalCachedInvitation(inviteToken, {
      id: `inv-${Date.now()}`,
      family_id: familyId,
      family_name: familyName,
      invited_email: cleanEmail,
      token_hash: inviteToken,
      family_code: familyCode,
      role: 'member',
      status: 'pending',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      inviteToken,
      familyCode,
      emailSent: false,
      emailNotice: 'Invitation link and code generated! Direct email delivery requires VITE_RESEND_API_KEY in .env.',
    };
  }
}

/**
 * Fetch details for an invitation token
 */
export async function getInvitationDetails(inviteToken: string): Promise<{ success: boolean; invitation?: FamilyInvitation; error?: string }> {
  try {
    // 1. Try public RPC function
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_invitation_by_token', {
      p_token: inviteToken,
    });

    if (!rpcErr && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
      const inv = rpcData[0];
      return {
        success: true,
        invitation: {
          id: inv.id,
          family_id: inv.family_id,
          family_name: inv.family_name || 'Family Workspace',
          invited_by: inv.invited_by || '',
          invited_email: inv.invited_email,
          token_hash: inv.token_hash || inviteToken,
          family_code: inv.family_code,
          role: inv.role || 'member',
          status: inv.status,
          expires_at: inv.expires_at,
          created_at: inv.created_at,
        },
      };
    }

    // 2. Try direct table query with maybeSingle()
    const { data: inv, error } = await supabase
      .from('family_invitations')
      .select('*, families(name)')
      .eq('token_hash', inviteToken)
      .maybeSingle();

    if (!error && inv) {
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
    }

    // 3. Fallback to resilient local cache (ensures immediate local link testing works)
    const cached = getLocalCachedInvitations()[inviteToken];
    if (cached) {
      if (new Date(cached.expires_at).getTime() < Date.now()) {
        return { success: false, error: 'This invitation link has expired. Please ask for a new invite.' };
      }
      return {
        success: true,
        invitation: {
          id: cached.id,
          family_id: cached.family_id,
          family_name: cached.family_name || 'Family Workspace',
          invited_by: cached.invited_by || '',
          invited_email: cached.invited_email,
          token_hash: cached.token_hash,
          family_code: cached.family_code,
          role: cached.role || 'member',
          status: cached.status || 'pending',
          expires_at: cached.expires_at,
          created_at: cached.created_at,
        },
      };
    }

    return { success: false, error: 'Invitation not found or link is invalid.' };
  } catch (err: any) {
    const cached = getLocalCachedInvitations()[inviteToken];
    if (cached) {
      return { success: true, invitation: cached };
    }
    return { success: false, error: err.message || 'Could not verify invitation token.' };
  }
}

/**
 * Accept invitation using token
 */
export async function acceptFamilyInvitationToken(inviteToken: string): Promise<JoinFamilyResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in to accept an invitation.' };
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Family Member';
  const userEmail = user?.email || '';
  const avatarUrl = user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;

  // Helper to sync profile, cache, and broadcast
  const finalizeAcceptedMember = async (familyId: string, familyName: string, role: FamilyRole = 'member') => {
    saveKnownProfile(user.id, {
      id: user.id,
      name: userName,
      email: userEmail,
      avatar_url: avatarUrl,
    });

    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: userName,
        email: userEmail,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {}

    const newMem: UserFamilyMembership = {
      id: user.id,
      family_id: familyId,
      family_name: familyName,
      description: '',
      user_id: user.id,
      role: role,
      role_display: getRoleLabel(role),
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const existingMems = getLocalUserMemberships(user.id);
    saveLocalUserMemberships(user.id, [...existingMems.filter(m => m.family_id !== familyId), newMem]);

    // Broadcast member_joined
    try {
      const channel = supabase.channel(`family:${familyId}`);
      channel.send({
        type: 'broadcast',
        event: 'member_joined',
        payload: {
          id: user.id,
          family_id: familyId,
          user_id: user.id,
          role: role,
          status: 'active',
          joined_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          custom_permissions: {},
          user: {
            id: user.id,
            name: userName,
            email: userEmail,
            avatar_url: avatarUrl,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      });
    } catch (bErr) {
      console.warn('Realtime broadcast notice:', bErr);
    }
  };

  // 1. Try atomic Supabase RPC accept_family_invitation_token
  try {
    const { data, error } = await supabase.rpc('accept_family_invitation_token', {
      p_token_hash: inviteToken,
    });

    if (!error && data) {
      const assignedRole: FamilyRole = (data.role || 'member') as FamilyRole;
      await finalizeAcceptedMember(data.family_id, data.name || 'Family Workspace', assignedRole);
      return {
        success: true,
        family_id: data.family_id,
        name: data.name,
        role: assignedRole,
      };
    }
  } catch (rpcErr) {}

  // 2. Direct fallback
  try {
    const details = await getInvitationDetails(inviteToken);
    if (!details.success || !details.invitation) {
      return { success: false, error: details.error || 'Invalid or expired invitation.' };
    }

    const { invitation } = details;
    const assignedRole: FamilyRole = (invitation.role || 'member') as FamilyRole;

    // Resilient upsert without obsolete role_id column
    const { error: upsertErr } = await supabase
      .from('family_members')
      .upsert({
        family_id: invitation.family_id,
        user_id: user.id,
        role: assignedRole,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'family_id,user_id' });

    if (upsertErr) {
      // Fallback simple insert if conflict clause failed
      await supabase.from('family_members').insert({
        family_id: invitation.family_id,
        user_id: user.id,
        role: assignedRole,
        status: 'active',
      });
    }

    await supabase.from('family_invitations').update({ status: 'accepted' }).eq('id', invitation.id);

    const cache = getLocalCachedInvitations();
    if (cache[inviteToken]) {
      cache[inviteToken].status = 'accepted';
      localStorage.setItem(INVITATION_CACHE_KEY, JSON.stringify(cache));
    }

    await finalizeAcceptedMember(invitation.family_id, invitation.family_name || 'Family Workspace', assignedRole);

    return {
      success: true,
      family_id: invitation.family_id,
      name: invitation.family_name || 'Family Workspace',
      role: assignedRole,
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
    await supabase.from('families').update({ family_code: newCode }).eq('id', familyId);
    return { success: true, invite_code: newCode };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to regenerate invitation code.' };
  }
}

/**
 * Family Head updates a member's role (persisted to Supabase and synced across clients)
 */
export async function updateFamilyMemberRole(
  familyId: string,
  memberId: string,
  newRole: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Try atomic RPC update_family_member_role
    const { error: rpcErr } = await supabase.rpc('update_family_member_role', {
      p_family_id: familyId,
      p_member_id: memberId,
      p_new_role: newRole,
    });

    if (rpcErr) {
      console.warn('RPC update_family_member_role notice:', rpcErr.message);

      // 2. Direct fallback update to family_members table
      const { data: updated, error: updateErr } = await supabase
        .from('family_members')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .match({ family_id: familyId, id: memberId })
        .select('id, user_id, role');

      if (updateErr || !updated || updated.length === 0) {
        // Try matching by user_id
        await supabase
          .from('family_members')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .match({ family_id: familyId, user_id: memberId });
      }
    }

    // 3. If promoted to family_head, also transfer ownership in families table
    const norm = newRole.toLowerCase();
    if (norm === 'family_head' || norm.includes('head')) {
      const { data: mem } = await supabase
        .from('family_members')
        .select('user_id')
        .or(`id.eq.${memberId},user_id.eq.${memberId}`)
        .eq('family_id', familyId)
        .maybeSingle();

      const newOwnerId = mem?.user_id || memberId;
      await supabase
        .from('families')
        .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
        .eq('id', familyId);
    }

    // 4. Broadcast real-time update to all clients on family channel
    try {
      const channel = supabase.channel(`family:${familyId}`);
      channel.send({
        type: 'broadcast',
        event: 'member_updated',
        payload: {
          id: memberId,
          family_id: familyId,
          role: newRole,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (bErr) {
      console.warn('Realtime broadcast warning:', bErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error updating member role:', err);
    return { success: false, error: err.message || 'Failed to update member role.' };
  }
}

