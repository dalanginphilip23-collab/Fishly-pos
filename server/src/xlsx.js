import { deflateRawSync } from 'node:zlib'

// Small, dependency-free XLSX writer. A workbook is a ZIP archive of XML parts,
// so this keeps Excel exports working without adding a spreadsheet dependency.

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let value = n
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[n] = value >>> 0
}

function crc32(data) {
  let value = 0xffffffff
  for (let index = 0; index < data.length; index++) value = crcTable[(value ^ data[index]) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function zip(entries) {
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const local = []
  const central = []
  let offset = 0

  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const source = Buffer.from(content, 'utf8')
    const compressed = deflateRawSync(source)
    const checksum = crc32(source)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt16LE(dosTime, 10)
    header.writeUInt16LE(dosDate, 12)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(compressed.length, 18)
    header.writeUInt32LE(source.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0, 8)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt16LE(dosTime, 12)
    directory.writeUInt16LE(dosDate, 14)
    directory.writeUInt32LE(checksum, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(source.length, 24)
    directory.writeUInt16LE(nameBytes.length, 28)
    directory.writeUInt16LE(0, 30)
    directory.writeUInt16LE(0, 32)
    directory.writeUInt16LE(0, 34)
    directory.writeUInt16LE(0, 36)
    directory.writeUInt32LE(0, 38)
    directory.writeUInt32LE(offset, 42)

    local.push(header, nameBytes, compressed)
    central.push(directory, nameBytes)
    offset += header.length + nameBytes.length + compressed.length
  }

  const centralSize = central.reduce((size, part) => size + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...local, ...central, end])
}

const escapeXml = (value) => String(value).replace(/[<>&"']/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[character]))

function columnName(index) {
  let name = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function cellXml(value, column, row, style) {
  const reference = `${columnName(column)}${row + 1}`
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`
  }
  if (value === null || value === undefined || value === '') return `<c r="${reference}" s="${style}"/>`
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function worksheet(sheet) {
  const columns = sheet.columns || []
  const widths = columns.map((column, index) => {
    return `<col min="${index + 1}" max="${index + 1}" width="${column.width || 16}" customWidth="1"/>`
  }).join('')
  const header = columns.map((column, index) => cellXml(column.header ?? '', index, 0, 1)).join('')
  const rows = sheet.rows.map((row, rowIndex) => {
    return `<row r="${rowIndex + 2}">${row.map((value, columnIndex) => cellXml(value, columnIndex, rowIndex + 1, 0)).join('')}</row>`
  }).join('')
  const lastColumn = columnName(Math.max(0, columns.length - 1))
  const lastRow = sheet.rows.length + 1
  const filter = sheet.rows.length ? `<autoFilter ref="A1:${lastColumn}${lastRow}"/>` : ''

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<cols>${widths}</cols>`
    + `<sheetData><row r="1">${header}</row>${rows}</sheetData>`
    + `${filter}</worksheet>`
}

const styles = () => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3F9"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>'

const contentTypes = (sheets) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  + sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  + '</Types>'

const rootRels = () => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + '</Relationships>'

const workbookRels = (sheets) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  + '</Relationships>'

const workbook = (sheets) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  + '<sheets>'
  + sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  + '</sheets></workbook>'

export function buildWorkbook(sheets) {
  if (!Array.isArray(sheets) || !sheets.length) throw new Error('A workbook needs at least one sheet')
  const entries = [
    ['[Content_Types].xml', contentTypes(sheets)],
    ['_rels/.rels', rootRels()],
    ['xl/workbook.xml', workbook(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRels(sheets)],
    ['xl/styles.xml', styles()],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet)]),
  ]
  return zip(entries)
}
