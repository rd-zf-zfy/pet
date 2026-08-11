# 蓝羽桌宠

基于 `Free.zip` 的蓝羽素材制作的透明悬浮桌面宠物，并支持切换到猫咪形态。当前支持 Windows 运行，并已补齐 macOS 运行和打包配置。

## 功能

- 蓝羽形态支持待机、走路、奔跑和前后左右视角
- 猫咪形态支持待机、左右跑动、跳跃、摔倒等序列帧
- 点击反馈：爱心、星星、感叹号
- 说话气泡
- 互动道具：枕头、零食、小球、礼物
- 鼠标拖拽
- 右键菜单触发动作、移动、缩放、变身、任务面板、回到底部右侧和退出
- 碰到屏幕边缘会自动转向
- 默认启动尺寸为迷你

## 交给蓝羽小任务

右键桌宠，选择 `交给蓝羽小任务`，输入任务和工作目录后点击 `交给蓝羽`。应用会调用当前电脑上的本地 `codex exec`。

这个能力是可选能力：桌宠本体不依赖 Codex CLI；如果目标电脑没有安装 Codex CLI，桌宠仍可正常运行，只是任务执行会失败并在任务面板中显示错误。

任务日志在开发运行时写入项目 `tasks/`，打包运行时写入系统用户数据目录下的 `tasks/`。

## 直接运行

打包后的 Windows 便携版 exe 不依赖本机开发目录、Node.js、npm 或原始压缩包。复制到其他 Windows 电脑后，双击即可运行。

## 源码运行

```powershell
npm install
npm run validate
npm start
```

## Windows 打包

```powershell
npm run dist:win
```

产物会生成到 `release/`。

## macOS 运行

```bash
npm install
npm start
```

macOS 不需要执行 `npm run assets`，项目已包含生成好的素材。详见 [MAC.md](./MAC.md)。

## macOS 打包

在 macOS 中执行：

```bash
npm run dist:mac
```

输出目录：`release/`

## 素材目录

- `assets/source/`：从 `Free.zip` 解出的蓝羽原始 sprite sheet
- `assets/source/cat/FreeCatCharacterAnimations/`：猫咪 sprite sheet 和许可证
- `assets/manifests/lanyu.json`：蓝羽形态运行清单
- `assets/manifests/cat.json`：猫咪形态运行清单
- `assets/generated/states/`：蓝羽派生状态动画
- `assets/generated/effects/`：点击反馈特效
- `assets/generated/props/`：互动道具
- `assets/generated/ui/`：气泡素材
- `assets/manifest.json`：兼容旧入口的素材清单

## 重新生成素材

```powershell
npm run assets
```

生成脚本是 `tools/generate-assets.ps1`，只用于开发期重新派生蓝羽 64x128 素材。打包后的 exe 已包含运行所需素材，不需要执行这个脚本。
