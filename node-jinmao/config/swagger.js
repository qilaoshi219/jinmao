// ==================== OpenAPI 文档配置 ====================
// 职责：集中管理 swagger-jsdoc 的配置，生成 OpenAPI 3.0 规范对象
// 通过扫描 API/*.js 中的 @openapi JSDoc 注释自动生成 API 文档
// 配合 @scalar/express-api-reference 渲染现代化的交互式文档页面
//
// 注意：swagger-jsdoc v7+ 是纯 ESM 包，无法在 CommonJS 中使用 require()
// 因此导出异步工厂函数 getSwaggerSpec()，内部使用动态 import() 加载

// swagger-jsdoc 配置选项（独立导出，方便复用）
const options = {
  // OpenAPI 规范定义（API 元信息）
  definition: {
    openapi: "3.0.0", // OpenAPI 规范版本
    info: {
      title: "JinMao API", // API 文档标题
      version: "1.0.0", // API 版本号
      description: "JinMao 项目 API 接口文档\n\n支持邮箱验证码登录/注册，返回 JWT Token。", // API 描述
      contact: {
        name: "JinMao Team", // 联系人/团队
      },
    },
    // 服务器列表（Scalar UI 中可选择切换）
    servers: [
      {
        url: "http://localhost:8888", // 本地开发服务器地址
        description: "本地开发服务器",
      },
    ],
    // 认证方案定义（Scalar UI 中会显示 "Authorize" 按钮供输入 Token）
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",           // HTTP 认证方案
          scheme: "bearer",       // Bearer Token 方式
          bearerFormat: "JWT",    // Token 格式为 JWT
          description: "输入 JWT Token（不含 Bearer 前缀）。先调用 POST /api/v1/login 获取 Token。",
        },
      },
    },
    // 标签分组（接口按标签归类显示）
    tags: [
      {
        name: "认证",
        description: "邮箱验证码登录/注册相关接口",
      },
    ],
  },
  // 扫描路径：API 目录下所有 JS 文件
  // swagger-jsdoc 会解析这些文件中的 /** @openapi ... */ 注释
  apis: ["./API/*.js", "./API/book/*.js"],
};

/**
 * 异步生成 OpenAPI 规范对象
 * swagger-jsdoc v7+ 是纯 ESM 模块，必须使用动态 import() 加载
 * @returns {Promise<Object>} OpenAPI 3.0 规范对象
 */
async function getSwaggerSpec() {
  // 动态导入 swagger-jsdoc（ESM-only 包）
  const swaggerJsdocModule = await import("swagger-jsdoc");
  // swagger-jsdoc 导出形式可能是 { default: fn } 或直接 fn
  const swaggerJsdoc = swaggerJsdocModule.default || swaggerJsdocModule;

  // 生成 OpenAPI 规范对象
  const swaggerSpec = swaggerJsdoc(options);

  console.log(
    "[swagger] OpenAPI 规范已生成，包含 " +
      (swaggerSpec.paths ? Object.keys(swaggerSpec.paths).length : 0) +
      " 个接口。"
  );

  return swaggerSpec;
}

// 导出异步工厂函数，供 app.js 在 async IIFE 中调用
module.exports = getSwaggerSpec;
