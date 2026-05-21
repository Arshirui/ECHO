import { describe, expect, it } from 'vitest';
import type { EchoDatabase } from './createDatabase';
import { migrations, runMigrations } from './migrations';
import { librarySchemaSql } from './schema';

class FakeStatement {
  constructor(private readonly allResult: Array<{ id: number }> = [], private readonly onRun: (...args: unknown[]) => void = () => undefined) {}

  all(): Array<{ id: number }> {
    return this.allResult;
  }

  run(...args: unknown[]): void {
    this.onRun(...args);
  }
}

class FakeDatabase {
  readonly executedSql: string[] = [];
  readonly insertedMigrationIds: number[] = [];

  constructor(private readonly appliedMigrationIds: number[]) {}

  exec(sql: string): void {
    this.executedSql.push(sql);
  }

  prepare(sql: string): FakeStatement {
    if (sql.includes('SELECT id FROM schema_migrations')) {
      return new FakeStatement(this.appliedMigrationIds.map((id) => ({ id })));
    }

    if (sql.includes('INSERT INTO schema_migrations')) {
      return new FakeStatement([], (id) => {
        this.insertedMigrationIds.push(Number(id));
      });
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

describe('database migrations', () => {
  it('includes scan directory snapshots in the base schema for new databases', () => {
    expect(librarySchemaSql).toContain('CREATE TABLE IF NOT EXISTS scan_directory_snapshots');
    expect(librarySchemaSql).toContain('PRIMARY KEY (folder_id, path)');
  });

  it('adds scan directory snapshots to existing databases without touching library rows', () => {
    const database = new FakeDatabase(Array.from({ length: 35 }, (_, index) => index + 1));

    runMigrations(database as unknown as EchoDatabase);

    const migrationSql = database.executedSql.join('\n');
    expect(database.insertedMigrationIds).toEqual([36]);
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS scan_directory_snapshots');
    expect(migrationSql).not.toMatch(/\b(?:DELETE|UPDATE)\s+(?:FROM\s+)?(?:folders|tracks|scan_jobs)\b/iu);
  });

  it('keeps scan directory snapshot migration as the latest additive step', () => {
    expect(migrations.at(-1)).toMatchObject({ id: 36 });
  });
});
