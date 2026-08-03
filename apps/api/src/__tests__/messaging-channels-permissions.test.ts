import { describe, it, expect } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { RequestHandler } from 'express';
import { createChannelsRouter } from '../routes/messaging/channels';
import { MESSAGING_MODULE } from '@vencore/modules';

/**
 * Tags each gate handler with the permission it was built from, so the assertions
 * can read the gate off the router without standing up Express + a database.
 */
function taggingRequirePermission(permission: string): RequestHandler {
  const handler = (() => undefined) as unknown as RequestHandler;
  (handler as unknown as { __permission: string }).__permission = permission;
  return handler;
}

function permissionsForRoute(router: unknown, method: string, path: string): string[] {
  const stack = (router as { stack: unknown[] }).stack;
  const perms: string[] = [];
  for (const layer of stack as Array<{
    route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { __permission?: string } }> };
  }>) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    for (const h of layer.route.stack) {
      const p = h.handle.__permission;
      if (p) perms.push(p);
    }
  }
  return perms;
}

describe('messaging channels route permissions', () => {
  const db = {} as Kysely<Database>;

  it('gates channel creation on create_channel, not the admin-only manage', () => {
    const router = createChannelsRouter(db, taggingRequirePermission);

    const perms = permissionsForRoute(router, 'post', '/');

    expect(perms).toContain('messaging:create_channel');
    expect(perms).not.toContain('messaging:manage');
  });

  it('still gates rename and archive on manage', () => {
    const router = createChannelsRouter(db, taggingRequirePermission);

    expect(permissionsForRoute(router, 'patch', '/:id')).toContain('messaging:manage');
    expect(permissionsForRoute(router, 'delete', '/:id')).toContain('messaging:manage');
  });

  it('keeps listing and reading channels on view', () => {
    const router = createChannelsRouter(db, taggingRequirePermission);

    expect(permissionsForRoute(router, 'get', '/')).toContain('messaging:view');
    expect(permissionsForRoute(router, 'get', '/:id')).toContain('messaging:view');
  });
});

describe('messaging module permission definitions', () => {
  const byKey = new Map(MESSAGING_MODULE.permissions.map(p => [p.key, p]));

  it('declares messaging:create_channel', () => {
    expect(byKey.has('messaging:create_channel')).toBe(true);
  });

  it('grants channel creation to members, so they are not locked out', () => {
    expect(byKey.get('messaging:create_channel')?.defaultRoles).toContain('member');
    expect(byKey.get('messaging:create_channel')?.defaultRoles).toContain('admin');
  });

  it('keeps messaging:manage admin-only', () => {
    expect(byKey.get('messaging:manage')?.defaultRoles).toEqual(['admin']);
  });
});
