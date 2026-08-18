import { markdownToHwpx } from 'kordoc'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

function plainLines(markdown) {
  return String(markdown || '').replace(/\r/g, '').split('\n').filter((line) => line.trim()).map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• ').trim())
}

export async function exportReport({ format, markdown, title }) {
  const safeTitle = String(title || 'reportly-report').replace(/[^\w가-힣-]+/g, '-').slice(0, 80) || 'reportly-report'
  const content = String(markdown || '').slice(0, 120000)
  if (!content.trim()) throw new Error('다운로드할 보고서 내용이 없습니다.')
  if (format === 'hwpx') return { fileName: `${safeTitle}.hwpx`, contentType: 'application/vnd.hancom.hwp', buffer: Buffer.from(await markdownToHwpx(content)) }
  if (format === 'docx') {
    const children = plainLines(content).map((line) => line.startsWith('제목') || line.length < 45 && !line.includes(' ') ? new Paragraph({ text: line, heading: HeadingLevel.HEADING_2 }) : new Paragraph({ children: [new TextRun(line)] }))
    const document = new Document({ sections: [{ properties: {}, children }] })
    return { fileName: `${safeTitle}.docx`, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(await Packer.toBuffer(document)) }
  }
  throw new Error('지원하지 않는 다운로드 형식입니다.')
}
