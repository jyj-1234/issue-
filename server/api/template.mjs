import { parse } from 'kordoc'

const SUPPORTED = new Set(['.hwp', '.hwpx', '.docx', '.pdf', '.xlsx', '.xls'])
const MAX_FILE_BYTES = 25 * 1024 * 1024

function extensionOf(fileName) { return `.${fileName.toLowerCase().split('.').pop()}` }

function error(code, message) { return { ok: false, error: { code, message } } }

function buildTemplatePrompt(fileName, fileType, markdown, outline) {
  return `다음은 사용자가 업로드한 보고서 양식 분석 결과입니다. 이후 보고서를 생성할 때 원본의 제목, 항목명, 문단 순서, 표 구조와 개조식 위계를 최대한 유지하세요.

원본 파일명: ${fileName}
문서 형식: ${fileType}
분석된 목차:
${outline.length ? outline.map((item) => `- ${item}`).join('\n') : '- Markdown 본문 순서 기준'}

분석된 원문 Markdown:
${markdown}

반드시 원본 양식의 순서를 따르고, 원본에 없는 별도 대항목을 임의로 추가하지 마세요. 필요한 사실이 없으면 해당 항목에 확인 필요라고 표시하세요.`
}

export async function analyzeTemplate({ fileName, buffer }) {
  const extension = extensionOf(fileName)
  if (!SUPPORTED.has(extension)) return error('UNSUPPORTED_FILE_TYPE', `지원하지 않는 파일 형식입니다. 지원 형식: ${[...SUPPORTED].join(', ')}`)
  if (!buffer?.length) return error('EMPTY_FILE', '업로드된 파일이 비어 있습니다.')
  if (buffer.length > MAX_FILE_BYTES) return error('FILE_TOO_LARGE', '파일 크기는 25MB 이하만 지원합니다.')
  try {
    const parsed = await parse(buffer)
    const markdown = String(parsed.markdown || '').trim()
    if (!markdown) return error('EMPTY_ANALYSIS', `${extension.toUpperCase()} 파일에서 분석할 텍스트를 찾지 못했습니다.`)
    const outline = Array.isArray(parsed.outline) ? parsed.outline.map((item) => typeof item === 'string' ? item : item.text || item.title || '').filter(Boolean) : markdown.split('\n').filter((line) => /^#{1,6}\s|^\d+[.)]\s|^[가-힣A-Za-z]\.\s/.test(line.trim())).map((line) => line.trim().replace(/^#+\s*/, ''))
    const fileType = parsed.fileType || extension.slice(1).toUpperCase()
    return { ok: true, fileName, fileType, markdown: markdown.slice(0, 60000), outline: outline.slice(0, 100), templatePrompt: buildTemplatePrompt(fileName, fileType, markdown.slice(0, 60000), outline.slice(0, 100)), warnings: parsed.warnings || [] }
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught)
    const prefix = extension === '.hwp' || extension === '.hwpx' ? '한글 파일 분석에 실패했습니다.' : '문서 분석에 실패했습니다.'
    return error('PARSE_FAILED', `${prefix} (${extension}) ${detail}`)
  }
}
