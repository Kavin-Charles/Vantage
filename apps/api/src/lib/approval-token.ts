import jwt from 'jsonwebtoken'

export interface ApprovalTokenPayload {
  aid: string
  act: 'approve' | 'reject'
}

export function signApprovalToken(payload: ApprovalTokenPayload, jwtSecret: string): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' })
}

export function verifyApprovalToken(token: string, jwtSecret: string): ApprovalTokenPayload {
  return jwt.verify(token, jwtSecret) as ApprovalTokenPayload
}
