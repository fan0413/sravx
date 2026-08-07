const fs = require('fs')
const path = require('path')

function normalizePem(raw) {
  let text = String(raw || '').replace(/^\uFEFF/, '').trim()
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const begin = '-----BEGIN PRIVATE KEY-----'
  const end = '-----END PRIVATE KEY-----'
  if (!text.includes(begin) || !text.includes(end)) {
    throw new Error('文件内容不是有效的 PRIVATE KEY PEM，请确认是 apiclient_key.pem')
  }

  const body = text
    .slice(text.indexOf(begin) + begin.length, text.indexOf(end))
    .replace(/\s+/g, '')

  if (!body) {
    throw new Error('PEM 内容为空，请检查文件')
  }

  const lines = body.match(/.{1,64}/g) || []
  return `${begin}\n${lines.join('\n')}\n${end}`
}

function main() {
  const input = process.argv[2]
  if (!input) {
    console.log('用法: node format-pem.js <pem文件路径>')
    process.exit(1)
  }

  const absPath = path.resolve(process.cwd(), input)
  const raw = fs.readFileSync(absPath, 'utf8')
  const pem = normalizePem(raw)

  // JSON 环境变量可直接使用的值（单行，\\n 转义）
  const escaped = pem.replace(/\n/g, '\\n')

  console.log('\n=== PAY_PRIVATE_KEY 可粘贴值 ===\n')
  console.log(escaped)
  console.log('\n=== JSON 片段 ===\n')
  console.log(`"PAY_PRIVATE_KEY": "${escaped}"`)
}

main()
