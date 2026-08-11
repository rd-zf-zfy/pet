# 蓝羽桌宠 macOS 版本说明

Electron 本身支持 macOS，本项目已包含 macOS 运行和打包配置。

## 直接运行

在 macOS 终端中执行：

```bash
npm install
npm start
```

也可以给启动脚本加执行权限后双击运行：

```bash
chmod +x start-lanyu-pet.command
```

## 打包为 .app / .dmg

建议在 macOS 中构建：

```bash
npm install
npm run validate
npm run dist:mac
```

输出目录：

```text
release/
```

## 注意

- macOS 正式分发通常需要 Apple Developer 账号做签名和 notarization。
- 当前配置适合本机运行、内部测试和未签名安装包。
- 素材已经包含在 `assets/` 目录里，macOS 运行不需要执行 `npm run assets`。
- `npm run assets` 是 Windows PowerShell 版本，只用于开发期重新生成蓝羽派生素材。
