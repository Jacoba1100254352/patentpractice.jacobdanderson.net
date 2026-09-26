import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import yauzl from "yauzl";

import {
  APPROVED_PUBLIC_URL_HOSTS,
  approvedHttpsUrl,
} from "../src/security/publicUrlPolicy.js";

const standardFontDataUrl = `${fileURLToPath(new URL(
  "../node_modules/pdfjs-dist/standard_fonts/",
  import.meta.url,
))}${path.sep}`;

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 22 + 65_535;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UNIX_PLATFORM = 3;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_DIRECTORY = 0o040000;
const UNIX_REGULAR_FILE = 0o100000;
const ZIP_DIRECTORY_ATTRIBUTE = 0x10;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const forbiddenContentPatterns = [
  [/\/Users\/[A-Za-z0-9._~/-]+/u, "absolute macOS path"],
  [/(?:^|[^A-Za-z0-9_])\/home\/[A-Za-z0-9._~/-]+/u, "absolute Linux home path"],
  [/[A-Za-z]:\\Users\\[^\s"'`<>]+/u, "absolute Windows user path"],
  [/(?:Confidential|\.ai-work|ops\/challenge-candidates)\//iu, "private workspace path"],
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u, "private-key material"],
  [/\b(?:attorney[- ]client privileged|privileged and confidential|do not distribute)\b/iu, "privileged-matter wording"],
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function scanSensitiveText(contents, label) {
  for (const [pattern, description] of forbiddenContentPatterns) {
    if (pattern.test(contents)) throw new Error(`${label} contains ${description}`);
  }
}

function findEocd(archive, label) {
  for (
    let offset = archive.length - 22;
    offset >= Math.max(0, archive.length - MAX_EOCD_SEARCH);
    offset -= 1
  ) {
    if (archive.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength !== archive.length) continue;
    const disk = archive.readUInt16LE(offset + 4);
    const centralDisk = archive.readUInt16LE(offset + 6);
    const diskEntries = archive.readUInt16LE(offset + 8);
    const entries = archive.readUInt16LE(offset + 10);
    const centralSize = archive.readUInt32LE(offset + 12);
    const centralOffset = archive.readUInt32LE(offset + 16);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries) {
      throw new Error(`${label} must be a single-disk ZIP archive`);
    }
    if (
      entries === ZIP64_SENTINEL_16
      || centralSize === ZIP64_SENTINEL_32
      || centralOffset === ZIP64_SENTINEL_32
    ) {
      throw new Error(`${label} must not use ZIP64 records`);
    }
    if (centralOffset + centralSize !== offset) {
      throw new Error(`${label} has inconsistent central-directory bounds`);
    }
    return { centralOffset, centralSize, entries };
  }
  throw new Error(`${label} is not a supported ZIP archive`);
}

function extraFieldIds(buffer, label) {
  const ids = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) throw new Error(`${label} has a truncated ZIP extra field`);
    const id = buffer.readUInt16LE(offset);
    const size = buffer.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > buffer.length) throw new Error(`${label} has a truncated ZIP extra value`);
    ids.push(id);
    offset += size;
  }
  return ids;
}

function validateEntryPath(name, label) {
  const normalized = name.normalize("NFC");
  const segments = name.split("/");
  if (
    !name
    || normalized !== name
    || /[\\\u0000-\u001f\u007f]/u.test(name)
    || name.startsWith("/")
    || /^[A-Za-z]:/u.test(name)
    || segments.some((segment, index) => (
      segment === "."
      || segment === ".."
      || (segment === "" && index !== segments.length - 1)
    ))
  ) {
    throw new Error(`${label} contains an unsafe ZIP entry: ${name || "<empty>"}`);
  }
  return normalized;
}

function entryType(entry, name, label) {
  const nameSaysDirectory = name.endsWith("/");
  const platform = entry.versionMadeBy >>> 8;
  if (platform === UNIX_PLATFORM) {
    const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
    const type = mode & UNIX_FILE_TYPE_MASK;
    if (type !== 0 && type !== UNIX_DIRECTORY && type !== UNIX_REGULAR_FILE) {
      throw new Error(`${label} entry ${name} is not a regular file or directory`);
    }
    if (type === UNIX_DIRECTORY && !nameSaysDirectory) {
      throw new Error(`${label} entry ${name} has conflicting directory metadata`);
    }
    if (type === UNIX_REGULAR_FILE && nameSaysDirectory) {
      throw new Error(`${label} entry ${name} has conflicting regular-file metadata`);
    }
  }
  const attributesSayDirectory = (entry.externalFileAttributes & ZIP_DIRECTORY_ATTRIBUTE) !== 0;
  if (attributesSayDirectory && !nameSaysDirectory) {
    throw new Error(`${label} entry ${name} has conflicting DOS directory metadata`);
  }
  return nameSaysDirectory ? "directory" : "file";
}

async function streamToBuffer(stream, maximumBytes, label) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maximumBytes) throw new Error(`${label} exceeds the decompressed-size limit`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

export async function inspectZipBuffer(
  archive,
  {
    label = "archive",
    maxEntries = 500,
    maxEntryBytes = 10 * 1024 * 1024,
    maxTotalBytes = 50 * 1024 * 1024,
    maxCompressionRatio = 200,
  } = {},
) {
  if (!Buffer.isBuffer(archive)) throw new TypeError(`${label} must be provided as a Buffer`);
  const eocd = findEocd(archive, label);
  if (eocd.entries > maxEntries) throw new Error(`${label} contains too many entries`);

  const zipfile = await yauzl.fromBufferPromise(archive, {
    autoClose: false,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const entries = [];
  const canonicalNames = new Set();
  const localOffsets = new Set();
  const ranges = [];
  let totalBytes = 0;

  try {
    for await (const entry of zipfile.eachEntry()) {
      if ((entry.generalPurposeBitFlag & ENCRYPTED_FLAG) !== 0) {
        throw new Error(`${label} contains an encrypted entry`);
      }
      if ((entry.generalPurposeBitFlag & DATA_DESCRIPTOR_FLAG) !== 0) {
        throw new Error(`${label} contains an entry with an unsupported data descriptor`);
      }
      if (![0, 8].includes(entry.compressionMethod)) {
        throw new Error(`${label} entry ${entry.fileName} uses an unsupported compression method`);
      }
      if (entry.compressedSize === ZIP64_SENTINEL_32 || entry.uncompressedSize === ZIP64_SENTINEL_32) {
        throw new Error(`${label} contains a ZIP64 entry`);
      }
      if (entry.uncompressedSize > maxEntryBytes) {
        throw new Error(`${label} entry ${entry.fileName} exceeds the size limit`);
      }
      if (
        entry.compressedSize > 0
        && entry.uncompressedSize / entry.compressedSize > maxCompressionRatio
      ) {
        throw new Error(`${label} entry ${entry.fileName} exceeds the compression-ratio limit`);
      }

      const name = validateEntryPath(entry.fileName, label);
      const canonicalName = name.replace(/\/$/u, "").toLocaleLowerCase("en-US");
      if (canonicalNames.has(canonicalName)) {
        throw new Error(`${label} contains duplicate or case-colliding entry ${name}`);
      }
      canonicalNames.add(canonicalName);
      if (localOffsets.has(entry.relativeOffsetOfLocalHeader)) {
        throw new Error(`${label} contains duplicate local-header offsets`);
      }
      localOffsets.add(entry.relativeOffsetOfLocalHeader);

      const unsupportedCentralExtra = entry.extraFields.find(({ id }) => [0x0001, 0x7075].includes(id));
      if (unsupportedCentralExtra) {
        throw new Error(`${label} entry ${name} uses an unsupported path or ZIP64 extra field`);
      }
      const local = await zipfile.readLocalFileHeaderPromise(entry);
      const unsupportedLocalExtra = extraFieldIds(local.extraField, `${label} entry ${name}`)
        .find((id) => [0x0001, 0x7075].includes(id));
      if (unsupportedLocalExtra) {
        throw new Error(`${label} entry ${name} uses an unsupported local path or ZIP64 extra field`);
      }
      if (!entry.fileNameRaw.equals(local.fileName)) {
        throw new Error(`${label} entry ${name} has different local and central names`);
      }
      for (const [field, central, localValue] of [
        ["flags", entry.generalPurposeBitFlag, local.generalPurposeBitFlag],
        ["compression method", entry.compressionMethod, local.compressionMethod],
        ["CRC", entry.crc32, local.crc32],
        ["compressed size", entry.compressedSize, local.compressedSize],
        ["uncompressed size", entry.uncompressedSize, local.uncompressedSize],
      ]) {
        if (central !== localValue) {
          throw new Error(`${label} entry ${name} has conflicting local and central ${field}`);
        }
      }
      if (
        entry.relativeOffsetOfLocalHeader < 0
        || entry.relativeOffsetOfLocalHeader + 30 > archive.length
        || archive.readUInt32LE(entry.relativeOffsetOfLocalHeader) !== LOCAL_HEADER_SIGNATURE
      ) {
        throw new Error(`${label} entry ${name} has an invalid local-header offset`);
      }

      const type = entryType(entry, name, label);
      const end = local.fileDataStart + entry.compressedSize;
      if (end > eocd.centralOffset) {
        throw new Error(`${label} entry ${name} overlaps the central directory`);
      }
      ranges.push({ end, name, start: entry.relativeOffsetOfLocalHeader });

      let contents = Buffer.alloc(0);
      if (type === "file") {
        const stream = await zipfile.openReadStreamPromise(entry);
        contents = await streamToBuffer(stream, maxEntryBytes, `${label} entry ${name}`);
        if (contents.length !== entry.uncompressedSize) {
          throw new Error(`${label} entry ${name} has an unexpected decompressed size`);
        }
        if (crc32(contents) !== entry.crc32) {
          throw new Error(`${label} entry ${name} failed its CRC check`);
        }
        totalBytes += contents.length;
        if (totalBytes > maxTotalBytes) throw new Error(`${label} exceeds the total size limit`);
      }

      entries.push(Object.freeze({
        compressedSize: entry.compressedSize,
        contents,
        path: name,
        sha256: type === "file" ? sha256(contents) : null,
        size: entry.uncompressedSize,
        type,
      }));
    }
  } finally {
    zipfile.close();
  }

  if (entries.length !== eocd.entries) {
    throw new Error(`${label} entry count does not match the end record`);
  }
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new Error(`${label} entries ${ranges[index - 1].name} and ${ranges[index].name} overlap`);
    }
  }
  return Object.freeze(entries);
}

function textContents(entry, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(entry.contents);
  } catch {
    throw new Error(`${label} is not valid UTF-8 text`);
  }
}

function decodeXmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function xmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"));
  return match ? decodeXmlAttribute(match[2]) : null;
}

function assertSafeRelationships(xml, label) {
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/giu)) {
    const tag = match[0];
    if (xmlAttribute(tag, "TargetMode") !== "External") continue;
    const target = xmlAttribute(tag, "Target");
    try {
      approvedHttpsUrl(target, {
        approvedHosts: APPROVED_PUBLIC_URL_HOSTS.practiceLibrary,
        label: `${label} external relationship`,
      });
    } catch (error) {
      throw new Error(error.message);
    }
  }
}

function assertBlankPersonalMetadata(xml, label) {
  for (const element of ["dc:creator", "cp:lastModifiedBy"]) {
    const match = xml.match(new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)<\\/${element}>`, "iu"));
    if (match && match[1].replace(/<[^>]+>/gu, "").trim()) {
      throw new Error(`${label} contains personal ${element} metadata`);
    }
  }
}

export async function inspectOoxml(contents, { label, extension }) {
  const entries = await inspectZipBuffer(contents, {
    label,
    maxEntries: 500,
    maxEntryBytes: 8 * 1024 * 1024,
    maxTotalBytes: 30 * 1024 * 1024,
    maxCompressionRatio: 150,
  });
  const files = new Map(entries.filter((entry) => entry.type === "file").map((entry) => [entry.path, entry]));
  for (const required of ["[Content_Types].xml", "_rels/.rels"]) {
    if (!files.has(required)) throw new Error(`${label} is missing ${required}`);
  }
  for (const entry of files.values()) {
    if (/(?:^|\/)(?:activeX|embeddings|externalLinks|macrosheets|customUI)(?:\/|$)|(?:vbaProject|oleObject)\.bin$|\.(?:exe|js|vbs)$/iu.test(entry.path)) {
      throw new Error(`${label} contains active or embedded content at ${entry.path}`);
    }
    if (!/\.(?:rels|xml|txt)$/iu.test(entry.path) && entry.path !== "[Content_Types].xml") continue;
    const xml = textContents(entry, `${label}:${entry.path}`);
    if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
      throw new Error(`${label}:${entry.path} contains a prohibited XML declaration`);
    }
    scanSensitiveText(xml, `${label}:${entry.path}`);
    if (entry.path.endsWith(".rels")) assertSafeRelationships(xml, `${label}:${entry.path}`);
    if (entry.path === "docProps/core.xml") assertBlankPersonalMetadata(xml, `${label}:${entry.path}`);
  }

  const contentTypes = textContents(files.get("[Content_Types].xml"), `${label}:[Content_Types].xml`);
  if (/macroEnabled|application\/vnd\.ms-office\.activeX|oleObject/iu.test(contentTypes)) {
    throw new Error(`${label} declares active or embedded content types`);
  }
  const expectedMainType = extension === ".docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
  if (!contentTypes.includes(expectedMainType)) {
    throw new Error(`${label} content type does not match ${extension}`);
  }

  return entries;
}

export async function inspectPdf(contents, { label }) {
  if (!contents.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`${label} is not a PDF document`);
  }
  const task = getDocument({
    data: new Uint8Array(contents),
    disableWorker: true,
    isEvalSupported: false,
    standardFontDataUrl,
    stopAtErrors: true,
    useSystemFonts: false,
  });
  try {
    const document = await task.promise;
    if (document.numPages < 1 || document.numPages > 100) {
      throw new Error(`${label} has an unsupported page count`);
    }
    const metadata = await document.getMetadata();
    if (metadata.info?.EncryptFilterName) throw new Error(`${label} must not be encrypted`);
    scanSensitiveText(JSON.stringify(metadata.info ?? {}), `${label} metadata`);
    const rawMetadata = metadata.metadata?.getRaw?.();
    if (rawMetadata) scanSensitiveText(rawMetadata, `${label} XMP metadata`);
    if (await document.hasJSActions() || await document.getJSActions()) {
      throw new Error(`${label} contains JavaScript actions`);
    }
    if (await document.getOpenAction()) throw new Error(`${label} contains an open action`);
    if (await document.getAttachments()) throw new Error(`${label} contains embedded files`);

    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      if (await page.getJSActions()) throw new Error(`${label} page ${pageNumber} contains JavaScript`);
      for (const annotation of await page.getAnnotations()) {
        if (
          annotation.file
          || annotation.attachment
          || /(?:FileAttachment|RichMedia|Movie|Screen|Sound|3D)/iu.test(annotation.subtype ?? "")
        ) {
          throw new Error(`${label} page ${pageNumber} contains active or embedded annotation content`);
        }
        const target = annotation.url ?? annotation.unsafeUrl;
        if (target) {
          approvedHttpsUrl(target, {
            approvedHosts: APPROVED_PUBLIC_URL_HOSTS.practiceLibrary,
            label: `${label} page ${pageNumber} link`,
          });
        }
      }
      const text = (await page.getTextContent()).items
        .map((item) => typeof item.str === "string" ? item.str : "")
        .join(" ");
      extractedCharacters += text.length;
      if (extractedCharacters > 2_000_000) throw new Error(`${label} contains too much extracted text`);
      scanSensitiveText(text, `${label} page ${pageNumber}`);
    }
  } catch (error) {
    throw new Error(`${label} failed PDF safety inspection: ${error.message}`);
  } finally {
    await task.destroy();
  }
}

export function archiveInventory(entries) {
  return entries.map((entry) => ({
    path: entry.path,
    type: entry.type,
    size: entry.size,
    ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
  }));
}

export async function inspectPracticeLibrary(archive, { label = "practice library" } = {}) {
  const entries = await inspectZipBuffer(archive, {
    label,
    maxEntries: 100,
    maxEntryBytes: 12 * 1024 * 1024,
    maxTotalBytes: 40 * 1024 * 1024,
    maxCompressionRatio: 150,
  });
  for (const entry of entries) {
    if (entry.type === "directory") continue;
    const extension = entry.path.match(/\.[^.\/]+$/u)?.[0]?.toLowerCase();
    if (![".docx", ".md", ".pdf", ".xlsx"].includes(extension)) {
      throw new Error(`${label} contains an unapproved file type at ${entry.path}`);
    }
    if (extension === ".docx" || extension === ".xlsx") {
      await inspectOoxml(entry.contents, { extension, label: `${label}:${entry.path}` });
    } else if (extension === ".pdf") {
      await inspectPdf(entry.contents, { label: `${label}:${entry.path}` });
    } else {
      scanSensitiveText(textContents(entry, `${label}:${entry.path}`), `${label}:${entry.path}`);
    }
  }
  return {
    entries,
    inventory: archiveInventory(entries),
    sha256: sha256(archive),
  };
}
