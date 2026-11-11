#!/usr/bin/env node
/**
 * 前置验证插件的单元测试（node:test，零依赖）。
 *
 * 跑法：node --test scripts/preflight.test.mjs  或  npm test
 *
 * 用一个手写的假 ctx 模拟 Cordis 运行时：只实现 preflight 用到的那几个成员
 * （ctx.on / ctx.get），然后手工触发 system-prompt/assemble waterfall。
 * 目的是验证每条分支真的会在 system prompt 里说话，而不是"能 import 就算通过"。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { name, inject, apply } from '../lib/preflight.js'

const ALL_SKILLS = [
  'systematic-debugging',
  'verification-before-completion',
  'requesting-code-review',
  'receiving-code-review',
  'dispatching-parallel-agents',
  'brainstorming',
]

/** 造一个最小可用的 ctx，并暴露"触发一次组装"的 helper。 */
function makeRuntime({ skillNames, pluginManager } = {}) {
  const listeners = new Map()
  const listCalls = { count: 0 }
  const ctx = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
      return () => {}
    },
    get(key) {
      if (key === 'skills' && skillNames) {
        return {
          async list() {
            listCalls.count += 1
            return skillNames.map((skill) => ({ name: skill }))
          },
        }
      }
      if (key === 'pluginManager') return pluginManager
      return undefined
    },
  }
  async function assemble(presentation = { sections: [], contexts: [], variables: {} }) {
    const handler = listeners.get('system-prompt/assemble')?.[0]
    assert.ok(handler, 'preflight 没有注册 system-prompt/assemble 监听器')
    return handler(presentation, {}, async () => presentation)
  }
  /** 取本次注入的文本（没有注入则为 undefined）。 */
  async function injectedText(presentation) {
    const result = await assemble(presentation)
    const entry = result.contexts.find((item) => item.name === 'coding:preflight')
    return entry?.text
  }
  return { ctx, assemble, injectedText, listCalls }
}

test('导出形状正确', () => {
  assert.equal(name, 'coding-preflight')
  // 用 ctx.get 可选访问服务，不能硬 inject，否则缺服务时 preset 会卡在 pending
  assert.deepEqual(inject, [])
})

test('技能齐全时注入通过回执', async () => {
  const rt = makeRuntime({ skillNames: ALL_SKILLS })
  apply(rt.ctx, {})
  const text = await rt.injectedText()
  assert.ok(text, '应该注入文本')
  assert.match(text, /前置检查：通过/)
  assert.match(text, /6 个路由技能均可用/)
})

test('缺技能时列出缺失项，且不得声称通过', async () => {
  const rt = makeRuntime({ skillNames: ALL_SKILLS.slice(0, 2) })
  apply(rt.ctx, {}) // 默认 installMode: warn
  const text = await rt.injectedText()
  assert.match(text, /前置检查：未通过/)
  assert.match(text, /requesting-code-review/)
  assert.match(text, /receiving-code-review/)
  assert.doesNotMatch(text, /前置检查：通过/)
  assert.match(text, /设置 → 插件/)
  assert.match(text, /未走 xxx 技能流程/)
})

test('warn 模式不尝试自动安装', async () => {
  let installs = 0
  const pluginManager = { async installBundle() { installs += 1 } }
  const rt = makeRuntime({ skillNames: [], pluginManager })
  apply(rt.ctx, { installMode: 'warn' })
  await rt.injectedText()
  assert.equal(installs, 0)
})

test('skills 服务缺失时降级为警告而不是抛错', async () => {
  const rt = makeRuntime({}) // 没有任何服务
  apply(rt.ctx, {})
  const text = await rt.injectedText()
  assert.match(text, /skills 服务不可用/)
  assert.match(text, /前置检查：未通过/)
})

test('installMode: off 完全不注入', async () => {
  const rt = makeRuntime({ skillNames: [] })
  apply(rt.ctx, { installMode: 'off' })
  assert.equal(await rt.injectedText(), undefined)
})

test('auto 模式：缺失时后台装一次，随后报告安装结果', async () => {
  let installs = 0
  let resolveInstall
  const pluginManager = {
    installBundle(spec) {
      installs += 1
      assert.equal(spec, 'superpowers-dsh')
      return new Promise((resolve) => {
        resolveInstall = resolve
      })
    },
  }
  const rt = makeRuntime({ skillNames: [], pluginManager })
  apply(rt.ctx, { installMode: 'auto', cacheTtlMs: 0 })

  const first = await rt.injectedText()
  assert.equal(installs, 1, '应该发起一次安装')
  assert.match(first, /已在后台发起/)

  resolveInstall({ application: 'applied' })
  await new Promise((resolve) => setImmediate(resolve))

  const second = await rt.injectedText()
  assert.match(second, /已自动安装/)
  assert.match(second, /applied/)
})

test('auto 模式：安装失败时给出可见的失败原因', async () => {
  const pluginManager = {
    async installBundle() {
      return { error: { code: 'already-installed' } }
    },
  }
  const rt = makeRuntime({ skillNames: [], pluginManager })
  apply(rt.ctx, { installMode: 'auto', cacheTtlMs: 0 })
  await rt.injectedText()
  await new Promise((resolve) => setImmediate(resolve))
  const text = await rt.injectedText()
  assert.match(text, /自动安装失败（already-installed）/)
})

test('installMode: auto 但 pluginManager 不可用时说明原因', async () => {
  const rt = makeRuntime({ skillNames: [] })
  apply(rt.ctx, { installMode: 'auto', cacheTtlMs: 0 })
  await rt.injectedText()
  const text = await rt.injectedText()
  assert.match(text, /无法自动安装/)
})

test('检查结果按 TTL 缓存，不每步都扫技能目录', async () => {
  const rt = makeRuntime({ skillNames: ALL_SKILLS })
  apply(rt.ctx, { cacheTtlMs: 60_000 })
  await rt.injectedText()
  await rt.injectedText()
  await rt.injectedText()
  assert.equal(rt.listCalls.count, 1)
})

test('cacheTtlMs: 0 时每次都重新检查', async () => {
  const rt = makeRuntime({ skillNames: ALL_SKILLS })
  apply(rt.ctx, { cacheTtlMs: 0 })
  await rt.injectedText()
  await rt.injectedText()
  assert.equal(rt.listCalls.count, 2)
})

test('自定义 requiredSkills 生效', async () => {
  const rt = makeRuntime({ skillNames: ['only-this-one'] })
  apply(rt.ctx, { requiredSkills: ['only-this-one', 'missing-one'] })
  const text = await rt.injectedText()
  assert.doesNotMatch(text, /only-this-one、/)
  assert.match(text, /缺失技能：missing-one/)
})
