import { writeFile, unlink } from 'fs/promises';
import { spawn } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;

export interface Chunk {
  text: string;
  chunkIndex: number;
  pageNumber: number;
  charStart: number;
  charEnd: number;
}

export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const chunkChars = CHUNK_SIZE * 4;
  const overlapChars = CHUNK_OVERLAP * 4;
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkChars, text.length);
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('.', end);
      const newlineEnd = text.lastIndexOf('\n', end);
      const breakAt = Math.max(sentenceEnd, newlineEnd);
      if (breakAt > start + chunkChars / 2) end = breakAt + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push({
        text: chunk,
        chunkIndex,
        pageNumber: Math.floor(start / 3000) + 1,
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

export async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  const tmpFile = join(tmpdir(), `pdf-${randomUUID()}.pdf`);
  const scriptFile = join(tmpdir(), `extract-${randomUUID()}.js`);

  // Write script to a file so argv[2] works correctly in Node 24
  const script = `
const PDFParser = require(${JSON.stringify(require.resolve('pdf2json'))});
const filePath = process.argv[2];
const parser = new PDFParser(null, 1);
parser.on('pdfParser_dataError', (err) => {
  process.stdout.write(JSON.stringify({ error: String(err.parserError) }));
  process.exit(1);
});
parser.on('pdfParser_dataReady', () => {
  const raw = parser.getRawTextContent();
  const pages = raw.split('\\f').filter(p => p.trim().length > 0);
  process.stdout.write(JSON.stringify({ text: pages.join('\\n\\n'), pageCount: pages.length || 1 }));
  process.exit(0);
});
parser.loadPDF(filePath);
`;

  try {
    await writeFile(tmpFile, buffer);
    await writeFile(scriptFile, script);

    const result = await new Promise<{ text: string; pageCount: number }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--max-old-space-size=512', scriptFile, tmpFile],
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`PDF extraction failed (code ${code}): ${stderr || stdout}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.error) reject(new Error(parsed.error));
          else resolve(parsed);
        } catch {
          reject(new Error(`Bad extraction output: ${stdout}`));
        }
      });

      child.on('error', reject);
    });

    return result;
  } finally {
    await Promise.all([
      unlink(tmpFile).catch(() => {}),
      unlink(scriptFile).catch(() => {}),
    ]);
  }
}