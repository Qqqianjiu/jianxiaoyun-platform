const {
  configureCloudinary,
  formatCloudinaryError,
  getMissingEnv,
  parseRequestBody,
  readEnv,
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
      error: "Only POST is allowed"
    });
  }

  try {
    const { password = "" } = await parseRequestBody(req);
    if (password !== readEnv("UPLOAD_PASSWORD")) {
      return res.status(403).json({
        success: false,
        error: "Wrong admin password"
      });
    }

    const cloudName = readEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = readEnv("CLOUDINARY_API_KEY");
    const apiSecret = readEnv("CLOUDINARY_API_SECRET");
    const uploadPassword = readEnv("UPLOAD_PASSWORD");
    const cloudinaryUrl = readEnv("CLOUDINARY_URL");

    let cloudinaryCheck = null;
    try {
      const cloudinary = configureCloudinary();
      const ping = await cloudinary.api.ping();
      cloudinaryCheck = {
        success: true,
        result: ping?.status || ping || null
      };
    } catch (error) {
      cloudinaryCheck = {
        success: false,
        message: formatCloudinaryError(error, "")
      };
    }

    return res.status(200).json({
      success: true,
      env: {
        vercelEnv: process.env.VERCEL_ENV || null,
        nodeEnv: process.env.NODE_ENV || null,
        cloudinaryCloudName: summarize(cloudName),
        cloudinaryApiKey: summarize(apiKey),
        cloudinaryApiSecret: summarize(apiSecret),
        uploadPassword: summarize(uploadPassword),
        cloudinaryUrl: summarize(cloudinaryUrl)
      },
      checks: {
        missingEnv: getMissingEnv([
          "CLOUDINARY_CLOUD_NAME",
          "CLOUDINARY_API_KEY",
          "CLOUDINARY_API_SECRET",
          "UPLOAD_PASSWORD"
        ]),
        cloudNameLooksLikeUrl: cloudName.startsWith("cloudinary://"),
        apiKeyLooksLikeUrl: apiKey.startsWith("cloudinary://"),
        apiSecretLooksLikeUrl: apiSecret.startsWith("cloudinary://"),
        uploadPasswordLooksLikeApiKey: uploadPassword.startsWith("sk_"),
        cloudNameHasWhitespace: hasOuterWhitespace(process.env.CLOUDINARY_CLOUD_NAME),
        apiKeyHasWhitespace: hasOuterWhitespace(process.env.CLOUDINARY_API_KEY),
        apiSecretHasWhitespace: hasOuterWhitespace(process.env.CLOUDINARY_API_SECRET),
        uploadPasswordHasWhitespace: hasOuterWhitespace(process.env.UPLOAD_PASSWORD),
        cloudinaryPing: cloudinaryCheck
      }
    });
  } catch (error) {
    return sendJsonError(res, error, "Debug endpoint failed");
  }
};

function summarize(value) {
  const text = String(value || "");
  if (!text) {
    return {
      exists: false,
      length: 0,
      preview: ""
    };
  }

  if (text.length <= 4) {
    return {
      exists: true,
      length: text.length,
      preview: `${text[0]}***`
    };
  }

  return {
    exists: true,
    length: text.length,
    preview: `${text.slice(0, 2)}***${text.slice(-2)}`
  };
}

function hasOuterWhitespace(value) {
  const text = String(value || "");
  return text !== text.trim();
}
