// 应用语义化版本号（单一可信源）。
//   - 「关于」页展示
//   - APK 版本更新检测（比对 GitHub Releases 的 tag）的本地基线
//   - CI 构建时读取此处作为 Release 的 tag（见 .github/workflows/build.yml）
// 注意：网页版部署仍用 scripts/version.mjs 注入时间戳作为「构建号」，
// 那套用于网页自动刷新，与 APK 的语义化版本互不影响。
export const APP_VERSION = 'v2.6.2'
