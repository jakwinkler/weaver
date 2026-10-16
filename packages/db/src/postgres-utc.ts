import { DataSource, DataSourceOptions } from 'typeorm';

type PostgresDataSourceOptions = Extract<DataSourceOptions, { type: 'postgres' }>;
type TextParser = (value: string) => unknown;

// The parts of the node-postgres module that TypeORM loads which this file touches.
interface NodePostgres {
  defaults: { parseInputDatesAsUTC: boolean };
  types: {
    builtins: { TIMESTAMP: number; TIMESTAMPTZ: number };
    getTypeParser(oid: number, format: 'text'): TextParser;
    setTypeParser(oid: number, parser: TextParser): void;
  };
}

const UTC_SESSION_OPTION = '-c TimeZone=UTC';

/**
 * Most created_at/updated_at columns are `timestamp without time zone` and hold UTC wall-clock
 * time. Without this, node-postgres reads and binds those values in the Node process zone, and
 * now() defaults follow the server's TimeZone setting, so any zone other than UTC shifts them.
 * This pins the session zone to UTC, reads timestamp values as UTC, and binds JS Dates as UTC.
 */
export function createPostgresDataSource(options: PostgresDataSourceOptions): DataSource {
  const dataSource = new DataSource({
    ...options,
    extra: {
      ...options.extra,
      options: [options.extra?.options, UTC_SESSION_OPTION].filter(Boolean).join(' '),
    },
  });
  useUtcTimestamps((dataSource.driver as unknown as { postgres: NodePostgres }).postgres);
  return dataSource;
}

// Both settings are process-wide on the pg module, so every client in the process agrees.
function useUtcTimestamps(pg: NodePostgres): void {
  const { TIMESTAMP, TIMESTAMPTZ } = pg.types.builtins;
  pg.defaults.parseInputDatesAsUTC = true;
  pg.types.setTypeParser(TIMESTAMP, utcTimestampParser(pg.types.getTypeParser(TIMESTAMPTZ, 'text')));
}

/** Reads `timestamp without time zone` text as UTC by giving the timestamptz parser a +00 offset. */
export function utcTimestampParser(parseTimestamptz: TextParser): TextParser {
  return (value) => {
    if (value === 'infinity' || value === '-infinity') return parseTimestamptz(value);
    return parseTimestamptz(value.endsWith(' BC') ? `${value.slice(0, -3)}+00 BC` : `${value}+00`);
  };
}
