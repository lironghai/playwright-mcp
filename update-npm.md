要将项目重命名为 @hero-gm/hero-pw-mcp 并发布到 npm，需要调整以下文件：

必须调整的文件

1. package.json（最重要）
   {
   "name": "@hero-gm/hero-pw-mcp",  // 修改包名
   "version": "1.0.0",              // 建议重新开始版本号
   "description": "Hero Playwright Tools for MCP",  // 可选：更新描述
   "repository": {
   "type": "git",
   "url": "git+https://github.com/your-username/hero-pw-mcp.git"  // 更新仓库地址
   },
   "homepage": "https://github.com/your-username/hero-pw-mcp",  // 更新主页
   "author": {
   "name": "Your Name"  // 更新作者信息
   },
   "bin": {
   "hero-pw-mcp": "cli.js"  // 可选：更新CLI命令名
   }
   }

2. README.md（大量引用需要更新）
   需要全局替换：
- @playwright/mcp → @hero-gm/hero-pw-mcp
- 所有安装示例中的包名
- CLI help 输出中显示的包名

3. utils/update-readme.js（第134行）
   '> npx @playwright/mcp@latest --help',  // 需要更新为新包名

发布到 npm 前的准备

1. 创建 npm 账户和组织
# 如果没有 @hero-gm 组织，需要先创建
npm login
npm org add hero-gm your-username

2. 构建和测试
   npm run build
   npm test
   npm run lint

3. 发布
# 首次发布
npm publish --access public

# 或使用 package.json 中定义的发布脚本
npm run npm-publish

可选调整

- LICENSE文件：如果要改变许可证
- 扩展目录：如果有Chrome扩展相关的配置
- Docker相关：如果使用Docker部署

最关键的是 package.json 和 README.md 的更新，其他文件基本不需要修改代码逻辑