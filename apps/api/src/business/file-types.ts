import { BadRequestException } from "@nestjs/common";

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "txt",
  "csv",
  "zip",
];
export function fileType(head: Buffer, filename: string): string {
  const ext = filename.split(".").at(-1)?.toLowerCase();
  if (ext === "pdf" && head.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (["jpg", "jpeg"].includes(ext ?? "") && head[0] === 255 && head[1] === 216 && head[2] === 255)
    return "image/jpeg";
  if (ext === "png" && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (
    ext === "webp" &&
    head.subarray(0, 4).toString() === "RIFF" &&
    head.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (ext === "txt" || ext === "csv") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(head);
      if (head.some((byte) => byte < 32 && ![9, 10, 13].includes(byte))) throw Error();
    } catch {
      throw new BadRequestException();
    }
    return ext === "txt" ? "text/plain" : "text/csv";
  }
  if (["docx", "xlsx", "pptx", "zip"].includes(ext ?? "")) {
    const names = zipEntries(head);
    if (ext === "zip") return "application/zip";
    const main = {
      docx: "word/document.xml",
      xlsx: "xl/workbook.xml",
      pptx: "ppt/presentation.xml",
    }[ext!];
    if (
      !main ||
      !names.has("[Content_Types].xml") ||
      !names.has(main) ||
      [...names].some((n) => /vbaProject\.bin$/i.test(n))
    )
      throw new BadRequestException();
    return `application/vnd.openxmlformats-officedocument.${ext === "docx" ? "wordprocessingml.document" : ext === "xlsx" ? "spreadsheetml.sheet" : "presentationml.presentation"}`;
  }
  throw new BadRequestException();
}

// Validate the directory without extracting untrusted archives. ZIP64, encryption,
// traversal, oversized expansion and ambiguous local headers are rejected.
export function zipEntries(data: Buffer): Set<string> {
  const bad = () => {
    throw new BadRequestException();
  };
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) return bad();
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--)
    if (data.readUInt32LE(p) === 0x06054b50 && p + 22 + data.readUInt16LE(p + 20) === data.length) {
      end = p;
      break;
    }
  if (end < 0) return bad();
  const count = data.readUInt16LE(end + 10),
    size = data.readUInt32LE(end + 12),
    offset = data.readUInt32LE(end + 16);
  if (
    !count ||
    count > 2000 ||
    offset + size !== end ||
    data.readUInt16LE(end + 4) ||
    data.readUInt16LE(end + 6) ||
    data.readUInt16LE(end + 8) !== count
  )
    return bad();
  const names = new Set<string>();
  let p = offset,
    expanded = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || data.readUInt32LE(p) !== 0x02014b50) return bad();
    const flags = data.readUInt16LE(p + 8),
      method = data.readUInt16LE(p + 10),
      compressed = data.readUInt32LE(p + 20),
      uncompressed = data.readUInt32LE(p + 24);
    const length = data.readUInt16LE(p + 28),
      extra = data.readUInt16LE(p + 30),
      comment = data.readUInt16LE(p + 32),
      local = data.readUInt32LE(p + 42);
    if (
      p + 46 + length + extra + comment > end ||
      flags & 1 ||
      flags & 64 ||
      ![0, 8].includes(method) ||
      data.readUInt16LE(p + 34)
    )
      return bad();
    const name = data.subarray(p + 46, p + 46 + length).toString("utf8");
    expanded += uncompressed;
    if (
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.startsWith("/") ||
      name.split("/").some((v) => v === "..") ||
      names.has(name) ||
      expanded > 200 * 1024 * 1024 ||
      uncompressed > Math.max(1024 * 1024, compressed * 200)
    )
      return bad();
    if (
      local + 30 > offset ||
      data.readUInt32LE(local) !== 0x04034b50 ||
      data.readUInt16LE(local + 6) !== flags ||
      data.readUInt16LE(local + 8) !== method
    )
      return bad();
    const localNameLength = data.readUInt16LE(local + 26),
      localExtra = data.readUInt16LE(local + 28);
    if (
      localNameLength !== length ||
      local + 30 + localNameLength + localExtra + compressed > offset ||
      !data
        .subarray(local + 30, local + 30 + localNameLength)
        .equals(data.subarray(p + 46, p + 46 + length))
    )
      return bad();
    names.add(name);
    p += 46 + length + extra + comment;
  }
  if (p !== end) return bad();
  return names;
}
