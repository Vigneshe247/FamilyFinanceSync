import { runAuthMembershipTests } from './authMembership.test';
import { runComprehensiveTestSuite } from './importAndAuthSuite.test';
import { runDomainLogicTestSuite } from './domainLogic.test';

async function main() {
  console.log('====================================================');
  console.log('RUNNING FAMILYFINANCESYNC VALIDATION TEST SUITE');
  console.log('====================================================\n');

  let passedTotal = 0;
  let failedTotal = 0;

  // 1. Comprehensive Suite
  console.log('--- 1. Family Codes, Normalization & Deduplication Tests ---');
  const compResults = runComprehensiveTestSuite();
  for (const r of compResults) {
    if (r.passed) {
      console.log(`  ✓ [PASS] [${r.category.toUpperCase()}] ${r.name}`);
      passedTotal++;
    } else {
      console.error(`  ✗ [FAIL] [${r.category.toUpperCase()}] ${r.name}: ${r.message}`);
      failedTotal++;
    }
  }

  // 2. Domain Logic, RBAC & Privacy Suite
  console.log('\n--- 2. Currency, RBAC, Privacy & Approval Threshold Tests ---');
  const domainResults = runDomainLogicTestSuite();
  for (const r of domainResults) {
    if (r.passed) {
      console.log(`  ✓ [PASS] [${r.category.toUpperCase()}] ${r.name}`);
      passedTotal++;
    } else {
      console.error(`  ✗ [FAIL] [${r.category.toUpperCase()}] ${r.name}: ${r.message}`);
      failedTotal++;
    }
  }

  // 3. Auth Membership Tests
  console.log('\n--- 3. Auth & Family Membership Flow Tests ---');
  try {
    const authResults = await runAuthMembershipTests();
    for (const r of authResults) {
      if (r.passed) {
        console.log(`  ✓ [PASS] ${r.name}`);
        passedTotal++;
      } else {
        console.error(`  ✗ [FAIL] ${r.name}: ${r.error}`);
        failedTotal++;
      }
    }
  } catch (err: any) {
    console.error('  Auth test error:', err.message);
  }

  console.log('\n====================================================');
  console.log(`TOTAL PASSED: ${passedTotal} | TOTAL FAILED: ${failedTotal}`);
  console.log('====================================================');

  if (failedTotal > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Runner failed:', err);
  process.exit(1);
});
