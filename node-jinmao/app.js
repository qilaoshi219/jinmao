// ==================== 环境变量加载（必须在所有模块 import/require 之前） ====================
// dotenv 将 .env 文件中的配置注入到 process.env，使后续模块能读取敏感凭据
require("dotenv").config();

const http = require('http');
const server=http.createServer((req,res)=>{
    res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
    res.end('这是我的第一个Node.js服务器！');
    console.log(`这是请求的req：`,req);
    console.log(`这是请求的res：`,res);
});
const port=8888;
server.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
});