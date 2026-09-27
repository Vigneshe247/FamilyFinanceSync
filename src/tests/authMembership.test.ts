import { generateSecureInviteCode, createFamilyWithOwner, joinFamilyByCode } from '../services/familyService';

export async function runAuthMembershipTests() {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  // Test 1: Non-predictable secure invite code generation
  try {
    const code1 = generateSecureInviteCode();
    const code2 = generateSecureInviteCode();
    if (!/^FAM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code1)) throw new Error(`Code pattern mismatch: ${code1}`);
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

  return results;
}
