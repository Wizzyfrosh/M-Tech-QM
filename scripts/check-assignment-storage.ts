// Explicit, one-shot deployment preflight. Uses synthetic bytes, never student records.
if (process.env.QMS_VERIFY_UPLOAD_STORAGE === "1") {
  const { assignmentFileStore } =
    await import("../src/lib/assignment-file-store");
  const store = assignmentFileStore();
  const key = `storage-check/${crypto.randomUUID()}`;
  let written = false;
  try {
    const bytes = new TextEncoder().encode(
      "Synthetic M Tech private storage preflight",
    );
    written = true;
    await store.put(key, bytes);
    const read = await store.get(key);
    if (Buffer.compare(Buffer.from(bytes), Buffer.from(read)))
      throw Error("mismatch");
    const response = await fetch(
      `${process.env.QMS_UPLOAD_S3_ENDPOINT}/${process.env.QMS_UPLOAD_BUCKET}/${key}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (![403, 404].includes(response.status)) throw Error("public");
    await store.remove(key);
    written = false;
    console.log("QMS_PRIVATE_STORAGE_VERIFIED");
  } catch {
    console.error("QMS_PRIVATE_STORAGE_CHECK_FAILED");
    process.exitCode = 1;
  } finally {
    if (written)
      try {
        await store.remove(key);
      } catch {
        console.error("QMS_STORAGE_CHECK_CLEANUP_FAILED");
      }
  }
}
export {};
