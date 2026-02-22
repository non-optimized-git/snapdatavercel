# Snapdata 数达

当前项目以 `Vite + React + TypeScript + Tailwind` 为唯一运行主线。

## 已实现模块（React）

- Excel 上传与解析（`.xlsx/.xls`）
- 多条件筛选（AND）
- 分析工作区（多题目）
- 每个题目支持多个交叉分析块
- 主分析：频数/百分比、排序、小数位、均值、拖拽排序
- 交叉分析：TopN 差异高亮、Z 检验灯泡、智能结论
- 交叉块删除按钮与交叉表右边缘对齐（圆形 `×`）
- 复制：主分析表、交叉分析表、智能结论
- 导出：
  - 一键批量导出所有题目与交叉块

## 运行

```bash
cd "/Users/yuanyi.li/Documents/New project"
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173/`

## 构建

```bash
npm run build
npm run preview
```

## 单文件离线版（可双击打开）

```bash
npm run build:offline
```

会在项目根目录生成：

- `index.offline.html`：单文件离线入口（可直接双击打开使用）

## 目录

- `index.html`：Vite 入口
- `index.offline.html`：离线单文件入口
- `src/`：React 源码
- `public/`：静态资源
- `package.json`：依赖与脚本
