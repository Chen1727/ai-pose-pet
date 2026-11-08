# 爪迹灵感库

猫狗姿态、猫狗种类和人宠互动参考图库，配套一个支持多张参考图的 AI 合成台。

## 功能

- **图库总览**：展示猫咪、狗狗、人宠互动图片数量和推荐参考图。
- **宠物姿势库**：检索猫咪和狗狗的动作、姿态、镜头与环境参考。
- **猫狗种类库**：按猫狗外形、毛色和体态浏览图片。
- **人宠互动图库**：整理陪伴、散步、玩耍和合影构图。
- **AI 合成台**：人物、服装、姿势三个基础参考位，加最多两张宠物参考图，总计最多五张参考图。

## 本地启动

需要 Node.js 24 及 pnpm。

```powershell
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:5173`。Windows 用户也可以双击项目根目录的 `start.bat`。

## 构建

```powershell
pnpm build
```

静态网站输出到 `dist/`。

## 技术栈

- React 19、TypeScript 7、Vite 8
- TanStack Router、TanStack Query
- Tailwind CSS、shadcn/ui、Lucide Icons

## 目录说明

```text
src/                 前端页面、组件、合成台和状态管理
data/pets.json       宠物图库初始记录
img/pets/            宠物图库初始图片
dist/                pnpm build 生成的构建文件
start.bat            Windows 一键启动脚本
```

## 免责声明

本项目仅供宠物姿态、外形和人宠构图参考，以及合法的个人创作和技术交流。使用者应确认所使用的图片拥有合法来源和必要授权，不得使用本项目制作违法内容、未经授权换脸或深度伪造。因 AI 生成和发布产生的责任由使用者自行承担。

## 设计致谢

本网站的页面组织和图库交互设计参考了 [anhao/ai-pose-gallery-zh](https://github.com/anhao/ai-pose-gallery-zh)，感谢原项目作者提供的开源实现思路。本项目根据宠物图库场景进行了独立调整和视觉改造。

## 开源协议

网站代码使用 [MIT License](LICENSE)。

项目维护者自己生成并且拥有必要授权的图片，使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权，使用时请保留署名。用户上传图片和第三方参考数据不因本项目使用上述协议而改变其原有版权和授权条件。

## 项目地址

[https://github.com/Chen1727/ai-pose-pet](https://github.com/Chen1727/ai-pose-pet)
