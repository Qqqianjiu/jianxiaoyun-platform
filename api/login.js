const {
  parseRequestBody,
  requirePasswordEnv,
  sendJsonError,
  setCorsHeaders
} = require("./_utils");

module.exports = async (req, res) => {
  setCorsHeaders(res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "只允许使用 POST 请求"
    });
  }

  try {
    const { password = "" } = await parseRequestBody(req);
    const expectedPassword = requirePasswordEnv();

    if (password !== expectedPassword) {
      return res.status(403).json({
        success: false,
        error: "管理员密码错误"
      });
    }

    return res.status(200).json({
      success: true,
      message: "登录成功"
    });
  } catch (error) {
    console.error("login api error:", error);
    return sendJsonError(res, error, "登录校验失败");
  }
};
