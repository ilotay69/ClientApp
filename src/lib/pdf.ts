import { deflateSync, inflateSync } from "zlib";

// Minimal, dependency-free PDF writer. Built by hand (same reason as
// src/lib/web-push.ts: package-lock.json is committed and Railway's `npm ci`
// fails hard on any lockfile mismatch, and there's no local npm here to
// regenerate it) — so this only implements exactly what quarterly reviews
// need: wrapped Helvetica text and embedded PNG/JPEG images, laid out over
// as many Letter-size pages as it takes.

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const MARGIN_BOTTOM = 54;

// Standard Helvetica / Helvetica-Bold AFM widths (1/1000 em), codes 32-126.
// Used only to wrap text at roughly the right column width — exact
// character-by-character fidelity doesn't matter for an internal report.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
];

function sanitizeText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xff]/g, "?");
}

function textWidth(text: string, fontSize: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const idx = text.charCodeAt(i) - 32;
    total += idx >= 0 && idx < table.length ? table[idx] : 556;
  }
  return (total / 1000) * fontSize;
}

function wrapLine(text: string, maxWidth: number, fontSize: number, bold: boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && textWidth(candidate, fontSize, bold) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const clean = sanitizeText(text);
  return clean.split("\n").flatMap((line) => wrapLine(line, maxWidth, fontSize, bold));
}

function escapePdfString(text: string): string {
  return sanitizeText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterPng(data: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let inOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = data[inOffset];
    inOffset += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[inOffset + x];
      const a = x >= channels ? out[rowStart + x - channels] : 0;
      const b = y > 0 ? out[rowStart - stride + x] : 0;
      const c = x >= channels && y > 0 ? out[rowStart - stride + x - channels] : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + a;
          break;
        case 2:
          value = raw + b;
          break;
        case 3:
          value = raw + ((a + b) >> 1);
          break;
        case 4:
          value = raw + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type ${filterType}`);
      }
      out[rowStart + x] = value & 0xff;
    }
    inOffset += stride;
  }
  return out;
}

type DecodedImage = {
  widthPx: number;
  heightPx: number;
  colorSpace: "DeviceRGB" | "DeviceGray";
  colorFilter: "FlateDecode" | "DCTDecode";
  colorBytes: Buffer;
  alphaBytes?: Buffer; // raw grayscale alpha, FlateDecode, only for PNG
};

function decodePng(buf: Buffer): DecodedImage | null {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || interlace !== 0) return null; // unsupported — caller falls back to a plain attachment
  if (![0, 2, 3, 4, 6].includes(colorType)) return null;
  if (colorType === 3 && !palette) return null;

  const channelsByType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];

  let raw: Buffer;
  try {
    raw = unfilterPng(inflateSync(Buffer.concat(idatChunks)), width, height, channels);
  } catch {
    return null;
  }

  let colorData: Buffer;
  let alphaData: Buffer | undefined;
  let colorSpace: "DeviceRGB" | "DeviceGray";

  if (colorType === 3) {
    const pal = palette as Buffer;
    colorData = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const idx = raw[i];
      colorData[i * 3] = pal[idx * 3] ?? 0;
      colorData[i * 3 + 1] = pal[idx * 3 + 1] ?? 0;
      colorData[i * 3 + 2] = pal[idx * 3 + 2] ?? 0;
    }
    colorSpace = "DeviceRGB";
  } else if (colorType === 0) {
    colorData = raw;
    colorSpace = "DeviceGray";
  } else if (colorType === 2) {
    colorData = raw;
    colorSpace = "DeviceRGB";
  } else {
    // 4 (gray+alpha) or 6 (rgb+alpha) — split the trailing alpha channel out
    const colorChannels = channels - 1;
    colorData = Buffer.alloc(width * height * colorChannels);
    alphaData = Buffer.alloc(width * height);
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < colorChannels; c++) {
        colorData[i * colorChannels + c] = raw[i * channels + c];
      }
      alphaData[i] = raw[i * channels + colorChannels];
    }
    colorSpace = colorType === 6 ? "DeviceRGB" : "DeviceGray";
  }

  return {
    widthPx: width,
    heightPx: height,
    colorSpace,
    colorFilter: "FlateDecode",
    colorBytes: deflateSync(colorData),
    alphaBytes: alphaData ? deflateSync(alphaData) : undefined,
  };
}

function decodeJpeg(buf: Buffer): DecodedImage | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break;
    const length = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      const components = buf[offset + 9];
      if (components !== 1 && components !== 3) return null; // CMYK etc — fall back
      return {
        widthPx: width,
        heightPx: height,
        colorSpace: components === 1 ? "DeviceGray" : "DeviceRGB",
        colorFilter: "DCTDecode",
        colorBytes: buf,
      };
    }
    offset += 2 + length;
  }
  return null;
}

function decodeImage(buf: Buffer): DecodedImage | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return decodePng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return decodeJpeg(buf);
  } catch {
    return null;
  }
  return null;
}

type Block =
  | { type: "heading"; text: string; level: 1 | 2 }
  | { type: "paragraph"; text: string }
  | { type: "item"; label: string; status: string; comments: string | null }
  | { type: "image"; buffer: Buffer; label: string | null; id: string }
  | { type: "spacer"; amount: number };

export class PdfContentBuilder {
  private blocks: Block[] = [];

  heading(text: string, level: 1 | 2 = 1) {
    this.blocks.push({ type: "heading", text, level });
    return this;
  }
  paragraph(text: string) {
    this.blocks.push({ type: "paragraph", text });
    return this;
  }
  item(label: string, status: string, comments: string | null) {
    this.blocks.push({ type: "item", label, status, comments });
    return this;
  }
  image(buffer: Buffer, label: string | null, id: string) {
    this.blocks.push({ type: "image", buffer, label, id });
    return this;
  }
  spacer(amount = 10) {
    this.blocks.push({ type: "spacer", amount });
    return this;
  }

  /** Renders every block into a PDF byte buffer. Returns which image ids
   * actually got embedded (unsupported formats like GIF/WEBP are skipped —
   * the caller should attach those separately so nothing is lost). */
  build(): { pdf: Buffer; embeddedImageIds: Set<string> } {
    const embeddedImageIds = new Set<string>();
    const chunks: Buffer[] = [];
    let length = 0;
    const offsets = new Map<number, number>();
    let nextId = 5; // 1 Catalog, 2 Pages, 3 Helvetica, 4 Helvetica-Bold

    const push = (buf: Buffer) => {
      chunks.push(buf);
      length += buf.length;
    };
    const writeObj = (id: number, dict: string, stream?: Buffer) => {
      offsets.set(id, length);
      push(Buffer.from(`${id} 0 obj\n${dict}\n`, "latin1"));
      if (stream) {
        push(Buffer.from("stream\n", "latin1"));
        push(stream);
        push(Buffer.from("\nendstream\n", "latin1"));
      }
      push(Buffer.from("endobj\n", "latin1"));
    };

    push(Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"));
    writeObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    writeObj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    const pageIds: number[] = [];
    let content = "";
    let cursorY = PAGE_HEIGHT - MARGIN;
    let pageImageRefs: { name: string; objId: number }[] = [];

    const drawText = (x: number, y: number, text: string, size: number, bold: boolean) => {
      const font = bold ? "/F2" : "/F1";
      content += `BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfString(text)}) Tj ET\n`;
    };

    const finishPage = () => {
      const contentBytes = Buffer.from(content, "latin1");
      const contentId = nextId++;
      writeObj(contentId, `<< /Length ${contentBytes.length} >>`, contentBytes);

      const fontDict = "/Font << /F1 3 0 R /F2 4 0 R >>";
      const xobjDict =
        pageImageRefs.length > 0
          ? ` /XObject << ${pageImageRefs.map((r) => `/${r.name} ${r.objId} 0 R`).join(" ")} >>`
          : "";
      const pageId = nextId++;
      writeObj(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << ${fontDict}${xobjDict} >> /Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
      content = "";
      pageImageRefs = [];
    };

    const newPage = () => {
      if (content.length > 0) finishPage();
      cursorY = PAGE_HEIGHT - MARGIN;
    };

    const ensureSpace = (needed: number) => {
      if (cursorY - needed < MARGIN_BOTTOM) newPage();
    };

    let imageObjSeq = 0;
    const embedImage = (decoded: DecodedImage): number => {
      let colorObjId = nextId++;
      let smaskRef = "";
      if (decoded.alphaBytes) {
        const smaskId = nextId++;
        writeObj(
          smaskId,
          `<< /Type /XObject /Subtype /Image /Width ${decoded.widthPx} /Height ${decoded.heightPx} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${decoded.alphaBytes.length} >>`,
          decoded.alphaBytes
        );
        smaskRef = ` /SMask ${smaskId} 0 R`;
      }
      writeObj(
        colorObjId,
        `<< /Type /XObject /Subtype /Image /Width ${decoded.widthPx} /Height ${decoded.heightPx} /ColorSpace /${decoded.colorSpace} /BitsPerComponent 8 /Filter /${decoded.colorFilter}${smaskRef} /Length ${decoded.colorBytes.length} >>`,
        decoded.colorBytes
      );
      return colorObjId;
    };

    for (const block of this.blocks) {
      if (block.type === "heading") {
        const size = block.level === 1 ? 18 : 13;
        ensureSpace(size * 1.6);
        cursorY -= size;
        drawText(MARGIN, cursorY, block.text, size, true);
        cursorY -= size * 0.6;
      } else if (block.type === "paragraph") {
        const lines = wrapText(block.text, USABLE_WIDTH, 10, false);
        for (const line of lines) {
          ensureSpace(12);
          cursorY -= 10;
          drawText(MARGIN, cursorY, line, 10, false);
          cursorY -= 2;
        }
        cursorY -= 6;
      } else if (block.type === "item") {
        ensureSpace(12);
        cursorY -= 10;
        drawText(MARGIN, cursorY, block.label, 10, false);
        drawText(MARGIN + 320, cursorY, block.status, 10, true);
        cursorY -= 2;
        if (block.comments) {
          const lines = wrapText(block.comments, USABLE_WIDTH - 20, 9, false);
          for (const line of lines) {
            ensureSpace(11);
            cursorY -= 9;
            drawText(MARGIN + 20, cursorY, line, 9, false);
            cursorY -= 2;
          }
        }
        cursorY -= 4;
      } else if (block.type === "spacer") {
        cursorY -= block.amount;
      } else {
        const decoded = decodeImage(block.buffer);
        if (!decoded) continue; // unsupported format — caller attaches it separately
        const maxW = USABLE_WIDTH;
        const maxH = 380;
        const scale = Math.min(maxW / decoded.widthPx, maxH / decoded.heightPx);
        const w = decoded.widthPx * scale;
        const h = decoded.heightPx * scale;
        const neededLabel = block.label ? 14 : 0;
        ensureSpace(h + neededLabel + 10);
        if (block.label) {
          cursorY -= 10;
          drawText(MARGIN, cursorY, block.label, 9, true);
          cursorY -= 4;
        }
        const objId = embedImage(decoded);
        const name = `Im${++imageObjSeq}`;
        pageImageRefs.push({ name, objId });
        cursorY -= h;
        content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${MARGIN.toFixed(2)} ${cursorY.toFixed(2)} cm /${name} Do Q\n`;
        cursorY -= 10;
        embeddedImageIds.add(block.id);
      }
    }
    finishPage();

    writeObj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    writeObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);

    const maxId = nextId - 1;
    const xrefOffset = length;
    let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= maxId; id++) {
      const off = offsets.get(id) ?? 0;
      xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
    }
    push(Buffer.from(xref, "latin1"));
    push(
      Buffer.from(
        `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
        "latin1"
      )
    );

    return { pdf: Buffer.concat(chunks), embeddedImageIds };
  }
}
