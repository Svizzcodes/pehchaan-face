import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('pehchaan.db');
  await initializeSchema(db);
  return db;
}

async function initializeSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS enrolled_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      designation TEXT,
      embedding TEXT NOT NULL,
      enrolled_at INTEGER NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      confidence REAL NOT NULL,
      liveness_passed INTEGER NOT NULL,
      location TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS unique_attendance_days (
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      PRIMARY KEY (employee_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_synced ON attendance_records(synced);
    CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_records(timestamp);
  `);

  // Migrate existing records to unique_attendance_days
  try {
    const rows = await database.getAllAsync<any>(
      'SELECT employee_id, timestamp FROM attendance_records WHERE liveness_passed = 1'
    );
    for (const row of rows) {
      const d = new Date(row.timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      await database.runAsync(
        'INSERT OR IGNORE INTO unique_attendance_days (employee_id, date) VALUES (?, ?)',
        [row.employee_id, dateStr]
      );
    }
  } catch (error) {
    console.error('[Schema Migration] Failed to backfill unique_attendance_days:', error);
  }
}

