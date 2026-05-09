const {
  categoryPathToFolder,
  configureCloudinary,
  createHttpError,
  formatCloudinaryError,
  normalizeCategoryPath,
  parseDownloadCount,
  parseRequestBody,
  publicIdToCategoryPath,
  readEnv,
  sanitizeFileName,
  sendJsonError,
  setCorsHeaders,
  validateFolderName
} = require("./_utils");

const ROOT_FOLDER = "jianxiaoyun";
const EXTERNAL_LINKS_PUBLIC_ID = `${ROOT_FOLDER}/__config/external_links`;
const MAX_CATEGORY_DEPTH = 5;

module.exports = async (req, res) => {
  setCorsHeaders(res, "GET, POST, DELETE, PUT, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const cloudinary = configureCloudinary();

    if (req.method === "GET") {
      const { categoryPath = "", category = "", subCategory = "" } = req.query || {};
      const queryPath = parseQueryCategoryPath(categoryPath);
      const prefix = queryPath.length
        ? `${categoryPathToFolder(ROOT_FOLDER, queryPath)}/`
        : `${ROOT_FOLDER}/`;

      const resources = await Promise.all(
        ["image", "raw", "video"].map((resourceType) =>
          cloudinary.api.resources({
            type: "upload",
            prefix,
            context: true,
            max_results: 500,
            resource_type: resourceType
          }).catch((error) => {
            if (error?.http_code === 404) {
              return { resources: [] };
            }
            throw error;
          })
        )
      );

      const legacyFilterPath = queryPath.length ? [] : [category, subCategory].filter(Boolean);
      const externalLinks = await loadExternalLinks(cloudinary);
      const files = resources
        .flatMap((result) => result.resources || [])
        .filter((file) => isVisibleResource(file))
        .map((file) => mapCloudinaryFile(file))
        .filter((file) => pathStartsWith(file.categoryPath, queryPath) || pathStartsWith(file.categoryPath, legacyFilterPath))
        .concat(
          externalLinks
            .map((item) => mapExternalLink(item))
            .filter((file) => pathStartsWith(file.categoryPath, queryPath) || pathStartsWith(file.categoryPath, legacyFilterPath))
        )
        .sort((a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime());

      return res.status(200).json({
        success: true,
        files,
        total: files.length
      });
    }

    if (req.method !== "POST" && req.method !== "DELETE" && req.method !== "PUT") {
      throw createHttpError(405, "只允许使用 GET、POST、DELETE 和 PUT 请求");
    }

    const body = await parseRequestBody(req);
    const {
      password = "",
      publicId = "",
      resourceType = "raw",
      targetCategory = "",
      targetSubCategory = "",
      targetCategoryPath = [],
      action = "",
      title = "",
      externalUrl = "",
      extractionCode = ""
    } = body;

    if (password !== readEnv("UPLOAD_PASSWORD")) {
      throw createHttpError(403, "管理员密码错误");
    }

    if (req.method === "POST") {
      if (action !== "addExternalLink") {
        throw createHttpError(400, "无效的新增资料请求");
      }

      const safePath = normalizeTargetPath(targetCategoryPath, targetCategory || body.category || "", targetSubCategory || body.subCategory || "");
      const safeTitle = String(title || "").trim();
      const safeExternalUrl = normalizeExternalUrl(externalUrl);
      const safeExtractionCode = normalizeExtractionCode(extractionCode);

      if (!safeTitle) {
        throw createHttpError(400, "外部资料标题不能为空");
      }

      const externalLinks = await loadExternalLinks(cloudinary);
      const nextItem = {
        id: `external-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title: safeTitle,
        url: safeExternalUrl,
        category: safePath[0] || "",
        subCategory: safePath[1] || "",
        categoryPath: safePath,
        extractionCode: safeExtractionCode,
        uploadTime: new Date().toISOString(),
        downloadCount: 0
      };

      await ensureFolderPlaceholder(cloudinary, categoryPathToFolder(ROOT_FOLDER, safePath));
      externalLinks.unshift(nextItem);
      await saveExternalLinks(cloudinary, externalLinks);

      return res.status(200).json({
        success: true,
        message: "外部下载链接资料添加成功",
        file: mapExternalLink(nextItem)
      });
    }

    const safePublicId = String(publicId || "").trim();
    const safeResourceType = String(resourceType || "raw").trim() || "raw";
    if (!safePublicId) {
      throw createHttpError(400, "缺少文件标识 publicId");
    }

    if (safePublicId.startsWith("external::")) {
      return handleExternalFileRequest({
        req,
        res,
        cloudinary,
        publicId: safePublicId,
        targetCategory,
        targetSubCategory,
        targetCategoryPath
      });
    }

    if (req.method === "DELETE") {
      const currentPath = publicIdToCategoryPath(safePublicId, ROOT_FOLDER, MAX_CATEGORY_DEPTH);
      const deleteResult = await cloudinary.api.delete_resources([safePublicId], {
        resource_type: safeResourceType,
        type: "upload",
        invalidate: true
      });

      const deletedStatus = deleteResult?.deleted?.[safePublicId];
      if (deletedStatus && deletedStatus !== "deleted") {
        throw createHttpError(404, `文件删除失败：${deletedStatus}`);
      }

      if (currentPath.length) {
        await ensureFolderPlaceholder(cloudinary, categoryPathToFolder(ROOT_FOLDER, currentPath));
      }

      return res.status(200).json({
        success: true,
        message: "文件删除成功"
      });
    }

    const nextPath = normalizeTargetPath(targetCategoryPath, targetCategory, targetSubCategory);
    const currentFile = await cloudinary.api.resource(safePublicId, {
      resource_type: safeResourceType,
      type: "upload"
    }).catch((error) => {
      if (error?.http_code === 404) {
        throw createHttpError(404, "文件不存在");
      }
      throw error;
    });

    const currentName = String(safePublicId).split("/").pop() || "file";
    const nextPublicId = `${categoryPathToFolder(ROOT_FOLDER, nextPath)}/${sanitizeFileName(currentName)}`;

    if (nextPublicId === safePublicId) {
      throw createHttpError(400, "文件已经在所选栏目中，无需移动");
    }

    const renameResult = await cloudinary.uploader.rename(safePublicId, nextPublicId, {
      resource_type: safeResourceType,
      overwrite: false,
      invalidate: true
    });

    return res.status(200).json({
      success: true,
      message: "文件移动成功",
      file: mapCloudinaryFile({
        ...currentFile,
        public_id: renameResult.public_id || nextPublicId,
        secure_url: renameResult.secure_url || currentFile.secure_url
      })
    });
  } catch (error) {
    console.error("files api error:", error);
    if (!error.statusCode) {
      error.message = formatCloudinaryError(error, "文件接口处理失败");
    }
    return sendJsonError(res, error, "文件接口处理失败");
  }
};

async function handleExternalFileRequest({ req, res, cloudinary, publicId, targetCategory, targetSubCategory, targetCategoryPath }) {
  const externalLinks = await loadExternalLinks(cloudinary);
  const externalId = publicId.replace(/^external::/, "");
  const targetIndex = externalLinks.findIndex((item) => item.id === externalId);

  if (targetIndex === -1) {
    throw createHttpError(404, "外部资料不存在");
  }

  if (req.method === "DELETE") {
    const removedItem = externalLinks[targetIndex];
    externalLinks.splice(targetIndex, 1);
    await saveExternalLinks(cloudinary, externalLinks);

    const removedPath = normalizeExternalCategoryPath(removedItem);
    if (removedPath.length) {
      await ensureFolderPlaceholder(cloudinary, categoryPathToFolder(ROOT_FOLDER, removedPath));
    }

    return res.status(200).json({
      success: true,
      message: "外部资料删除成功"
    });
  }

  const safePath = normalizeTargetPath(targetCategoryPath, targetCategory, targetSubCategory);
  externalLinks[targetIndex] = {
    ...externalLinks[targetIndex],
    category: safePath[0] || "",
    subCategory: safePath[1] || "",
    categoryPath: safePath
  };
  await saveExternalLinks(cloudinary, externalLinks);

  return res.status(200).json({
    success: true,
    message: "外部资料移动成功",
    file: mapExternalLink(externalLinks[targetIndex])
  });
}

function mapCloudinaryFile(file) {
  const parts = String(file.public_id || "").split("/");
  const categoryPath = publicIdToCategoryPath(file.public_id, ROOT_FOLDER, MAX_CATEGORY_DEPTH);
  const rawName = parts[parts.length - 1] || "";
  const displayName = rawName.includes("_") ? rawName.split("_").slice(1).join("_") : rawName;
  const displayType = resolveDisplayFileType(displayName || rawName, file);
  const resourceType = file.resource_type || "raw";
  const downloadQuery = new URLSearchParams({
    publicId: String(file.public_id || ""),
    resourceType,
    fileName: displayName || rawName
  });

  return {
    name: displayName || rawName,
    url: file.secure_url,
    publicId: file.public_id,
    resourceType,
    downloadCount: parseDownloadCount(file),
    downloadUrl: `/api/download?${downloadQuery.toString()}`,
    type: displayType,
    size: formatFileSize(file.bytes),
    category: categoryPath[0] || "",
    subCategory: categoryPath[1] || "",
    categoryPath,
    uploadTime: file.created_at
      ? new Date(file.created_at).toLocaleString("zh-CN", { hour12: false })
      : "未知"
  };
}

function isVisibleResource(file) {
  const publicId = String(file?.public_id || "").trim();
  if (!publicId || publicId.endsWith("/__placeholder")) {
    return false;
  }

  const parts = publicId.split("/").filter(Boolean);
  return parts[0] === ROOT_FOLDER && parts[1] !== "__config";
}

function mapExternalLink(item) {
  const categoryPath = normalizeExternalCategoryPath(item);
  return {
    name: item.title,
    url: item.url,
    publicId: `external::${item.id}`,
    resourceType: "external",
    downloadCount: Number(item.downloadCount || 0),
    downloadUrl: item.url,
    type: "外部链接",
    size: "外部资源",
    category: categoryPath[0] || "",
    subCategory: categoryPath[1] || "",
    categoryPath,
    extractionCode: item.extractionCode || "无",
    uploadTime: item.uploadTime
      ? new Date(item.uploadTime).toLocaleString("zh-CN", { hour12: false })
      : "未知",
    isExternal: true
  };
}

function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) {
    return "未知";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function resolveDisplayFileType(fileName, file) {
  const extension = getFileExtension(fileName);
  if (extension) {
    return extension.toUpperCase();
  }

  const fallbackFormat = String(file?.format || "").trim();
  if (fallbackFormat && fallbackFormat.toLowerCase() !== "raw") {
    return fallbackFormat.toUpperCase();
  }

  const fallbackResourceType = String(file?.resource_type || "").trim();
  if (fallbackResourceType && fallbackResourceType.toLowerCase() !== "raw") {
    return fallbackResourceType.toUpperCase();
  }

  return "未知";
}

function getFileExtension(fileName) {
  const normalized = String(fileName || "").trim();
  const match = normalized.match(/\.([a-z0-9]{1,12})$/i);
  return match?.[1] ? match[1].toLowerCase() : "";
}

async function loadExternalLinks(cloudinary) {
  try {
    const resource = await cloudinary.api.resource(EXTERNAL_LINKS_PUBLIC_ID, {
      resource_type: "raw",
      type: "upload",
      context: true
    });
    const encoded = String(
      resource?.context?.custom?.external_links ||
      resource?.context?.external_links ||
      ""
    ).trim();

    if (!encoded) {
      return [];
    }

    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return normalizeExternalLinks(JSON.parse(decoded));
  } catch (error) {
    if (error?.http_code !== 404) {
      console.error("load external links failed:", error);
    }
    return [];
  }
}

async function saveExternalLinks(cloudinary, links) {
  const normalized = normalizeExternalLinks(links);
  const encoded = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64");
  const placeholder = "data:text/plain;base64,bGlua3M=";

  await cloudinary.uploader.upload(placeholder, {
    resource_type: "raw",
    public_id: EXTERNAL_LINKS_PUBLIC_ID,
    overwrite: true,
    invalidate: true,
    context: `external_links=${encoded}`
  });
}

function normalizeExternalLinks(links) {
  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map((item) => {
      const categoryPath = normalizeExternalCategoryPath(item);
      return {
        id: String(item?.id || "").trim(),
        title: String(item?.title || "").trim(),
        url: normalizeExternalUrl(item?.url || ""),
        category: categoryPath[0] || "",
        subCategory: categoryPath[1] || "",
        categoryPath,
        extractionCode: normalizeExtractionCode(item?.extractionCode || ""),
        uploadTime: String(item?.uploadTime || new Date().toISOString()).trim(),
        downloadCount: Number.isFinite(Number(item?.downloadCount)) ? Number(item.downloadCount) : 0
      };
    })
    .filter((item) => item.id && item.title && item.url && item.categoryPath.length);
}

function normalizeExternalCategoryPath(item) {
  if (Array.isArray(item?.categoryPath) && item.categoryPath.length) {
    return normalizeCategoryPath(item.categoryPath).slice(0, MAX_CATEGORY_DEPTH);
  }
  return normalizeCategoryPath([item?.category, item?.subCategory].filter(Boolean)).slice(0, MAX_CATEGORY_DEPTH);
}

function normalizeTargetPath(targetCategoryPath, targetCategory, targetSubCategory) {
  const path = Array.isArray(targetCategoryPath) && targetCategoryPath.length
    ? targetCategoryPath
    : [targetCategory, targetSubCategory].filter(Boolean);
  const safePath = normalizeCategoryPath(path).slice(0, MAX_CATEGORY_DEPTH);
  if (safePath.length < 1) {
    throw createHttpError(400, "请选择目标栏目");
  }
  return safePath;
}

function parseQueryCategoryPath(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? normalizeCategoryPath(parsed).slice(0, MAX_CATEGORY_DEPTH) : [];
  } catch (error) {
    return [];
  }
}

function pathStartsWith(path, prefix) {
  if (!prefix.length) {
    return true;
  }
  if (path.length < prefix.length) {
    return false;
  }
  return prefix.every((part, index) => path[index] === part);
}

function normalizeExternalUrl(value) {
  const raw = String(value || "").trim();
  let parsed;

  try {
    parsed = new URL(raw);
  } catch (error) {
    throw createHttpError(400, "外部下载链接格式无效");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createHttpError(400, "外部下载链接仅支持 http 或 https");
  }

  return parsed.toString();
}

async function ensureFolderPlaceholder(cloudinary, folderPath) {
  const resources = await Promise.all(
    ["raw", "image", "video"].map((resourceType) =>
      cloudinary.api.resources({
        type: "upload",
        prefix: `${folderPath}/`,
        max_results: 2,
        resource_type: resourceType
      }).catch((error) => {
        if (error?.http_code === 404) {
          return { resources: [] };
        }
        throw error;
      })
    )
  );

  const hasActualFile = resources
    .flatMap((result) => result.resources || [])
    .some((item) => !String(item.public_id || "").endsWith("/__placeholder"));

  if (hasActualFile) {
    return;
  }

  const placeholder = "data:text/plain;base64,cGxhY2Vob2xkZXI=";
  const placeholderPublicId = `${folderPath}/__placeholder`;
  await cloudinary.uploader.upload(placeholder, {
    resource_type: "raw",
    public_id: placeholderPublicId,
    overwrite: true
  });
}

function normalizeExtractionCode(value) {
  const normalized = String(value || "").trim();
  return normalized || "无";
}
