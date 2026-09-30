/**
 * Ekstraksi teks PDF per baris. Bagian ini sengaja tidak mengimpor pdf.js
 * secara langsung supaya bisa dipakai di browser (pdfjs-dist + worker) dan di
 * test Node (pdfjs-dist/legacy).
 */

interface TextItemLike {
  str: string
  transform: number[]
}

export interface PdfPageLike {
  // pdf.js juga mengembalikan item "marked content" tanpa teks; disaring di bawah.
  getTextContent(): Promise<{ items: object[] }>
}

const isTextItem = (it: object): it is TextItemLike =>
  'str' in it && typeof it.str === 'string' && 'transform' in it && Array.isArray(it.transform)

export interface PdfDocumentLike {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
}

/** Selisih koordinat Y (pt) yang masih dianggap satu baris. */
const LINE_TOLERANCE = 2

/** Ambil semua baris teks dari PDF, urut atas → bawah, kiri → kanan, per halaman. */
export async function extractPdfLines(doc: PdfDocumentLike): Promise<string[]> {
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = content.items
      .filter(isTextItem)
      .filter((it) => it.str.trim() !== '')
      .map((it) => ({ text: it.str, x: it.transform[4], y: it.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x)

    let current: typeof items = []
    let currentY = Number.NaN
    const flush = () => {
      if (current.length === 0) return
      const text = current
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) lines.push(text)
      current = []
    }
    for (const item of items) {
      if (current.length > 0 && Math.abs(item.y - currentY) > LINE_TOLERANCE) flush()
      if (current.length === 0) currentY = item.y
      current.push(item)
    }
    flush()
  }
  return lines
}
