import { getDatabase } from '../db/database';

export async function getOperatorName(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = 'operator_name'`
  );
  return row?.value ?? null;
}

export async function setOperatorName(name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('operator_name', ?)`,
    [name]
  );
}
