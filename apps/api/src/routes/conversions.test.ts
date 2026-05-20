import { describe, it, expect, vi } from 'vitest';
import { createConversionsRouter } from './conversions';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function buildMockDb(rows: unknown[] = [], single?: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['selectFrom','insertInto','updateTable','deleteFrom','values','set','where','select',
    'selectAll','innerJoin','returning','returningAll','onConflict','doNothing',
    'execute','executeTakeFirst','executeTakeFirstOrThrow','orderBy','limit','offset','deleteFrom'];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(single ?? rows[0]);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(single ?? rows[0] ?? { id: 'new-id' });
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    deleteFrom: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

function mockReq(overrides = {}) {
  return { workspace: { id: 'ws-1' }, user: { id: 'user-1', role: 'admin' }, body: {}, params: {}, query: {}, ...overrides } as unknown as import('express').Request;
}
function mockRes() {
  const res = { json: vi.fn(), status: vi.fn() } as unknown as import('express').Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}
function getHandler(router: ReturnType<typeof createConversionsRouter>, method: string, path: string) {
  const stack = (router as unknown as { stack: { route: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const layer = stack.find(s => s.route?.path === path && s.route?.methods[method]);
  return layer!.route.stack[layer!.route.stack.length - 1]!.handle;
}

describe('GET /templates', () => {
  it('returns templates filtered by source_type_id', async () => {
    const db = buildMockDb([{ id: 'tpl-1', name: 'Enquiry → Quote' }]);
    const router = createConversionsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'get', '/templates');
    const req = mockReq({ query: { source_type_id: '00000000-0000-0000-0000-000000000001' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('POST /templates', () => {
  it('creates template with field mappings', async () => {
    const db = buildMockDb([], { id: 'tpl-new' });
    const router = createConversionsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'post', '/templates');
    const req = mockReq({
      body: {
        name: 'Enquiry → Quote',
        source_type_id: '00000000-0000-0000-0000-000000000001',
        target_type_id: '00000000-0000-0000-0000-000000000002',
        target_pipeline_id: '00000000-0000-0000-0000-000000000003',
        target_stage_id: '00000000-0000-0000-0000-000000000004',
        field_mappings: [],
      },
    });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});

describe('POST /records/:id/convert', () => {
  it('returns 404 when source record not found', async () => {
    const db = buildMockDb([], undefined);
    const router = createConversionsRouter(db as unknown as Kysely<Database>);
    const handler = getHandler(router, 'post', '/records/:id/convert');
    const req = mockReq({ params: { id: '00000000-0000-0000-0000-000000000001' }, body: { template_id: '00000000-0000-0000-0000-000000000002' } });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /records/:id/convert (happy path)', () => {
  it('creates target record and returns record_id', async () => {
    // Need to return different values for sequential execute() calls
    // First executeTakeFirst → source record
    // Second executeTakeFirst → template
    // execute() calls → mappings, source values
    // executeTakeFirstOrThrow inside transaction → target record
    const sourceRecord = { id: 'src-1', workspace_id: 'ws-1', name: 'Test', deleted_at: null, owner_id: 'user-1', contact_id: null, company_id: null };
    const templateRow = { id: 'tpl-1', target_type_id: 'rt-2', target_pipeline_id: 'pl-1', target_stage_id: 'st-1', workspace_id: 'ws-1' };
    const targetRecord = { id: 'tgt-1' };

    let executeTakeFirstCallCount = 0;
    const chain: Record<string, unknown> = {};
    const methods = ['selectFrom','insertInto','updateTable','deleteFrom','values','set','where','select',
      'selectAll','innerJoin','returning','returningAll','onConflict','doNothing',
      'execute','executeTakeFirst','executeTakeFirstOrThrow','orderBy','limit','offset'];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain['execute'] = vi.fn().mockResolvedValue([]);
    chain['executeTakeFirst'] = vi.fn().mockImplementation(() => {
      executeTakeFirstCallCount++;
      if (executeTakeFirstCallCount === 1) return Promise.resolve(sourceRecord);
      if (executeTakeFirstCallCount === 2) return Promise.resolve(templateRow);
      return Promise.resolve(null);
    });
    chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(targetRecord);

    const mockDb = {
      selectFrom: vi.fn().mockReturnValue(chain),
      insertInto: vi.fn().mockReturnValue(chain),
      updateTable: vi.fn().mockReturnValue(chain),
      deleteFrom: vi.fn().mockReturnValue(chain),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn().mockImplementation(async (fn: (trx: unknown) => Promise<unknown>) => {
          return fn({
            insertInto: vi.fn().mockReturnValue(chain),
          });
        }),
      }),
      fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
    };

    const router = createConversionsRouter(mockDb as unknown as Kysely<Database>);
    const handler = getHandler(router, 'post', '/records/:id/convert');
    const req = mockReq({
      params: { id: '00000000-0000-0000-0000-000000000001' },
      body: { template_id: '00000000-0000-0000-0000-000000000002' },
    });
    const res = mockRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: { record_id: 'tgt-1' }, error: null });
  });
});
