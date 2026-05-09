function setCorsHeaders(res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return safeParseJson(req.body);
  }

  const rawBody = await readRequestStream(req);
  if (!rawBody) {
    return {};
  }

  return safeParseJson(rawBody);
}

function safeParseJson(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw createHttpError(400, "Request body is not valid JSON");
  }
}

function readRequestStream(req) {
  return new Promise((resolve, reject) => {
    if (!req || typeof req.on !== "function") {
      resolve("");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function getMissingEnv(names) {
  return names.filter((name) => !readEnv(name));
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendJsonError(res, error, fallbackMessage) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = error?.message || fallbackMessage || "Server error";

  return res.status(statusCode).json({
    success: false,
    error: message
  });
}

function configureCloudinary() {
  let cloudinary;
  try {
    cloudinary = require("cloudinary").v2;
  } catch (error) {
    throw createHttpError(503, "Server dependency missing: cloudinary");
  }

  const missingEnv = getMissingEnv([
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
  ]);

  if (missingEnv.length > 0) {
    throw createHttpError(
      503,
      `Missing server configuration: ${missingEnv.join(", ")}`
    );
  }

  cloudinary.config({
    cloud_name: readEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: readEnv("CLOUDINARY_API_KEY"),
    api_secret: readEnv("CLOUDINARY_API_SECRET")
  });

  return cloudinary;
}

function requirePasswordEnv() {
  const password = readEnv("UPLOAD_PASSWORD");
  if (!password) {
    throw createHttpError(503, "Missing server configuration: UPLOAD_PASSWORD");
  }
  return password;
}

function validateFolderName(name, label) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw createHttpError(400, `${label} is required`);
  }
  if (/[\\?#%\u0000-\u001f]/.test(trimmed) || trimmed.includes("//")) {
    throw createHttpError(400, `${label} contains invalid characters`);
  }
  return trimmed.replace(/^\/+|\/+$/g, "");
}

function cleanPathPart(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function sanitizeFileName(fileName) {
  return String(fileName || "file")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORY_NAME_PREFIX = "__jx_";

function encodeCategoryName(name) {
  return `${CATEGORY_NAME_PREFIX}${Buffer.from(String(name || ""), "utf8").toString("base64url")}`;
}

function decodeCategoryName(segment) {
  const value = String(segment || "");
  if (!value.startsWith(CATEGORY_NAME_PREFIX)) {
    return value;
  }

  try {
    return Buffer.from(value.slice(CATEGORY_NAME_PREFIX.length), "base64url").toString("utf8");
  } catch (error) {
    return value;
  }
}

function normalizeCategoryPath(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((part, index) => validateFolderName(part, `${index + 1}级栏目名称`));
}

function categoryPathToFolder(rootFolder, categoryPath) {
  return `${rootFolder}/${normalizeCategoryPath(categoryPath).map(encodeCategoryName).join("/")}`;
}

function publicIdToCategoryPath(publicId, rootFolder, maxDepth = 5) {
  const parts = String(publicId || "").split("/").filter(Boolean);
  if (parts[0] !== rootFolder || !parts[1] || parts[1] === "__config") {
    return [];
  }

  const categorySegments = parts.slice(1, -1);
  return categorySegments.slice(0, maxDepth).map(decodeCategoryName);
}

function formatCloudinaryError(error, prefix) {
  const message = error?.error?.message || error?.message || "Server error";
  return prefix ? `${prefix}: ${message}` : message;
}

function parseDownloadCount(source) {
  const directValue = source?.context?.download_count;
  const customValue = source?.context?.custom?.download_count;
  const value = directValue ?? customValue ?? 0;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

module.exports = {
  cleanPathPart,
  categoryPathToFolder,
  configureCloudinary,
  createHttpError,
  decodeCategoryName,
  encodeCategoryName,
  formatCloudinaryError,
  getMissingEnv,
  normalizeCategoryPath,
  parseRequestBody,
  parseDownloadCount,
  publicIdToCategoryPath,
  readEnv,
  requirePasswordEnv,
  sanitizeFileName,
  sendJsonError,
  setCorsHeaders,
  validateFolderName
};
