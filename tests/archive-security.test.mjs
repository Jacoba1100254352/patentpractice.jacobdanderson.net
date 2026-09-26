import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectOoxml,
  inspectPdf,
  inspectPracticeLibrary,
  inspectZipBuffer,
} from "../scripts/archive-security.mjs";

const archivePath = new URL(
  "../public/downloads/patent-drafting-practice-library-expanded.zip",
  import.meta.url,
);

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function buildStoredZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of files) {
    const nameBuffer = Buffer.from(name);
    const contents = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const checksum = crc32(contents);
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    locals.push(local, contents);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(contents.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centrals.push(central);
    offset += local.length + contents.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function firstCentralOffset(archive) {
  const eocd = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  return archive.readUInt32LE(eocd + 16);
}

function minimalOoxml(extraFiles = [], relationships = "") {
  return buildStoredZip([
    [
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0"?><Relationships>${relationships}</Relationships>`,
    ],
    ["word/document.xml", "<?xml version=\"1.0\"?><document>Approved fixture</document>"],
    ...extraFiles,
  ]);
}

function javascriptPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
    "<< /S /JavaScript /JS (app.alert\\(1\\)) >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

test("deeply inspects the current reviewed practice library", async () => {
  const result = await inspectPracticeLibrary(await readFile(archivePath));
  assert.equal(result.inventory.length, 21);
  assert.equal(result.sha256, "1866160df86ed088decc8da7c6ca12170377b90eb4f2b1cd7b4d16897bb9cbb0");
});

test("rejects conflicting local and central ZIP names", async () => {
  const archive = Buffer.from(await readFile(archivePath));
  archive[30] ^= 1;
  await assert.rejects(inspectZipBuffer(archive), /different local and central names/iu);
});

test("rejects symlink entry semantics", async () => {
  const archive = Buffer.from(await readFile(archivePath));
  const central = firstCentralOffset(archive);
  archive.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
  await assert.rejects(inspectZipBuffer(archive), /not a regular file or directory/iu);
});

test("rejects empty ZIP path segments and file-directory extraction collisions", async () => {
  await assert.rejects(
    inspectZipBuffer(buildStoredZip([
      ["docs/a.md", "first"],
      ["docs//a.md", "second"],
    ])),
    /unsafe ZIP entry/iu,
  );
  await assert.rejects(
    inspectZipBuffer(buildStoredZip([
      ["docs/a.md", "file"],
      ["docs/a.md/", ""],
    ])),
    /duplicate or case-colliding entry/iu,
  );
});

test("rejects active OOXML payloads and unapproved external relationships", async () => {
  await assert.rejects(
    inspectOoxml(minimalOoxml([["word/vbaProject.bin", "macro"]]), {
      extension: ".docx",
      label: "fixture.docx",
    }),
    /active or embedded content/iu,
  );
  await assert.rejects(
    inspectOoxml(minimalOoxml([], '<Relationship TargetMode="External" Target="https://evil.example/payload"/>'), {
      extension: ".docx",
      label: "fixture.docx",
    }),
    /unapproved hostname/iu,
  );
});

test("rejects PDF JavaScript and open actions", async () => {
  await assert.rejects(
    inspectPdf(javascriptPdf(), { label: "fixture.pdf" }),
    /JavaScript|open action/iu,
  );
});
