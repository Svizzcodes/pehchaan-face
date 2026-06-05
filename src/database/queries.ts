import { getDatabase } from './schema';

export interface EnrolledFace {
  id: number;
  employee_id: string;
  name: string;
  designation: string;
  embedding: number[];
  enrolled_at: number;
  synced: number;
}

export interface AttendanceRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  timestamp: number;
  confidence: number;
  liveness_passed: boolean;
  location: string | null;
  synced: number;
}

// ─── Enrolled Faces ───────────────────────────────────────────────────────────

export async function enrollFace(
  employee_id: string,
  name: string,
  designation: string,
  embedding: number[]
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO enrolled_faces 
     (employee_id, name, designation, embedding, enrolled_at, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [employee_id, name, designation, JSON.stringify(embedding), Date.now()]
  );
}

export async function getAllEnrolledFaces(): Promise<EnrolledFace[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM enrolled_faces ORDER BY name ASC'
  );
  return rows.map((r) => ({
    ...r,
    embedding: JSON.parse(r.embedding),
  }));
}

export async function deleteEnrolledFace(employee_id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM enrolled_faces WHERE employee_id = ?', [employee_id]);
  await db.runAsync('DELETE FROM unique_attendance_days WHERE employee_id = ?', [employee_id]);
}

export async function getEnrolledFaceCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM enrolled_faces'
  );
  return result?.count ?? 0;
}

// ─── Attendance Records ───────────────────────────────────────────────────────

export async function insertAttendanceRecord(
  employee_id: string,
  employee_name: string,
  confidence: number,
  liveness_passed: boolean,
  location?: string
): Promise<void> {
  const db = await getDatabase();
  const timestamp = Date.now();
  await db.runAsync(
    `INSERT INTO attendance_records 
     (employee_id, employee_name, timestamp, confidence, liveness_passed, location, synced)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [
      employee_id,
      employee_name,
      timestamp,
      confidence,
      liveness_passed ? 1 : 0,
      location ?? null,
    ]
  );

  if (liveness_passed) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    await db.runAsync(
      `INSERT OR IGNORE INTO unique_attendance_days (employee_id, date) VALUES (?, ?)`,
      [employee_id, dateStr]
    );
  }
}

export async function getAttendanceRecords(limit = 50): Promise<AttendanceRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM attendance_records ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    liveness_passed: r.liveness_passed === 1,
  }));
}

export async function getUnsyncedRecords(): Promise<AttendanceRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM attendance_records WHERE synced = 0 ORDER BY timestamp ASC'
  );
  return rows.map((r) => ({
    ...r,
    liveness_passed: r.liveness_passed === 1,
  }));
}

export async function markRecordsSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE attendance_records SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function purgeSyncedRecords(): Promise<number> {
  const db = await getDatabase();
  // Delete all synced records from device storage
  const result = await db.runAsync(
    'DELETE FROM attendance_records WHERE synced = 1'
  );
  return result.changes;
}

export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM attendance_records ORDER BY timestamp DESC'
  );
  return rows.map((r) => ({
    ...r,
    liveness_passed: r.liveness_passed === 1,
  }));
}

export async function getUnsyncedCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM attendance_records WHERE synced = 0'
  );
  return result?.count ?? 0;
}

export interface UniqueAttendanceDay {
  employee_id: string;
  date: string;
}

export async function getRecentUniqueAttendanceDays(daysLimit = 30): Promise<UniqueAttendanceDay[]> {
  const db = await getDatabase();
  const startTime = Date.now() - daysLimit * 24 * 60 * 60 * 1000;
  const d = new Date(startTime);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const rows = await db.getAllAsync<any>(
    'SELECT employee_id, date FROM unique_attendance_days WHERE date >= ?',
    [dateStr]
  );
  return rows.map((r) => ({
    employee_id: r.employee_id,
    date: r.date,
  }));
}
