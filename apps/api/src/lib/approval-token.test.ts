import { describe, it, expect } from 'vitest'
import { signApprovalToken, verifyApprovalToken } from './approval-token'

const SECRET = 'test-secret'

describe('signApprovalToken / verifyApprovalToken', () => {
  it('round-trips the approval id and action', () => {
    const token = signApprovalToken({ aid: 'approval-1', act: 'approve' }, SECRET)
    const payload = verifyApprovalToken(token, SECRET)
    expect(payload.aid).toBe('approval-1')
    expect(payload.act).toBe('approve')
  })

  it('throws when verifying with the wrong secret', () => {
    const token = signApprovalToken({ aid: 'approval-1', act: 'reject' }, SECRET)
    expect(() => verifyApprovalToken(token, 'wrong-secret')).toThrow()
  })
})
