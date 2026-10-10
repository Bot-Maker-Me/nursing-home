export type CsvResult = { headers: string[]; rows: Record<string, string>[] }

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas, CRLF. */
export function parseCsv(text: string): CsvResult {
  const clean = text.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      records.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    records.push(row)
  }

  const nonEmpty = records.filter((candidate) => candidate.some((cell) => cell.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map((header) => header.trim().toLowerCase())
  const rows = nonEmpty.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])),
  )
  return { headers, rows }
}
