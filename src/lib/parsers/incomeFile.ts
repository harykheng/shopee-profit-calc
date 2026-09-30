// Khusus browser: membaca file PDF dengan pdf.js lalu mem-parse isinya.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ParseError } from './common'
import { parseIncomeLines, type IncomeParseResult } from './income'
import { extractPdfLines } from './pdfText'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function parseIncomeFile(data: ArrayBuffer): Promise<IncomeParseResult> {
  let lines: string[]
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
    lines = await extractPdfLines(doc)
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new ParseError('PDF ini dikunci password. Download ulang laporan dari Shopee tanpa password.')
    }
    throw new ParseError(
      'File tidak bisa dibaca. Pastikan file berformat PDF laporan penghasilan dari Shopee.',
    )
  }
  return parseIncomeLines(lines)
}
