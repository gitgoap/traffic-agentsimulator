import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('Supabase PostgreSQL migration', () => {
  it('applies repeatably, enforces quotas, and denies direct anonymous data access', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        'create role anon; create role authenticated; create role service_role bypassrls;',
      );
      const sql = await readFile(
        new URL('../../supabase/migrations/001_traffic_lab.sql', import.meta.url),
        'utf8',
      );
      await db.exec(sql);
      await db.exec(sql);
      const call = () =>
        db.query<{ allowed: boolean }>(
          "select public.traffic_take_quota('client', 2, 60) as allowed",
        );
      expect((await call()).rows[0].allowed).toBe(true);
      expect((await call()).rows[0].allowed).toBe(true);
      expect((await call()).rows[0].allowed).toBe(false);
      await db.exec('set role anon');
      await expect(db.query('select * from public.traffic_scenarios')).rejects.toThrow(
        'permission denied',
      );
      await expect(db.query("select public.traffic_take_quota('x',1,1)")).rejects.toThrow(
        'permission denied',
      );
      await db.exec('reset role');
      const rls = await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where relname='traffic_scenarios'",
      );
      expect(rls.rows[0].relrowsecurity).toBe(true);
    } finally {
      await db.close();
    }
  }, 30000);
});
