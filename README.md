# 爪迹灵感库

面向猫狗创作的人宠参考图库与 AI 合成台。项目提供猫狗种类、宠物姿势、宠物服装和人宠互动参考，并支持把多种参考图组合后交给图像模型生成。

## 功能

- **图库总览**：查看宠物图片数量和精选参考图。
- **猫狗种类库**：浏览猫咪、狗狗的外形、毛色、体态和特征参考。
- **宠物姿势库**：浏览猫狗动作、姿态、镜头和环境参考。
- **宠物服装库**：整理宠物服装、配饰和造型参考。
- **人宠互动图库**：整理陪伴、散步、玩耍和合影构图参考。
- **AI 角色合成台**：可组合以下参考图，每种最多选择一张：
  - 宠物
  - 宠物服装
  - 人像
  - 人物服装
  - 姿势
- **参考拼图**：将当前选择的参考图合成为一张拼图，便于提交给图像模型。
- **多模型配置**：支持 Gemini、GPT、通义、豆包和 ComfyUI 等图像生成接口，具体能力取决于接口配置。

## 本地启动

环境要求：Node.js 24 及 pnpm。

```powershell
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:5173`。

需要使用网页图库管理和上传功能时，先复制 `.env.example` 为 `.env`，设置管理员密码和会话密钥，再启动 API：

```powershell
pnpm api
```

Windows 用户也可以双击项目根目录的 `start.bat`，脚本会检查依赖并启动前端和 API。

## 构建

```powershell
pnpm build
```

构建结果输出到 `dist/`，可使用以下命令预览：

```powershell
pnpm preview
```

代码检查：

```powershell
pnpm lint
```

## 技术栈

- React 19、TypeScript 7、Vite 8
- TanStack Router、TanStack Query
- Tailwind CSS、shadcn/ui、Lucide Icons
- Express、Multer、Sharp（图库管理 API）
- IndexedDB（合成台配方、历史记录和本地图片状态）

## 目录说明

```text
src/                 页面、组件、合成台和状态管理
src/routes/          图库、合成台、设置和说明页面
data/pets.json       宠物图库初始记录
img/pets/            宠物图库初始图片
server.mjs           管理员登录和图片上传 API
start.bat            Windows 一键启动脚本
nginx-pet.conf       Nginx 部署示例
pet-api.service      API systemd 服务示例
```

## 免责声明

本项目用于宠物姿态、外形、人宠互动和合法的个人创作参考。使用者应确认所使用的图片、人物和模型服务拥有合法来源与必要授权，不得使用本项目制作违法内容、未经授权换脸、深度伪造或侵犯他人隐私的内容。因 AI 生成和发布产生的责任由使用者自行承担。

## 设计致谢

本网站的页面组织和图库交互设计参考了 [anhao/ai-pose-gallery-zh](https://github.com/anhao/ai-pose-gallery-zh)，感谢原项目作者提供的开源实现思路。本项目根据宠物图库场景进行了独立调整和视觉改造。

## 开源协议与图片授权

- 网站代码使用 [MIT License](LICENSE)。
- 项目维护者自己生成并且拥有必要授权的图片，使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权，使用时请保留署名。
- 用户上传图片和第三方参考数据不因本项目使用上述协议而改变其原有版权和授权条件。

## 项目地址

[https://github.com/Chen1727/ai-pose-pet](https://github.com/Chen1727/ai-pose-pet)
