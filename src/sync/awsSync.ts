/**
 * AWS S3 Sync Module — using plain fetch + manual Signature V4
 *
 * Avoids @aws-sdk entirely (which pulls in Node.js built-ins incompatible
 * with React Native's JS runtime).
 *
 * Uploads attendance records as JSON to S3 using pre-signed URLs or
 * direct PUT with SigV4 signing via the Web Crypto API.
 */

import {
  getUnsyncedRecords,
  markRecordsSynced,
  purgeSyncedRecords,
} from '../database/queries';

// ─── AWS Configuration ────────────────────────────────────────────────────────
const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION ?? 'ap-south-1';
const S3_BUCKET = process.env.EXPO_PUBLIC_S3_BUCKET ?? 'pehchaan-attendance-data';
const AWS_ACCESS_KEY_ID = process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID ?? '';
const AWS_SECRET_ACCESS_KEY = process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY ?? '';

export interface SyncResult {
  success: boolean;
  uploadedCount: number;
  purgedCount: number;
  error?: string;
}

/**
 * Main sync function:
 * 1. Fetch all unsynced records from SQLite
 * 2. Upload as JSON batch to S3 via signed PUT request
 * 3. Mark records synced + purge from local DB
 */
export async function syncAttendanceToAWS(): Promise<SyncResult> {
  try {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return {
        success: false,
        uploadedCount: 0,
        purgedCount: 0,
        error: 'AWS credentials not configured. Add them to your .env file.',
      };
    }

    const unsyncedRecords = await getUnsyncedRecords();

    if (unsyncedRecords.length === 0) {
      return { success: true, uploadedCount: 0, purgedCount: 0 };
    }

    const timestamp = new Date().toISOString();
    const deviceId = 'pehchaan-device-001';
    const s3Key = `attendance/${deviceId}/${timestamp}.json`;

    const payload = JSON.stringify({
      device_id: deviceId,
      sync_timestamp: timestamp,
      records: unsyncedRecords.map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        timestamp: new Date(r.timestamp).toISOString(),
        confidence: r.confidence,
        liveness_passed: r.liveness_passed,
        location: r.location,
      })),
    });

    // Upload to S3 using signed URL
    const uploaded = await putObjectToS3(s3Key, payload, 'application/json');

    if (!uploaded.ok) {
      const errText = await uploaded.text();
      return {
        success: false,
        uploadedCount: 0,
        purgedCount: 0,
        error: `S3 upload failed: ${uploaded.status} — ${errText}`,
      };
    }

    // Mark synced + purge
    const ids = unsyncedRecords.map((r) => r.id);
    await markRecordsSynced(ids);
    const purgedCount = await purgeSyncedRecords();

    return {
      success: true,
      uploadedCount: unsyncedRecords.length,
      purgedCount,
    };
  } catch (error: any) {
    console.error('[Sync] Failed:', error);
    return {
      success: false,
      uploadedCount: 0,
      purgedCount: 0,
      error: error?.message ?? 'Unknown error',
    };
  }
}

// ─── AWS Signature V4 using Web Crypto API ────────────────────────────────────

async function putObjectToS3(
  key: string,
  body: string,
  contentType: string
): Promise<Response> {
  const now = new Date();
  const dateStamp = formatDate(now);       // YYYYMMDD
  const amzDate = formatDateTime(now);     // YYYYMMDDTHHMMSSZ
  const host = `${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;
  const url = `https://${host}/${key}`;

  const bodyHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Host': host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };

  const signedHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
    .join(';');

  const canonicalHeaders = Object.keys(headers)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => `${k.toLowerCase()}:${headers[k]}\n`)
    .join('');

  const canonicalRequest = [
    'PUT',
    `/${key}`,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(AWS_SECRET_ACCESS_KEY, dateStamp, AWS_REGION, 's3');
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method: 'PUT',
    headers: { ...headers, Authorization: authorization },
    body,
  });
}

// ─── Crypto Helpers (Web Crypto API — available in React Native's Hermes) ─────

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return bufferToHex(hashBuffer);
}

async function hmac(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  return bufferToHex(await hmac(key, message));
}

async function getSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kSecret = new TextEncoder().encode(`AWS4${secret}`);
  const kDate = await hmac(kSecret.buffer, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}
