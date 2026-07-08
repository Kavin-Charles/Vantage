import { describe, it, expectTypeOf, vi } from 'vitest';

vi.mock('@/modules/shared/lib/api', () => ({ apiFetch: vi.fn() }));

import type { ApprovalRequest, CrossModuleSetting, ApproveTokenInfo } from '../api';
import { crossModuleApi, portalApproveApi } from '../api';

describe('api type exports', () => {
  it('ApprovalRequest has status field', () => {
    expectTypeOf<ApprovalRequest['status']>().toEqualTypeOf<'PENDING' | 'APPROVED' | 'REJECTED'>();
  });
  it('CrossModuleSetting has enabled boolean', () => {
    expectTypeOf<CrossModuleSetting['enabled']>().toBeBoolean();
  });
  it('ApproveTokenInfo has action field', () => {
    expectTypeOf<ApproveTokenInfo['action']>().toEqualTypeOf<'approve' | 'reject'>();
  });
  it('crossModuleApi.list is a function', () => {
    expectTypeOf(crossModuleApi.list).toBeFunction();
  });
  it('portalApproveApi.getInfo is a function', () => {
    expectTypeOf(portalApproveApi.getInfo).toBeFunction();
  });
});
