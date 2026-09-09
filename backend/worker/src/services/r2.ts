const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function validateFile(file: Blob): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "File size exceeds 10 MB limit" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" is not allowed`,
    };
  }
  return { valid: true };
}

export async function uploadFile(
  r2: R2Bucket,
  key: string,
  body: Blob | ReadableStream<Uint8Array> | ArrayBuffer | string,
  contentType: string,
  options?: { contentDisposition?: string }
): Promise<string> {
  await r2.put(key, body, {
    httpMetadata: {
      contentType,
      contentDisposition: options?.contentDisposition,
    },
  });

  return key;
}

export async function getFile(r2: R2Bucket, key: string): Promise<Response> {
  const object = await r2.get(key);
  if (object === null) {
    return new Response("File not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": object.httpMetadata?.contentDisposition ?? "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function deleteFile(r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key);
}

export function generateFileKey(prefix: string, userId: string, originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
  return `${prefix}/${userId}/${timestamp}-${random}.${ext}`;
}

export async function listFiles(r2: R2Bucket, prefix: string): Promise<{ key: string; size: number; uploaded: number }[]> {
  const list = await r2.list({ prefix });
  return list.objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.getTime(),
  }));
}

export function getFileOwnerId(key: string): string | null {
  const parts = key.split("/");
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return null;
}

export function canAccessFile(userRole: string, key: string, userId: string): boolean {
  if (userRole === "Manager" || userRole === "Supervisor") {
    return true;
  }

  const ownerId = getFileOwnerId(key);
  return ownerId === userId;
}

export function getFilePrefix(key: string): string {
  const parts = key.split("/");
  return parts[0] || "";
}

export async function storeReport(
  r2: R2Bucket,
  key: string,
  body: Blob | ReadableStream<Uint8Array> | ArrayBuffer | string,
  contentType: string
): Promise<string> {
  await r2.put(key, body, {
    httpMetadata: {
      contentType,
      contentDisposition: `attachment; filename="${key.split("/").pop()}"`,
    },
  });

  return key;
}