#!/usr/bin/env node
/**
 * 零依赖自检。
 *
 * 不联网、不启动 DSH、不装任何第三方包，只校验「这个包自身是否自洽」：
 *   - package.json 里的入口 / patch / files 是否都真实存在；
 *   - cordis.patch.yml 是否还是那个 preset、插件清单是否包含前置验证；
 *   - persona 的两段文本是否还在（被人误删时能立刻发现）；
 *   - lib/ 下的两个插件是否导出正确的 name / apply。
 *
 * 用途：改完包之后跑 `node scripts/verify.mjs`，或 `npm run verify`。
 * 退出码 0 = 全部通过。
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok: Boolean(ok), detail })
}
/** 文件或目录存在即可（files 字段允许写目录名）。 */
async function exists(rel) {
  try {
    await stat(path.join(root, rel))
    return true
  } catch {
    return false
  }
}

/** 必须是普通文件。 */
async function existsFile(rel) {
  try {
    const info = await stat(path.join(root, rel))
    return info.isFile()
  } catch {
    return false
  }
}

// ── 1. package.json ────────────────────────────────────────────────
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
check('package.json 可解析', true, `name=${pkg.name} version=${pkg.version}`)
check('type 是 module', pkg.type === 'module')
check(
  'dsh.bundle.patch 指向 ./cordis.patch.yml',
  pkg.dsh?.bundle?.patch === './cordis.patch.yml',
  String(pkg.dsh?.bundle?.patch),
)
check('entry patch 文件存在', await existsFile('cordis.patch.yml'))
check('main 指向 lib/index.js', pkg.main === 'lib/index.js', String(pkg.main))
check('lib/index.js 存在', await existsFile('lib/index.js'))
check('lib/preflight.js 存在', await existsFile('lib/preflight.js'))
for (const rel of pkg.files ?? []) {
  check(`files 声明的 ${rel} 存在`, await exists(rel))
}
for (const [key, target] of Object.entries(pkg.exports ?? {})) {
  if (typeof target === 'string' && target.startsWith('./')) {
    check(`exports["${key}"] 的 ${target} 存在`, await existsFile(target.slice(2)))
  }
}

// ── 2. cordis.patch.yml ───────────────────────────────────────────
const patch = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')
check('patch 声明了 preset-coding entry', /(^|\n)\s*- id: preset-coding\s*$/m.test(patch))
check('preset id 为 coding', /(^|\n)\s+id: coding\s*$/m.test(patch))
check('preset 名为「编程模式」', patch.includes('name: 编程模式'))
check('patch 引用了前置验证模块', patch.includes('name: dsh-coding-mode/preflight'))
check('前置验证默认自动安装', patch.includes('installMode: auto'))

// 顶层插件 id 用 10 空格缩进（group 内部的条目是 14 空格）
const pluginIds = [...patch.matchAll(/^ {10}- id: (\S+)$/gm)].map((m) => m[1])
const expectedPlugins = [
  'persona',
  'coding-preflight',
  'agent-instructions',
  'time-context',
  'tool-bash',
  'tool-pwsh',
  'tool-fs',
  'tool-fs-search',
  'tool-jobs',
  'tool-schedule',
  'skill-filesystem',
  'tool-skill',
  'compaction',
  'delegation',
  'tool-ask-user',
  'tool-todo',
  'tool-web',
  'present',
]
check(
  '插件清单与预期一致',
  JSON.stringify(pluginIds) === JSON.stringify(expectedPlugins),
  pluginIds.length === expectedPlugins.length
    ? `实际顺序：${pluginIds.join(',')}`
    : `实际 ${pluginIds.length} 项：${pluginIds.join(',')}`,
)

// persona 两段都在，且没被压成空
check('persona prefix 存在', /^ {14}prefix: \|$/m.test(patch))
check('persona suffix 存在', /^ {14}suffix: \|$/m.test(patch))
for (const heading of ['一、过程可见性', '二、怎么思考', '三、写代码的准则', '四、验证', '五、收尾']) {
  check(`prefix 含小节「${heading}」`, patch.includes(heading))
}
for (const heading of ['六、技能与子代理路由', '子代理不放松可见性', '七、语言']) {
  check(`suffix 含小节「${heading}」`, patch.includes(heading))
}

// 平台判定没被写成死字符
check('bash 用 js 表达式做平台判定', patch.includes("process.platform === 'win32'"))
check('pwsh 用 js 表达式做平台判定', patch.includes("process.platform !== 'win32'"))

// ── 3. lib/ 插件导出 ──────────────────────────────────────────────
const entry = await import(pathToFileURL(path.join(root, 'lib/index.js')).href)
check('lib/index.js 导出 name', typeof entry.name === 'string', entry.name)
check('lib/index.js 导出 apply', typeof entry.apply === 'function')

const preflight = await import(pathToFileURL(path.join(root, 'lib/preflight.js')).href)
check('lib/preflight.js 导出 name', preflight.name === 'coding-preflight', String(preflight.name))
check('lib/preflight.js 导出 apply', typeof preflight.apply === 'function')

const preflightSource = await readFile(path.join(root, 'lib/preflight.js'), 'utf8')
const routedSkills = [
  'systematic-debugging',
  'verification-before-completion',
  'requesting-code-review',
  'receiving-code-review',
  'dispatching-parallel-agents',
  'brainstorming',
]
for (const skill of routedSkills) {
  check(`前置验证覆盖技能 ${skill}`, preflightSource.includes(`'${skill}'`))
}
check('前置验证挂在 system-prompt/assemble', preflightSource.includes("'system-prompt/assemble'"))
check('单测文件存在', await existsFile('scripts/preflight.test.mjs'))

// ── 报告 ──────────────────────────────────────────────────────────
const failed = checks.filter((item) => !item.ok)
for (const item of checks) {
  console.log(`${item.ok ? '✓' : '✗'} ${item.label}${item.detail ? `  (${item.detail})` : ''}`)
}
console.log('')
console.log(`${checks.length - failed.length}/${checks.length} 项通过`)
if (failed.length > 0) {
  console.error(`\n失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`)
  process.exitCode = 1
}
