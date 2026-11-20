const textDecoder = new TextDecoder("utf-8");

function readUInt32(bytes, offset, littleEndian) {
    if (offset + 4 > bytes.length) return null;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        .getUint32(offset, littleEndian);
}

function decodeText(bytes, start, length) {
    return textDecoder.decode(bytes.subarray(start, start + length));
}

export async function readFlacMetadata(file) {
    if (!file.name?.toLowerCase().endsWith(".flac")) return null;

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (decodeText(bytes, 0, 4) !== "fLaC") return null;

    const metadata = { picture: null };
    let offset = 4;

    while (offset + 4 <= bytes.length) {
        const header = bytes[offset];
        const blockType = header & 0x7f;
        const isLastBlock = (header & 0x80) !== 0;
        const blockLength = (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3];
        const start = offset + 4;
        const end = start + blockLength;

        if (end > bytes.length) break;

        if (blockType === 4) {
            readVorbisComments(bytes, start, end, metadata);
        } else if (blockType === 6) {
            metadata.picture = readPicture(bytes, start, end);
        }

        offset = end;
        if (isLastBlock) break;
    }

    return metadata;
}

function readVorbisComments(bytes, start, end, metadata) {
    let offset = start;
    const vendorLength = readUInt32(bytes, offset, true);
    if (vendorLength === null) return;
    offset += 4 + vendorLength;

    const commentCount = readUInt32(bytes, offset, true);
    if (commentCount === null) return;
    offset += 4;

    const recognized = {
        TITLE: "title",
        ARTIST: "artist",
        ALBUM: "album",
        DATE: "year",
        YEAR: "year",
        GENRE: "genre",
        TRACKNUMBER: "track"
    };

    for (let index = 0; index < commentCount && offset + 4 <= end; index += 1) {
        const length = readUInt32(bytes, offset, true);
        if (length === null) return;
        offset += 4;
        if (offset + length > end) return;

        const comment = decodeText(bytes, offset, length);
        const separator = comment.indexOf("=");
        if (separator > 0) {
            const key = comment.slice(0, separator).toUpperCase();
            const field = recognized[key];
            if (field && !metadata[field]) {
                metadata[field] = comment.slice(separator + 1).trim();
            }
        }
        offset += length;
    }
}

function readPicture(bytes, start, end) {
    let offset = start;
    const pictureType = readUInt32(bytes, offset, false);
    if (pictureType === null) return null;
    offset += 4;

    const mimeLength = readUInt32(bytes, offset, false);
    if (mimeLength === null) return null;
    offset += 4;
    const mimeType = decodeText(bytes, offset, mimeLength);
    offset += mimeLength;

    const descriptionLength = readUInt32(bytes, offset, false);
    if (descriptionLength === null) return null;
    offset += 4 + descriptionLength;

    // Skip width, height, color depth, and palette size.
    offset += 16;
    const imageLength = readUInt32(bytes, offset, false);
    if (imageLength === null) return null;
    offset += 4;

    if (offset + imageLength > end) return null;

    return {
        format: mimeType || "image/jpeg",
        type: pictureType === 3 ? "Cover (front)" : "Embedded picture",
        data: bytes.slice(offset, offset + imageLength)
    };
}
