# 桌宠完整设计

## 风格定义

项目风格为 **32x32 像素猫咪桌宠**。

核心约束：

- 使用 `FreeCatCharacterAnimations.zip` 中的猫咪序列帧，保持像素边缘和透明背景。
- 不引入高分辨率立绘、半写实渲染或俯视游戏素材。
- 主状态优先复用 idle、run、jump、fall 四组猫咪序列帧，避免角色比例漂移。
- 情绪表达以像素图标、气泡、轻微位移和道具辅助，不强行重画复杂面部。

## 素材系统

原始素材：

- `1_Cat_Idle-Sheet.png`
- `2_Cat_Run-Sheet.png`
- `3_Cat_Jump-Sheet.png`
- `4_Cat_Fall-Sheet.png`

状态映射：

- `idle` / `sleep`：使用 idle 序列帧。
- `walk` / `run`：使用 run 序列帧，左移时通过 Canvas 镜像绘制。
- `happy` / `surprised` / `dragged`：使用 jump 序列帧。
- `angry` / `fall`：使用 fall 序列帧。

新增交互素材：

- 点击特效：`click_heart.png`、`click_star.png`、`click_exclaim.png`
- 气泡：`speech_bubble.png`、`thought_bubble.png`、`angry_bubble.png`
- 道具：`pillow.png`、`snack.png`、`ball.png`、`gift.png`

## 行为设计

基础循环：

1. 待机
2. 随机走路或奔跑
3. 偶尔睡觉
4. 点击触发开心/惊讶/生气
5. 拖拽时进入 dragged 状态
6. 右键菜单触发指定动作

交互反馈：

- 单击：循环触发开心、惊讶、生气。
- 拖拽：透明窗口跟随鼠标，角色进入被拖拽状态。
- 右键：打开桌宠菜单。
- 向左/向右：使用 run 序列帧，向左时镜像绘制。
- 边界转向：窗口碰到或接近屏幕左/右/上/下边界时，主进程回传碰撞边，渲染层也会定期主动探测窗口位置，角色自动换成相反方向继续移动。
- 尺寸：默认启动为“迷你”，右键菜单支持“迷你 / 小 / 正常 / 大”四档。
- 喂零食：显示零食道具并开心。
- 给小球：显示小球并奔跑。
- 送礼物：先惊讶再开心。

## 技术实现

运行技术：

- Electron 透明 frameless 窗口
- Canvas 绘制像素 sprite sheet
- `image-rendering: pixelated` 保持像素风
- IPC 控制窗口移动、拖拽、缩放和右键菜单

素材生成：

- `tools/generate-assets.ps1`
- 使用 Windows PowerShell + .NET `System.Drawing`
- 不依赖 Python
- 当前猫咪主动画直接使用解包后的 PNG，旧生成脚本仍保留给气泡、特效、道具等扩展资源。

## 后续可扩展

优先级较高：

- 补真实手绘睡觉/摔倒帧，替换当前旋转派生版。
- 加更多短台词和心情值。
- 加喂食冷却、好感度、随机提醒。
- 加启动配置：是否置顶、默认尺寸、随机行为频率。

优先级较低：

- 托盘图标。
- 自动更新。
- 多角色切换。
