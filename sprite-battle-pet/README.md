# 灵刃桌宠

基于 `Spritesheets.zip` 制作的独立战斗型透明桌宠。

## 功能

- 待机、跑动、跳跃、攻击、受击、倒下
- 左键点击触发攻击，连续点击会受击扣血
- 血量归零后倒下，再点击或右键复活
- 右键菜单可触发攻击、跳跃、受击、倒下、复活、左右跑动、变身和尺寸切换
- 支持在灵刃和小猫形态之间切换
- 右键菜单可打开“交给灵刃小任务”，调用本机 Codex CLI 处理本地任务
- 碰到屏幕边缘会自动转向
- 支持拖拽移动

## 交给灵刃小任务

右键桌宠，选择 `交给灵刃小任务`，输入任务和工作目录后点击 `交给灵刃`。应用会调用当前电脑上的本地 `codex exec`。

这个能力是可选能力：桌宠本体不依赖 Codex CLI；如果目标电脑没有安装 Codex CLI，桌宠仍可正常运行，只是任务执行会失败并在任务面板中显示错误。

任务日志在开发运行时写入项目 `tasks/`，打包运行时写入系统用户数据目录下的 `tasks/`。

## 直接运行

打包后的 Windows 便携版 exe 不依赖本机开发目录、Node.js、npm 或原始压缩包。把 `release` 里的 exe 复制到其他 Windows 电脑后，双击即可运行。

## 源码运行

```powershell
npm install
npm run validate
npm start
```

## 打包

```powershell
npm run dist:win
```

产物会生成到 `release/`。

## 素材

- `assets/source/`：从 `Spritesheets.zip` 解出的动作 sprite sheet
- `assets/source/cat/FreeCatCharacterAnimations/`：小猫 sprite sheet 和许可证
- `assets/manifest.json`：兼容旧入口的灵刃动作清单
- `assets/manifests/lingren.json`：灵刃形态运行清单
- `assets/manifests/cat.json`：小猫形态运行清单

原始素材单帧为 `600x400`，角色实际只占其中一部分。运行时按清单里的 `trim` 裁剪透明区域后绘制。
