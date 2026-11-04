# 工坊动作图鉴 / Workshop motion gallery

五位伙伴各有 11 类活动，像素风和手绘风各有 **55 套循环**。默认使用像素风，通过「显示 → 头像风格」或「房间偏好 → 头像风格」可切换。房间偏好中的动作图鉴会显示当前风格。

Five companions perform **55 activity loops per style**. Pixel is the default. Switch with **View → Avatar Style** or **Room preferences → Avatar style**. The motion gallery in Room preferences follows your selection.

## 像素风 / Pixel

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="pixel-overview.png">
  <img src="pixel-overview.gif" width="1100" alt="像素工坊，五个合成状态 / Pixel Workshop, five synthetic activities">
</picture>

五张卡片由原生渲染器使用合成会话采样。预览把循环相位同步到 3 秒，应用按各自的时长播放。The native preview synchronizes five synthetic loops to three seconds. Each activity keeps its own timing in the app.

[静态预览 / Still](pixel-overview.png) · [原创素材声明 / Artwork notice](../../office/assets/WORKSHOP-ARTWORK-NOTICE.md) · [像素帧节拍 / Cel timings](../../office/renderer/creature-frame-manifest.js)

每位伙伴的九张表情帧包括眨眼、左右瞥视、两张招手帧、受惊、两张访客彩蛋帧和工具成功后的轻微表情。眨眼只改变眼睛的像素，身体轮廓和脚底沿用待命姿态。装饰访客偶尔会展示纸鹤、墨泡、苔花、纱线爱心或暖光星星。

Each companion has nine expression cels. The blink changes only the eye pixels. Rare visitor expressions show a paper crane, ink bubble, moss blossom, yarn heart or glowing star. [访客彩蛋预览 / Visitor expression preview](pixel-expressions.png).

## 手绘风 / Painted

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="painted-overview.png">
  <img src="painted-overview.gif" width="1100" alt="手绘工坊，五个合成状态 / Painted Workshop, five synthetic activities">
</picture>

上图是原工坊位图渲染器的离线采样。录制用五个合成会话把循环统一为 3 秒、36 帧。应用中的手绘风保留各自原有节拍和帧间过渡。

The archived recording samples five synthetic activities from the painted renderer. The recording normalizes cycles to three seconds and 36 frames for comparison. The app uses each activity's original timing and blends. [静态预览 / Still](painted-overview.png) · [录制清单 / Capture manifest](painted-manifest.json)

手绘风的动作图鉴也保留了每个活动的十套矢量参考动作。The painted gallery also keeps ten vector references per activity.

## 原版录制存档 / Workshop recording archive

以下录制保留原工坊版的 550 套动作库、家具和环境演示，来源见各录制清单。These recordings preserve the previous 550-variation renderer and its furniture and environment demonstrations. [原版总览 / Workshop overview](workshop-demo.svg) · [录制清单 / Recording manifest](manifest.json)

## 十一类活动 / Eleven observed activities

下列 GIF 每张展示原工坊版的五种角色与一个同族小分身。GIF 将原生循环相位同步到 4.2 秒，每张采样 42 帧。

### 阅读 / Reading

![五种材质各自翻阅和研读](reading.gif)

### 检索 / Searching

![五种材质各自寻找和比对线索](searching.gif)

### 构思 / Planning

![五种材质各自推演与排列思路](planning.gif)

### 编码 / Coding

![五种材质持续输入的不同手势](coding.gif)

### 设计 / Designing

![五种材质在各自画面上绘制和调整](designing.gif)

### 测试 / Testing

![五种材质检查与比较，不虚构通过结果](testing.gif)

### 构建 / Building

![五种材质各自装配结构](building.gif)

### 运行 / Running

![五种材质观察已经运转的装置](running.gif)

### 等待工具 / Waiting for tools

![装置停止，保留等待姿势](waiting-tool.gif)

### 等待用户 / Waiting for you

![五种材质保留请求与可接取的道具](waiting-user.gif)

### 异常排查 / Blocked by error

![五种材质保持受阻，不自行解开故障](error.gif)

## 独立的家具与互动演示 / Independent prop recordings

这些较早的公开媒体使用项目原创胶囊示意角色或透明端点；它们不是当前五种工坊角色的外观预览。保留它们用于查看真实道具程序，并在各自 manifest 中注明录制版本与范围。没有使用本地恢复的受限角色图片，也不证明真实房间导航、身体接触或 IK。

### 家具到站响应 / Twelve furniture responses

[录制范围与原生采样清单](stations/manifest.json)。三个主题各四种家具，采用真实 `OfficeStationArrival` 程序，48 fps、72 帧。透明合成端点只用来提供锚点。

![工坊家具响应](stations/workshop.gif)
![茶舍家具响应](stations/teahouse.gif)
![星台家具响应](stations/observatory.gif)

### 双人道具互动 / Twelve pair interactions

[录制范围与原生采样清单](social/manifest.json)。这些是原创胶囊示意角色之间的道具编舞，48 fps、168 帧；不是当前角色身体接触的录屏。

![工坊双人道具](social/workshop.gif)
![茶舍双人道具](social/teahouse.gif)
![星台双人道具](social/observatory.gif)

### 旧关节接口参考 / Legacy joint interface reference

[录制范围与原生采样清单](lifecycle/manifest.json)。原创胶囊示意角色展示旧关节接口的距离步态，以及分身凝聚、归返道具。四足在固定锚点演示，不代表当前房间路线或真实脚底接触证明。

![旧关节接口的原地距离步态](lifecycle/walking.gif)
![分身凝聚道具](lifecycle/split.gif)
![分身归返道具](lifecycle/absorb.gif)

## 重新导出像素预览 / Reproduce the pixel preview

在仓库根目录运行，使用本地 Electron 与 ffmpeg。

```sh
MINI_OFFICE_PREVIEW_DIR=/tmp/office-pixel-preview MINI_OFFICE_CAPTURE_MOTION=1 \
  office/node_modules/.bin/electron office/test/creature-frames-renderer.cjs
ffmpeg -framerate 12 -i /tmp/office-pixel-preview/pixel-%03d.png \
  -filter_complex '[0:v]split[a][b];[a]palettegen=reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle' \
  -loop 0 docs/animations/pixel-overview.gif
cp /tmp/office-pixel-preview/pixel-lineup.png docs/animations/pixel-overview.png
cp /tmp/office-pixel-preview/pixel-expressions.png docs/animations/pixel-expressions.png
```

[返回项目首页 / Project home](../../README.md)
