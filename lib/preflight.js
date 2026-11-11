/**
 * 编程模式前置验证（preflight）。
 *
 * 职责：确认 persona 里「技能路由」所依赖的 superpowers 技能是否真的存在。
 *   - 全部就绪 → 注入一行通过回执，模型知道路由可用；
 *   - 有缺失   → 注入缺失清单与处置方式；installMode=auto 时在后台尝试安装一次。
 *
 * 挂载点：`system-prompt/assemble` waterfall（waterfall 是异步的），每次组装
 * system prompt 前检查一次，结果按 TTL 缓存，避免每步都去扫技能目录。
 *
 * 设计约束：
 *   - 不硬依赖 skills / pluginManager。两者用 ctx.get() 可选取用，缺失时降级为
 *     文本警告，而不是让整个 preset 卡在 pending。
 *   - 自动安装不 await：installBundle 会改写 profile 并触发插件重载，
 *     在 prompt 组装里等它容易把当前会话拖死。
 */

export const name = 'coding-preflight'

export const inject = []

/** persona.suffix 里点名要求的路由技能，缺一个对应规则就失效。 */
const DEFAULT_REQUIRED_SKILLS = [
  'systematic-debugging',
  'verification-before-completion',
  'requesting-code-review',
  'receiving-code-review',
  'dispatching-parallel-agents',
  'brainstorming',
]

const DEFAULT_BUNDLE = 'superpowers-dsh'
const DEFAULT_TTL_MS = 30_000
const CONTEXT_NAME = 'coding:preflight'

export function apply(ctx, config = {}) {
  const requiredSkills =
    Array.isArray(config.requiredSkills) && config.requiredSkills.length > 0
      ? config.requiredSkills
      : DEFAULT_REQUIRED_SKILLS
  const bundleName =
    typeof config.superpowersBundle === 'string' && config.superpowersBundle
      ? config.superpowersBundle
      : DEFAULT_BUNDLE
  // 'off'：不注入任何文本；'warn'：只提示；'auto'：缺失时自动装一次
  const installMode =
    config.installMode === 'auto' || config.installMode === 'off' ? config.installMode : 'warn'
  const ttlMs =
    Number.isFinite(config.cacheTtlMs) && config.cacheTtlMs >= 0
      ? config.cacheTtlMs
      : DEFAULT_TTL_MS

  let cached
  let inflight
  let installAttempt

  /**
   * 读一次技能注册表。
   * @returns {Promise<{ available: boolean, reason?: string, missing: string[] }>}
   */
  async function inspect() {
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    if (inflight) return inflight
    inflight = (async () => {
      const registry = ctx.get('skills')
      if (!registry || typeof registry.list !== 'function') {
        return { available: false, reason: 'skills 服务不可用', missing: [...requiredSkills] }
      }
      try {
        const list = await registry.list({})
        const present = new Set(list.map((skill) => skill.name))
        return {
          available: true,
          missing: requiredSkills.filter((skill) => !present.has(skill)),
        }
      } catch (error) {
        return {
          available: false,
          reason: `技能目录读取失败（${error?.message ?? error}）`,
          missing: [...requiredSkills],
        }
      }
    })()
    try {
      const value = await inflight
      cached = { at: Date.now(), value }
      return value
    } finally {
      inflight = null
    }
  }

  /** 缺失且允许自动安装时，进程内只发起一次，且不等它完成。 */
  function ensureBundle(status) {
    if (installMode !== 'auto' || status.missing.length === 0 || installAttempt) return
    const manager = ctx.get('pluginManager')
    if (!manager || typeof manager.installBundle !== 'function') {
      installAttempt = { state: 'unavailable', reason: 'pluginManager 服务不可用' }
      return
    }
    installAttempt = { state: 'running' }
    manager
      .installBundle(bundleName, { enabled: true })
      .then((result) => {
        installAttempt = result?.error
          ? { state: 'failed', reason: result.error.code ?? 'install-failed' }
          : { state: 'done', application: result?.application }
        // 安装可能已改变技能注册表，下一次组装重新检查。
        cached = undefined
      })
      .catch((error) => {
        installAttempt = { state: 'failed', reason: String(error?.message ?? error) }
      })
  }

  /** 把检查结果渲染成一段注入 system prompt 的上下文。 */
  function render(status) {
    if (installMode === 'off') return ''
    if (status.available && status.missing.length === 0) {
      return `技能前置检查：通过（${requiredSkills.length} 个路由技能均可用）。涉及对应场景时按 persona 规则主动加载，不要跳过。`
    }

    const lines = ['技能前置检查：未通过。']
    if (status.available) {
      lines.push(`缺失技能：${status.missing.join('、')}。`)
    } else {
      lines.push(`${status.reason}；视为全部缺失：${status.missing.join('、')}。`)
    }
    lines.push(
      `这些技能由 ${bundleName} 提供。缺失时 persona 里「技能路由」的对应规则无法执行。`,
    )

    if (installMode === 'auto') {
      if (installAttempt?.state === 'running') {
        lines.push(
          `已在后台发起 ${bundleName} 的安装，安装完成后技能才会进入注册表，本会话可能需要重开才能用上。在此之前不要声称已按技能流程执行。`,
        )
      } else if (installAttempt?.state === 'done') {
        lines.push(
          `已自动安装 ${bundleName}（application: ${installAttempt.application}）。请提示用户重开本会话，或等待插件热重载后再依赖这些技能。`,
        )
      } else if (installAttempt?.state === 'failed') {
        lines.push(
          `自动安装失败（${installAttempt.reason}）。请告知用户在 DSH 的「设置 → 插件」中安装 ${bundleName}。`,
        )
      } else if (installAttempt?.state === 'unavailable') {
        lines.push(
          `无法自动安装（${installAttempt.reason}）。请告知用户在 DSH 的「设置 → 插件」中安装 ${bundleName}。`,
        )
      }
    } else {
      lines.push(
        `请告知用户在 DSH 的「设置 → 插件」中安装 ${bundleName} 后重开本会话。`,
      )
    }

    lines.push(
      '在技能可用之前：不要假装执行了这些技能。用自身能力照常完成调试与验证，但必须在结论里注明「未走 xxx 技能流程」。',
    )
    return lines.join('\n')
  }

  ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
    const presented = await next()
    if (installMode === 'off') return presented
    const status = await inspect()
    ensureBundle(status)
    const text = render(status)
    if (text) {
      presented.contexts.push({ name: CONTEXT_NAME, text })
    }
    return presented
  })
}
