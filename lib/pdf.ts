const CHUNK_SIZE = 512;      // tokens (approx chars / 4)
const CHUNK_OVERLAP = 64;    // overlap between chunks

export interface Chunk {
  text: string;
  chunkIndex: number;
  pageNumber: number;
  charStart: number;
  charEnd: number;
}

/**
 * Split text into overlapping chunks, preserving sentence boundaries
 */
export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const chunkChars = CHUNK_SIZE * 4;
  const overlapChars = CHUNK_OVERLAP * 4;

  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkChars, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('.', end);
      const newlineEnd = text.lastIndexOf('\n', end);
      const breakAt = Math.max(sentenceEnd, newlineEnd);
      if (breakAt > start + chunkChars / 2) {
        end = breakAt + 1;
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 50) {
      // skip tiny chunks
      chunks.push({
        text: chunkText,
        chunkIndex,
        pageNumber: estimatePage(start, text),
        charStart: start,
        charEnd: end,
      });
      chunkIndex++;
    }

    start = end - overlapChars;
    if (start <= 0) break;
  }

  return chunks;
}

/** Rough page estimation based on character position */
function estimatePage(charPos: number, fullText: string): number {
  const charsPerPage = 3000;
  return Math.floor(charPos / charsPerPage) + 1;
}

/**
 * Extract text from a PDF Buffer using pdf-parse
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    pageCount: data.numpages,
  };
}
