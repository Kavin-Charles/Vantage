export type InheritanceEdge = { parent: string; child: string };

export function authorizedRoleClosure(roleIds: string[], edges: InheritanceEdge[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenOf.get(e.parent) ?? [];
    list.push(e.child);
    childrenOf.set(e.parent, list);
  }
  const seen = new Set<string>();
  const stack = [...roleIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return seen;
}

// Adding parent->child forms a cycle iff parent is already reachable from child.
export function wouldCreateCycle(edges: InheritanceEdge[], newEdge: InheritanceEdge): boolean {
  return authorizedRoleClosure([newEdge.child], edges).has(newEdge.parent);
}
