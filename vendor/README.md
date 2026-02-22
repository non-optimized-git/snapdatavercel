# vendor 本地依赖目录

用于“CDN 优先，本地兜底”加载策略。

请放入以下文件：

- `vendor/xlsx.full.min.js`
  - 来源建议：SheetJS 0.18.5
- `vendor/Sortable.min.js`
  - 来源建议：Sortable.js 1.15.0

加载顺序：
1. 先尝试 CDN
2. CDN 失败时自动尝试本地 vendor 文件
3. 两者都失败时页面给出错误提示
