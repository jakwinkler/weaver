import { DataSource } from 'typeorm';
import { createPostgresDataSource, utcTimestampParser } from '../src/postgres-utc';

type TextParser = (value: string) => unknown;

interface NodePostgres {
  types: {
    builtins: { TIMESTAMP: number; TIMESTAMPTZ: number };
    getTypeParser(oid: number, format: 'text'): TextParser;
  };
  utils: { prepareValue(value: unknown): unknown };
}

function createDataSource(extra?: Record<string, unknown>) {
  return createPostgresDataSource({ type: 'postgres', host: 'localhost', database: 'weaver', extra });
}

// The node-postgres module TypeORM loaded for the data source, the one the helper configures.
function pgFor(dataSource: DataSource): NodePostgres {
  return (dataSource.driver as unknown as { postgres: NodePostgres }).postgres;
}

describe('UTC handling for timestamp without time zone', () => {
  const pg = pgFor(createDataSource());
  const parseTimestamp = pg.types.getTypeParser(pg.types.builtins.TIMESTAMP, 'text');

  it('reads stored wall-clock time as UTC whatever the process zone is', () => {
    expect(parseTimestamp('2026-10-15 22:06:00')).toEqual(new Date('2026-10-15T22:06:00.000Z'));
    expect(parseTimestamp('2026-10-15 23:59:59.999')).toEqual(new Date('2026-10-15T23:59:59.999Z'));
    expect(parseTimestamp('2026-03-08 02:30:00')).toEqual(new Date('2026-03-08T02:30:00.000Z'));
  });

  it('keeps the default parser behavior for infinity, BC years, and years below 100', () => {
    const parseTimestamptz = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ, 'text');
    const parse = utcTimestampParser(parseTimestamptz);

    expect(parse('infinity')).toBe(Infinity);
    expect(parse('-infinity')).toBe(-Infinity);
    expect(parse('0044-03-15 12:00:00 BC')).toEqual(parseTimestamptz('0044-03-15 12:00:00+00 BC'));
    expect((parse('0044-03-15 12:00:00 BC') as Date).getUTCFullYear()).toBe(-43);
    expect((parse('0099-01-01 00:00:00') as Date).getUTCFullYear()).toBe(99);
  });

  it('binds JS Dates as UTC so they match the stored wall-clock time', () => {
    expect(pg.utils.prepareValue(new Date('2026-10-15T22:06:00.000Z'))).toBe(
      '2026-10-15T22:06:00.000+00:00',
    );
  });

  it('pins every session to UTC and keeps other startup options', () => {
    expect(createDataSource().options.extra).toEqual({ options: '-c TimeZone=UTC' });
    expect(createDataSource({ options: '-c statement_timeout=5000', max: 4 }).options.extra).toEqual({
      options: '-c statement_timeout=5000 -c TimeZone=UTC',
      max: 4,
    });
  });
});
