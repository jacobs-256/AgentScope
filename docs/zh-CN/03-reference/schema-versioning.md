# Schema 版本管理

> Language: [English](../../SCHEMA_VERSIONING.md) | zh-CN

AgentScope trace JSON 现在使用稳定的 `traceVersion` 字段。

## 当前版本

当前稳定 trace schema 版本是：

```text
1.0
```

由浏览器导入器、实时捕获 CLI、脱敏导出和静态报告生成的新 AgentScope trace 应包含：

```json
{
  "traceVersion": "1.0"
}
```

## 兼容性

导入器在加载旧的未版本化 trace 时，会将其规范化为 `traceVersion: "1.0"`。这样既能继续查看旧样例文件和旧本地捕获，也能为新工具提供稳定的版本标记。

## 变更策略

当 JSON 结构保持兼容时，patch-level 导入器改进应保持 `traceVersion` 不变。

只有当字段被移除、重命名或语义被实质性重新解释，导致 trace producer 或 consumer 必须改变行为时，才使用新的 schema 版本。

## 验证

修改 schema 行为前请运行导入器 fixture 测试套件：

```bash
npm test
```

测试套件会验证支持的 fixtures、必需 step 字段、导入器特定 metadata、tool-result 配对、token 提取和 `traceVersion`。
