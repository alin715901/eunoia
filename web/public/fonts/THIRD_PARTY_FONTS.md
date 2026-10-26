# 第三方字体（自托管 Web 字体）

本目录下的中文字体用于「字体设置」，已自托管并随站点分发。iOS 只内置苹方（PingFang），
缺少宋体/楷体/圆体，因此这些字体以 Web 字体形式内嵌，仅在对应选项被选中（或打开字体选择页
预览）时才按需下载对应字形子集，且会被 Service Worker 缓存；默认字体与首屏速度不受影响。

| 选项 | 字体 | 目录 | 许可证 | 版权 / 来源 |
| --- | --- | --- | --- | --- |
| 手写 | 马善政手写体 | `mashanzheng/` | SIL OFL 1.1 | 马善政；见 `mashanzheng/OFL.txt` |
| 宋体 | Noto Serif SC | `song/` | SIL OFL 1.1 | © 2015–2021 Google LLC（Google Fonts） |
| 楷体 | LXGW WenKai（霞鹜文楷） | `kai/` | SIL OFL 1.1 | 基于 Fontworks Klee One / Glyphs；lxgw-wenkai-webfont |
| 圆体 | ZCOOL KuaiLe（站酷快乐体） | `round/` | SIL OFL 1.1 | © 2016 ZCOOL（站酷） |

以上字体均遵循 **SIL Open Font License 1.1**（可自由用于商业与个人项目，须保留版权与许可声明）。
如需完整许可文本，参见 https://openfontlicense.org/ 。

> macOS 用户：系统中已有原生 Songti SC / Kaiti SC / Yuanti SC，将优先使用原生字体，
> 不会下载上面的 Web 字体子集；iOS 等无原生字体的平台才会回退到内嵌 Web 字体。
