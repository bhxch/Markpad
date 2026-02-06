# Kroki 绘图语言支持清单

Markpad 通过集成 [Kroki](https://kroki.io) 提供了强大的图表渲染能力。除了内置支持的 **Mermaid** 以外，你还可以在 Markdown 中使用以下代码块名称进行绘图：

| Markdown Code Name | 对应绘图语言 / 工具 | 说明 |
| :--- | :--- | :--- |
| `plantuml` | **PlantUML** | 通用建模语言（UML、时序图、架构图等） |
| `c4plantuml` | **C4 with PlantUML** | 专门用于 C4 模型架构图 |
| `graphviz` / `dot` | **GraphViz** | 基于 DOT 语言的结构化图形绘制 |
| `ditaa` | **ditaa** | 将 ASCII 艺术图转换为位图/矢量图 |
| `excalidraw` | **Excalidraw** | 手绘风格的白板绘图 |
| `blockdiag` | **blockdiag** | 块图生成工具 |
| `nwdiag` | **nwdiag** | 网络拓扑图生成工具 |
| `actdiag` | **actdiag** | 活动图生成工具 |
| `seqdiag` | **seqdiag** | 顺序图（时序图）生成工具 |
| `erd` | **Entity Relationship** | 实体关系图（数据库建模） |
| `nomnoml` | **Nomnoml** | 简单的 UML 类图工具 |
| `bpmn` | **BPMN** | 业务流程建模标注 |
| `pikchr` | **Pikchr** | 类似于 pic 的图表语言 |
| `svgbob` | **Svgbob** | 将 ASCII 文本转换为平滑的 SVG 图表 |
| `vega` | **Vega** | 声明式可视化语法 |
| `vegalite` | **Vega-Lite** | 高级声明式可视化语法 |

## 使用示例

### PlantUML 示例
\\\plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi!
@enduml
\\\

### Ditaa (ASCII) 示例
\\\ditaa
+--------+   +-------+
|  User  |-->|  App  |
+--------+   +-------+
\\\

## 注意事项
1. **自动主题适配**：在深色模式下，系统会自动对生成的图片应用反色滤镜，确保在暗色背景下清晰可见。
2. **网络依赖**：Kroki 渲染需要联网访问 kroki.io 服务。
