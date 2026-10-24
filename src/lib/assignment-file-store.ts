import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
export interface AssignmentFileStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export function assignmentFileStore(): AssignmentFileStore {
  if (process.env.QMS_UPLOAD_DRIVER === "file") {
    if (process.env.NODE_ENV === "production")
      throw Error("Local upload storage is disabled in production.");
    const pathFor = async (key: string) => {
      if (!/^assignment-files\/[0-9a-f-]{36}$/.test(key))
        throw Error("Invalid storage key.");
      const { resolve } = await import("node:path");
      return resolve(".local-assignment-files", key);
    };
    return {
      async put(key, bytes) {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const path = await pathFor(key);
        await mkdir((await import("node:path")).dirname(path), {
          recursive: true,
          mode: 0o700,
        });
        await writeFile(path, bytes, { mode: 0o600 });
      },
      async get(key) {
        return (await import("node:fs/promises")).readFile(await pathFor(key));
      },
      async remove(key) {
        await (
          await import("node:fs/promises")
        ).rm(await pathFor(key), { force: true });
      },
    };
  }
  const endpoint = process.env.QMS_UPLOAD_S3_ENDPOINT;
  const bucket = process.env.QMS_UPLOAD_BUCKET;
  const accessKeyId = process.env.QMS_UPLOAD_S3_ACCESS_KEY;
  const secretAccessKey = process.env.QMS_UPLOAD_S3_SECRET_KEY;
  const region = process.env.QMS_UPLOAD_S3_REGION;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !region)
    throw Error("Private assignment storage is not configured.");
  if (new URL(endpoint).protocol !== "https:")
    throw Error("Storage must use HTTPS.");
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
  });
  return {
    async put(key, bytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "application/octet-stream",
          CacheControl: "private, no-store",
          ContentDisposition: "attachment",
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
    },
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      if (!result.Body) throw Error("File unavailable.");
      return result.Body.transformToByteArray();
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(15000),
      });
    },
  };
}
