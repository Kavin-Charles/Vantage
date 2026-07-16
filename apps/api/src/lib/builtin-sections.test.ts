import { describe, it, expect } from 'vitest'
import { SLOT_CATALOG, isKnownSlot } from '@vencore/plugin-types'
import {
  BUILTIN_ANALYTICS_SECTIONS,
  resolveBuiltinSections,
  requiredContracts,
} from './builtin-sections'

describe('SLOT_CATALOG analytics page', () => {
  it('exposes overview (grid) and panels (stack) slots', () => {
    expect(SLOT_CATALOG['analytics']).toEqual([
      { id: 'overview', layout: 'grid' },
      { id: 'panels', layout: 'stack' },
    ])
    expect(isKnownSlot('analytics:overview')).toBe(true)
    expect(isKnownSlot('analytics:panels')).toBe(true)
    expect(isKnownSlot('analytics:bogus')).toBe(false)
  })
})

describe('BUILTIN_ANALYTICS_SECTIONS', () => {
  it('declares exactly one gate per section and only known slots', () => {
    for (const d of BUILTIN_ANALYTICS_SECTIONS) {
      const gates = [d.requires_contract, d.requires_module].filter(Boolean)
      expect(gates).toHaveLength(1)
      expect(isKnownSlot(d.slot)).toBe(true)
    }
  })

  it('covers crm, infra, projects in both slots', () => {
    const ids = BUILTIN_ANALYTICS_SECTIONS.map(d => d.id).sort()
    expect(ids).toEqual([
      'crm-overview', 'crm-panel',
      'infra-overview', 'infra-panel',
      'pm-overview', 'pm-panel',
    ])
  })
})

describe('resolveBuiltinSections', () => {
  const allOn = {
    enabledModules: new Set(['infra', 'projects']),
    activeContracts: new Set(['crm.deal@v1']),
  }

  it('returns all six sections when every gate passes', () => {
    const out = resolveBuiltinSections('analytics', allOn)
    expect(out).toHaveLength(6)
    expect(out.every(s => s.kind === 'builtin')).toBe(true)
  })

  it('drops contract-gated sections when no provider is active', () => {
    const out = resolveBuiltinSections('analytics', {
      enabledModules: new Set(['infra', 'projects']),
      activeContracts: new Set(),
    })
    expect(out.map(s => s.id).sort()).toEqual(
      ['infra-overview', 'infra-panel', 'pm-overview', 'pm-panel'])
  })

  it('drops module-gated sections when the module is disabled', () => {
    const out = resolveBuiltinSections('analytics', {
      enabledModules: new Set(['projects']),
      activeContracts: new Set(['crm.deal@v1']),
    })
    expect(out.map(s => s.id).sort()).toEqual(
      ['crm-overview', 'crm-panel', 'pm-overview', 'pm-panel'])
  })

  it('returns empty when nothing is active', () => {
    expect(resolveBuiltinSections('analytics', {
      enabledModules: new Set(), activeContracts: new Set(),
    })).toEqual([])
  })

  it('ignores sections targeting other pages', () => {
    expect(resolveBuiltinSections('dashboard', allOn)).toEqual([])
  })

  it('maps slot to slot_id and module_id to plugin_id', () => {
    const out = resolveBuiltinSections('analytics', allOn)
    const crm = out.find(s => s.id === 'crm-panel')!
    expect(crm.slot_id).toBe('panels')
    expect(crm.plugin_id).toBe('crm')
  })
})

describe('requiredContracts', () => {
  it('returns the distinct contracts referenced by the registry', () => {
    expect(requiredContracts()).toEqual(['crm.deal@v1'])
  })
})
