export const MAX_ASSIGNMENT_FILE = 3 * 1024 * 1024;
export const MAX_SUBMISSION_FILES = 5;
export const MAX_SUBMISSION_BYTES = 9 * 1024 * 1024;
export type AssignmentFileInfo = {
  id: string;
  name: string;
  size: number;
  extension: string;
};
export function fileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
export function fileExtension(name: string) {
  return name.split(".").at(-1)?.toLowerCase() ?? "";
}
export function validFileName(name: string) {
  return (
    name.length > 0 &&
    name.length <= 160 &&
    !/[\x00-\x1f\x7f/\\]/.test(name) &&
    ["zip", "pdf", "png", "jpg", "jpeg", "webp"].includes(fileExtension(name))
  );
}
export function validFileSignature(name: string, bytes: Uint8Array) {
  const begins = (...expected: number[]) =>
    expected.every((value, i) => bytes[i] === value);
  switch (fileExtension(name)) {
    case "zip":
      return begins(0x50, 0x4b, 0x03, 0x04) || begins(0x50, 0x4b, 0x05, 0x06);
    case "pdf":
      return begins(0x25, 0x50, 0x44, 0x46, 0x2d);
    case "png":
      return begins(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "jpg":
    case "jpeg":
      return begins(0xff, 0xd8, 0xff);
    case "webp":
      return (
        begins(0x52, 0x49, 0x46, 0x46) &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    default:
      return false;
  }
}
