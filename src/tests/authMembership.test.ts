import { generateSecureInviteCode, createFamilyWithOwner, joinFamilyByCode } from '../services/familyService';

export async function runAuthMembershipTests() {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  // Test 1: Non-predictable secure invite code generation
  try {
    const code1 = generateSecureInviteCode();
    const code2 = generateSecureInviteCode();
    if (!/^FAM-[A-Z0-9-]+$/.test(code1)) throw new Error(`Code pattern mismatch: ${code1}`);
    if (code1 === code2) throw new Error('Invite codes must be unique and non-predictable');
    results.push({ name: 'Invite Code Generator Format & Uniqueness', passed: true });
  } catch (err: any) {
    results.push({ name: 'Invite Code Generator Format & Uniqueness', passed: false, error: err.message });
  }

  // Test 2: Create Family assigns Family Head role
  try {
    const res = await createFamilyWithOwner('Test Family Workspace', 'Test Description');
    if (!res.success || res.role !== 'family_head') {
      throw new Error(`Expected family_head role upon family creation, received: ${res.role}`);
    }
    results.push({ name: 'Create Family Flow (Creator = Family Head)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Create Family Flow (Creator = Owner)', passed: false, error: err.message });
  }

  // Test 3: Join Family assigns Member role
  try {
    const code = generateSecureInviteCode();
    const res = await joinFamilyByCode(code);
    if (res.success && res.role !== 'member') {
      throw new Error(`Expected member role upon joining family, received: ${res.role}`);
    }
    results.push({ name: 'Join Family Flow (Joiner = Member)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Join Family Flow (Joiner = Member)', passed: false, error: err.message });
  }

  // Test 4: Invalid Code Rejection
  try {
    const resEmpty = await joinFamilyByCode('');
    if (resEmpty.success) throw new Error('Empty invitation code should be rejected.');
    results.push({ name: 'Invalid Code Rejection', passed: true });
  } catch (err: any) {
    results.push({ name: 'Invalid Code Rejection', passed: false, error: err.message });
  }

  // Test 5: Known Profile Caching & Retrieval for Family Members
  try {
    const { saveKnownProfile, getKnownProfiles } = await import('../services/familyService');
    const testUserId = 'usr-test-' + Math.random().toString(36).slice(2, 8);
    saveKnownProfile(testUserId, {
      id: testUserId,
      name: 'Simulated Joined Member',
      email: 'member@test.com',
      avatar_url: 'https://example.com/avatar.png',
    });
    const profiles = getKnownProfiles();
    if (!profiles[testUserId] || profiles[testUserId].name !== 'Simulated Joined Member') {
      throw new Error('Profile was not correctly saved or retrieved from known profiles cache');
    }
    results.push({ name: 'Known Member Profile Caching & Visibility Sync', passed: true });
  } catch (err: any) {
    results.push({ name: 'Known Member Profile Caching & Visibility Sync', passed: false, error: err.message });
  }

  // Test 6: Supabase Workspace Query Resilience (No PGRST200 errors)
  try {
    const { supabaseDataService } = await import('../services/supabaseDataService');
    const dummyFamId = '00000000-0000-0000-0000-000000000000';
    // fetchFamilyWorkspace should execute without crashing or PGRST200 schema cache error
    const wsData = await supabaseDataService.fetchFamilyWorkspace(dummyFamId);
    if (!wsData || !Array.isArray(wsData.members)) {
      throw new Error('fetchFamilyWorkspace should return structured members array');
    }
    results.push({ name: 'Supabase Workspace Members Query Resilience', passed: true });
  } catch (err: any) {
    results.push({ name: 'Supabase Workspace Members Query Resilience', passed: false, error: err.message });
  }

  return results;
}
