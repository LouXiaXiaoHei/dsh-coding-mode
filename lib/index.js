/**
 * 包入口。
 *
 * 本包以「bundle patch」形式被 DSH 使用（package.json 的 `dsh.bundle.patch` 指向
 * cordis.patch.yml，preset 在 patch 里声明），所以这里不需要注册任何东西。
 * 保留一个空插件只是为了 `main` 能解析，便于别的工具 import 包元信息而不报错。
 * 真正的运行时逻辑在 ./preflight。
 */
export const name = 'coding-mode-entry'

export const inject = []

export function apply() {}
