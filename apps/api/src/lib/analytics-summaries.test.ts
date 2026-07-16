import { describe, it, expect } from 'vitest'
import { summarizeInfra, summarizePm } from './analytics-summaries'

describe('summarizeInfra', () => {
  const now = new Date('2026-07-16T00:00:00Z')

  it('counts servers by status and averages metrics over online servers', () => {
    const out = summarizeInfra(
      [
        { status: 'online', cpu_pct: 40, mem_pct: 60, disk_pct: 20 },
        { status: 'online', cpu_pct: 60, mem_pct: null, disk_pct: 40 },
        { status: 'degraded', cpu_pct: 90, mem_pct: 90, disk_pct: 90 },
        { status: 'offline', cpu_pct: null, mem_pct: null, disk_pct: null },
        { status: 'stopped', cpu_pct: null, mem_pct: null, disk_pct: null },
      ],
      [], [], now,
    )
    expect(out.servers).toEqual({
      online: 2, degraded: 1, offline: 1, stopped: 1,
      avg_cpu: 50, avg_mem: 60, avg_disk: 30,
    })
  })

  it('averages website uptime and counts ssl expiring within 30 days', () => {
    const out = summarizeInfra([], [
      { uptime_pct_30d: 99.8, ssl_expiry_date: new Date('2026-07-20') },  // expiring soon
      { uptime_pct_30d: 98.2, ssl_expiry_date: new Date('2027-01-01') },  // fine
      { uptime_pct_30d: null, ssl_expiry_date: new Date('2026-07-01') },  // already expired → counts
      { uptime_pct_30d: 100, ssl_expiry_date: null },                     // unknown → ignored
    ], [], now)
    expect(out.websites.total).toBe(4)
    expect(out.websites.avg_uptime).toBeCloseTo(99.33, 1)
    expect(out.websites.ssl_expiring_soon).toBe(2)
  })

  it('maps alert severity counts and defaults missing severities to zero', () => {
    const out = summarizeInfra([], [], [
      { severity: 'critical', count: '3' },
      { severity: 'warning', count: 1 },
    ], now)
    expect(out.alerts).toEqual({ critical: 3, warning: 1, info: 0 })
  })

  it('returns zeros on an empty workspace', () => {
    const out = summarizeInfra([], [], [], now)
    expect(out.servers.avg_cpu).toBe(0)
    expect(out.websites.avg_uptime).toBe(0)
    expect(out.alerts).toEqual({ critical: 0, warning: 0, info: 0 })
  })
})

describe('summarizePm', () => {
  it('computes completion rate and coerces DB string counts', () => {
    const out = summarizePm(
      '2',
      { total: '10', done: '4', overdue: '1', open: '6' },
      [{ name: 'Sprint 3', velocity: 21, end_date: new Date('2026-07-10') }],
      [{ user_id: 'u1', name: 'Ada', total: '5', done: '2', overdue: '1' }],
    )
    expect(out.projects.active).toBe(2)
    expect(out.tasks).toEqual({ total: 10, done: 4, overdue: 1, open: 6, completion_rate: 40 })
    expect(out.velocity).toEqual([{ sprint_name: 'Sprint 3', velocity: 21, end_date: '2026-07-10T00:00:00.000Z' }])
    expect(out.workload).toEqual([{ user_id: 'u1', name: 'Ada', total: 5, done: 2, overdue: 1 }])
  })

  it('handles zero tasks without dividing by zero', () => {
    const out = summarizePm(0, { total: 0, done: 0, overdue: 0, open: 0 }, [], [])
    expect(out.tasks.completion_rate).toBe(0)
  })

  it('handles missing task stats row (undefined)', () => {
    const out = summarizePm(0, undefined, [], [])
    expect(out.tasks).toEqual({ total: 0, done: 0, overdue: 0, open: 0, completion_rate: 0 })
  })

  it('passes through null velocity and null end_date (active sprints)', () => {
    const out = summarizePm(1, { total: 0, done: 0, overdue: 0, open: 0 },
      [{ name: 'Sprint 4', velocity: null, end_date: null }], [])
    expect(out.velocity).toEqual([{ sprint_name: 'Sprint 4', velocity: null, end_date: null }])
  })
})
