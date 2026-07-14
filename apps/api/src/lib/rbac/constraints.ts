export type ConstraintSet = { id: string; name: string; cardinality: number; roleIds: string[] };

function violated(roleIds: Set<string>, sets: ConstraintSet[]): { setId: string; name: string }[] {
  const out: { setId: string; name: string }[] = [];
  for (const s of sets) {
    const held = s.roleIds.filter(r => roleIds.has(r)).length;
    if (held >= s.cardinality) out.push({ setId: s.id, name: s.name });
  }
  return out;
}

// Caller passes the AUTHORIZED closure (assigned + inherited descendants).
export function checkSSD(authorizedRoleIds: Set<string>, sets: ConstraintSet[]) {
  return violated(authorizedRoleIds, sets);
}

// Caller passes the ACTIVE closure (activated + inherited descendants).
export function checkDSD(activeRoleIds: Set<string>, sets: ConstraintSet[]) {
  return violated(activeRoleIds, sets);
}

export function checkCardinality(role: { id: string; max_members: number | null }, currentMemberCount: number): boolean {
  return role.max_members === null || currentMemberCount < role.max_members;
}
