import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPdfLines } from '../../src/lib/parsers/pdfText'

/** Baca PDF di Node (pdf.js legacy build) dan kembalikan baris-baris teksnya. */
export async function pdfLinesFromFile(file: string): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(fs.readFileSync(file)) })
  try {
    return await extractPdfLines(await task.promise)
  } finally {
    await task.destroy()
  }
}
