import { describe, it, expect } from 'vitest'
import { seedGroups, mergeLayout, validateLayout } from './sidebar-layout'

describe('seedGroups', () => {
  it('returns the five seed groups with General as the only default', () => {
    const groups = seedGroups()
    expect(groups.map(g => g.label)).toEqual(['Sales', 'Infra', 'Projects', 'Insights', 'General'])
    expect(groups.filter(g => g.is_default).map(g => g.label)).toEqual(['General'])
    expect(groups.find(g => g.label === 'Sales')!.item_keys).toEqual(['/crm/pipeline', '/crm/contacts', '/crm/companies', '/crm/tasks', '/activity'])
    expect(groups.find(g => g.label === 'Insights')!.item_keys).toEqual(['/analytics', '/alerts'])
    expect(groups.flatMap(g => g.item_keys)).not.toContain('/settings')
    expect(groups.flatMap(g => g.item_keys)).not.toContain('/pipeline')
  })

  it('returns a fresh copy each call', () => {
    const a = seedGroups()
    a[0]!.item_keys.push('/mutated')
    expect(seedGroups()[0]!.item_keys).not.toContain('/mutated')
  })
})

describe('mergeLayout', () => {
  const base = () => [
    { id: 'g1', label: 'Sales', is_default: false, item_keys: ['/pipeline'] },
    { id: 'g2', label: 'General', is_default: true, item_keys: ['/dashboard'] },
  ]

  it('appends known keys missing from every group to the default group', () => {
    const merged = mergeLayout(base(), ['/pipeline', '/dashboard', '/plugins/foo/home'])
    expect(merged.find(g => g.id === 'g2')!.item_keys).toEqual(['/dashboard', '/plugins/foo/home'])
  })

  it('drops duplicate keys, first occurrence wins', () => {
    const groups = base()
    groups[1]!.item_keys = ['/dashboard', '/pipeline']
    const merged = mergeLayout(groups, ['/pipeline', '/dashboard'])
    expect(merged.find(g => g.id === 'g1')!.item_keys).toEqual(['/pipeline'])
    expect(merged.find(g => g.id === 'g2')!.item_keys).toEqual(['/dashboard'])
  })

  it('keeps unknown stored keys (stale modules stay assigned, hidden client-side)', () => {
    const groups = base()
    groups[0]!.item_keys = ['/pipeline', '/ghost']
    const merged = mergeLayout(groups, ['/pipeline', '/dashboard'])
    expect(merged.find(g => g.id === 'g1')!.item_keys).toEqual(['/pipeline', '/ghost'])
  })

  it('forces exactly one default group when none is marked', () => {
    const groups = base().map(g => ({ ...g, is_default: false }))
    const merged = mergeLayout(groups, [])
    expect(merged.filter(g => g.is_default)).toHaveLength(1)
  })

  it('does not mutate its input', () => {
    const groups = base()
    mergeLayout(groups, ['/pipeline', '/dashboard', '/new'])
    expect(groups[1]!.item_keys).toEqual(['/dashboard'])
  })
})

describe('validateLayout', () => {
  const ok = () => [
    { label: 'Sales', item_keys: ['/pipeline'], is_default: false },
    { label: 'General', item_keys: ['/dashboard'], is_default: true },
  ]

  it('accepts a valid layout', () => {
    expect(validateLayout(ok())).toBeNull()
  })

  it('rejects empty layout', () => {
    expect(validateLayout([])).toMatch(/at least one/i)
  })

  it('rejects zero or multiple default groups', () => {
    expect(validateLayout(ok().map(g => ({ ...g, is_default: false })))).toMatch(/default/i)
    expect(validateLayout(ok().map(g => ({ ...g, is_default: true })))).toMatch(/default/i)
  })

  it('rejects empty and duplicate labels (case-insensitive)', () => {
    const g = ok()
    g[0]!.label = '   '
    expect(validateLayout(g)).toMatch(/label/i)
    const d = ok()
    d[0]!.label = 'general'
    expect(validateLayout(d)).toMatch(/label/i)
  })

  it('rejects duplicate item keys across groups', () => {
    const g = ok()
    g[0]!.item_keys = ['/pipeline', '/dashboard']
    expect(validateLayout(g)).toMatch(/duplicate/i)
  })
})
