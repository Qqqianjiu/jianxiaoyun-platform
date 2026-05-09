const { getMissingEnv, setCorsHeaders } = require("./_utils");

module.exports = async (req, res) => {
  setCorsHeaders(res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res.status(200).json({
    success: true,
    message: "API is working",
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false }),
    method: req.method,
    missingEnv: getMissingEnv([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
      "UPLOAD_PASSWORD"
    ])
  });
};
