const {
  categoryPathToFolder,
  configureCloudinary,
  createHttpError,
  formatCloudinaryError,
  normalizeCategoryPath,
  parseRequestBody,
  readEnv,
  sanitizeFileName,
  sendJsonError,
  setCorsHeaders,
  validateFolderName
} = require("./_utils");

const ROOT_FOLDER = "jianxiaoyun";

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
    const cloudinary = configureCloudinary();
    const {
      password = "",
      fileName = "",
      category = "",
      subCategory = "",
      categoryPath = []
    } = await parseRequestBody(req);

    if (password !== readEnv("UPLOAD_PASSWORD")) {
      return res.status(403).json({
        success: false,
        error: "管理员密码错误"
      });
    }

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: "缺少文件名"
      });
    }

    const safePath = normalizeCategoryPath(
      Array.isArray(categoryPath) && categoryPath.length
        ? categoryPath
        : [category, subCategory].filter(Boolean)
    );
    if (safePath.length < 1) {
      throw createHttpError(400, "请选择目标栏目");
    }

    const folderPath = categoryPathToFolder(ROOT_FOLDER, safePath);
    await ensureFolderExists(folderPath);

    const publicId = `${folderPath}/${Date.now()}_${sanitizeFileName(fileName)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const context = "download_count=0";
    const overwrite = "false";
    const signature = cloudinary.utils.api_sign_request(
      {
        context,
        overwrite,
        public_id: publicId,
        timestamp
      },
      readEnv("CLOUDINARY_API_SECRET")
    );

    return res.status(200).json({
      success: true,
      cloudName: readEnv("CLOUDINARY_CLOUD_NAME"),
      apiKey: readEnv("CLOUDINARY_API_KEY"),
      resourceType: "raw",
      context,
      overwrite,
      publicId,
      signature,
      timestamp
    });
  } catch (error) {
    console.error("upload api error:", error);
    if (!error.statusCode) {
      error.message = formatCloudinaryError(error, "上传失败");
    }
    return sendJsonError(res, error, "上传失败");
  }
};

async function ensureFolderExists(folderPath) {
  const cloudinary = configureCloudinary();
  const placeholder = "data:text/plain;base64,cGxhY2Vob2xkZXI=";
  const publicId = `${folderPath}/__placeholder`;

  try {
    await cloudinary.uploader.upload(placeholder, {
      resource_type: "raw",
      public_id: publicId,
      overwrite: false
    });
  } catch (error) {
    if (!String(error.message || "").includes("already exists")) {
      throw error;
    }
  }
}
