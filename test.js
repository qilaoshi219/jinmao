// 测试generate_outline函数是否能正常生成大纲
const yuanwen = "这是一个测试文章，用于测试大纲生成功能。";
const pptother = "客户暂未设置额外的ppt风格";
const generateOutline = require("./node-jinmao/utils/generate_outline.js").generateOutline;
generateOutline(yuanwen, pptother).then(outline => {
    console.log("生成的大纲:", outline);
});
