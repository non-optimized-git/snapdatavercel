# Snapdata 数达

当前采用“开发分文件 + 单文件发布”双轨结构，并启用依赖加载策略：`CDN 优先，本地 vendor 兜底`。

## 文件说明

- `index.html`：开发入口（引用 `styles.css` / `bootstrap.js`）
- `styles.css`：样式文件
- `app.js`：业务逻辑
- `bootstrap.js`：依赖加载器（先 CDN，失败后本地 vendor）
- `vendor/`：本地兜底依赖目录
- `index.single.html`：打包后的单文件版本（便于分发）
- `scripts/build-single.sh`：将分文件打包为单文件

## 依赖加载策略

运行时依赖：
- `SheetJS` (`XLSX`)
- `Sortable.js`

加载顺序：
1. 优先从 CDN 加载
2. CDN 失败时自动尝试本地文件：
   - `vendor/xlsx.full.min.js`
   - `vendor/Sortable.min.js`
3. 两者都失败时，页面顶部显示错误提示

## 本地使用

1. 开发调试：直接打开 `index.html`
2. 生成单文件发布版：执行 `./scripts/build-single.sh`
3. 分发时使用 `index.single.html`

## 离线建议

如果希望在无网络环境稳定运行，请提前把 vendor 依赖放到本地：
- `vendor/xlsx.full.min.js`
- `vendor/Sortable.min.js`
