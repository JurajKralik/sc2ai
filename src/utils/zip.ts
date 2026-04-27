import zlib from "zlib";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const DEFLATE_COMPRESSION = 8;

export function decodeZipEntries(buffer: Buffer): Record<string, string> {
  const entries: Record<string, string> = {};
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== LOCAL_FILE_HEADER_SIGNATURE) break;

    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = buffer.slice(fileNameStart, fileNameEnd).toString("utf8");

    const dataStart = fileNameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const fileData = buffer.slice(dataStart, dataEnd);

    if (!fileName.endsWith("/")) {
      const content =
        compression === DEFLATE_COMPRESSION
          ? zlib.inflateRawSync(fileData)
          : fileData;
      entries[fileName] = content.toString("utf8");
    }

    offset = dataEnd;
  }

  return entries;
}
