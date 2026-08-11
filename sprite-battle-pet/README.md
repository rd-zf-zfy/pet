# 灵刃桌宠

基于 `Spritesheets.zip` 制作的独立战斗型透明桌宠。

## 功能

- 待机、跑动、跳跃、攻击、受击、倒下
- 左键点击触发攻击，连续点击会受击扣血
- 血量归零后倒下，再点击或右键复活
- 右键菜单可触发攻击、跳跃、受击、倒下、复活、左右跑动和尺寸切换
- 碰到屏幕边缘会自动转向
- 支持拖拽移动

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
- `assets/manifest.json`：动作清单和裁剪参数

原始素材单帧为 `600x400`，角色实际只占其中一部分。运行时按清单里的 `trim` 裁剪透明区域后绘制。
