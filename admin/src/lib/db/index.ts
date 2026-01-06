import { Pool, PoolClient } from 'pg';

// PostgreSQL connection pool with optimized settings
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'kiosk',
  user: process.env.POSTGRES_USER || 'orange',
  password: process.env.POSTGRES_PASSWORD || '00oo00oo',
  // Reduce max connections to leave room for other processes
  max: 10,
  // Minimum connections to keep in the pool
  min: 2,
  // Time before idle connections are closed
  idleTimeoutMillis: 30000,
  // Time to wait for a connection before failing
  connectionTimeoutMillis: 5000,
  // Allow connections to be reused
  allowExitOnIdle: false,
});

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

// Export pool for direct access if needed
export { pool };

// Query helper that returns typed results
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// Query single row
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

// Execute a query without expecting results (INSERT, UPDATE, DELETE)
export async function execute(
  text: string,
  params?: unknown[]
): Promise<{ rowCount: number }> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return { rowCount: result.rowCount || 0 };
  } finally {
    client.release();
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper to build WHERE clauses dynamically
export function buildWhereClause(
  conditions: Record<string, unknown>,
  startIndex: number = 1
): { clause: string; values: unknown[]; nextIndex: number } {
  const entries = Object.entries(conditions).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) {
    return { clause: '', values: [], nextIndex: startIndex };
  }

  const clauses: string[] = [];
  const values: unknown[] = [];
  let index = startIndex;

  for (const [key, value] of entries) {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    clauses.push(`${snakeKey} = $${index}`);
    values.push(value);
    index++;
  }

  return {
    clause: 'WHERE ' + clauses.join(' AND '),
    values,
    nextIndex: index,
  };
}

// Helper to convert camelCase to snake_case
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Helper to convert snake_case to camelCase
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert object keys from snake_case to camelCase
export function snakeToCamelObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[camelKey] = snakeToCamelObject(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

// Convert object keys from camelCase to snake_case
export function camelToSnakeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[snakeKey] = camelToSnakeObject(value as Record<string, unknown>);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

// Close pool on application shutdown
export async function closePool(): Promise<void> {
  await pool.end();
}
