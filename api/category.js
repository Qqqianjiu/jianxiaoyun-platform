const {
  configureCloudinary,
  createHttpError,
  formatCloudinaryError,
  parseRequestBody,
  readEnv,
  sanitizeFileName,
  sendJsonError,
  setCorsHeaders,
  validateFolderName
} = require("./_utils");

const ROOT_FOLDER = "jianxiaoyun";
const ORDER_CONFIG_PUBLIC_ID = `${ROOT_FOLDER}/__config/category_order`;
const MISC_CATEGORY_NAME = "杂项资料";
const MAX_CATEGORY_DEPTH = 5;
const NAME_PREFIX = "__jx_";

module.exports = async (req, res) => {
  setCorsHeaders(res, "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    configureCloudinary();

    if (req.method === "GET") {
      const categories = await getCategories();
      return res.status(200).json({ success: true, categories });
    }

    const {
      password = "",
      action = "",
      categoryName = "",
      newCategoryName = "",
      subCategoryName = "",
      newSubCategoryName = "",
      parentPath = [],
      categoryPath = [],
      order = []
    } = await parseRequestBody(req);

    if (password !== readEnv("UPLOAD_PASSWORD")) {
      return res.status(403).json({
        success: false,
        error: "管理员密码错误"
      });
    }

    if (req.method === "POST") {
      if (action === "addCategory") {
        const safeCategory = validateCategoryPart(categoryName, "1级栏目名称");
        await ensureFolderExists(`${ROOT_FOLDER}/${encodeCategoryName(safeCategory)}`);
        return res.status(200).json({
          success: true,
          message: `1级栏目“${safeCategory}”创建成功`,
          category: { name: safeCategory, path: [safeCategory], children: [], subCategories: [] }
        });
      }

      if (action === "addSubCategory" || action === "addCategoryNode") {
        const parentParts = normalizeCategoryPath(
          parentPath.length ? parentPath : [categoryName].concat(subCategoryName ? [] : [])
        );
        const nextName = validateCategoryPart(
          action === "addCategoryNode" ? newCategoryName : subCategoryName,
          "子栏目名称"
        );
        if (parentParts.length < 1) {
          throw createHttpError(400, "请选择父栏目");
        }
        if (parentParts.length >= MAX_CATEGORY_DEPTH) {
          throw createHttpError(400, `栏目最多只能创建到 ${MAX_CATEGORY_DEPTH} 级`);
        }

        const nextPath = [...parentParts, nextName];
        await ensureFolderExists(toCloudinaryFolder(nextPath));
        return res.status(200).json({
          success: true,
          message: `${nextPath.length}级栏目“${nextName}”创建成功`,
          category: { name: nextName, path: nextPath, children: [], subCategories: [] }
        });
      }
    }

    if (req.method === "PUT") {
      if (action === "renameCategory" || action === "renameSubCategory" || action === "renameCategoryNode") {
        const oldPath = normalizeCategoryPath(
          categoryPath.length ? categoryPath : [categoryName, subCategoryName].filter(Boolean)
        );
        const nextName = validateCategoryPart(
          action === "renameSubCategory" ? newSubCategoryName : newCategoryName,
          "新栏目名称"
        );
        if (oldPath.length < 1) {
          throw createHttpError(400, "请选择要重命名的栏目");
        }

        const nextPath = [...oldPath.slice(0, -1), nextName];
        await renameByPrefix(`${toCloudinaryFolder(oldPath)}/`, `${toCloudinaryFolder(nextPath)}/`);
        return res.status(200).json({
          success: true,
          message: `${oldPath.length}级栏目已重命名为“${nextName}”`
        });
      }

      if (action === "saveOrder") {
        await saveCategoryOrder(order);
        return res.status(200).json({
          success: true,
          message: "栏目排序已保存"
        });
      }
    }

    if (req.method === "DELETE") {
      if (action === "deleteCategory" || action === "deleteSubCategory" || action === "deleteCategoryNode") {
        const deletePath = normalizeCategoryPath(
          categoryPath.length ? categoryPath : [categoryName, subCategoryName].filter(Boolean)
        );
        if (deletePath.length < 1) {
          throw createHttpError(400, "请选择要删除的栏目");
        }

        const result = await deleteCategoryAndMoveFiles(deletePath);
        return res.status(200).json({
          success: true,
          message: `栏目“${deletePath[deletePath.length - 1]}”已删除，${result.movedCount} 个文件已移动到“${result.targetPath.join(" / ")}”`
        });
      }
    }

    return res.status(400).json({
      success: false,
      error: "无效请求"
    });
  } catch (error) {
    console.error("category api error:", error);
    if (!error.statusCode) {
      error.message = formatCloudinaryError(error, "栏目操作失败");
    }
    return sendJsonError(res, error, "栏目操作失败");
  }
};

async function getCategories() {
  const resources = await listResourcesByPrefix(`${ROOT_FOLDER}/`, true);
  const root = [];
  const savedOrder = await loadCategoryOrder();

  resources.forEach((resource) => {
    const parts = splitPublicId(resource.public_id);
    const categoryPath = publicIdPartsToCategoryPath(parts);
    if (categoryPath.length < 1) {
      return;
    }
    addPathToTree(root, categoryPath);
  });

  sortTree(root, savedOrder);
  attachLegacySubCategories(root);
  return root;
}

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

async function renameByPrefix(oldPrefix, newPrefix) {
  const cloudinary = configureCloudinary();
  const resources = await listResourcesByPrefix(oldPrefix, true);
  if (resources.length === 0) {
    throw createHttpError(404, "栏目不存在");
  }

  for (const file of resources) {
    const nextPublicId = file.public_id.replace(oldPrefix, newPrefix);
    await cloudinary.uploader.rename(file.public_id, nextPublicId, {
      resource_type: file.resource_type,
      overwrite: false,
      invalidate: true
    });
  }
}

async function deleteCategoryAndMoveFiles(deletePath) {
  const cloudinary = configureCloudinary();
  const deletePrefixes = buildCompatibleFolderPrefixes(deletePath);
  const resources = await listResourcesByPrefixes(deletePrefixes, true);
  if (resources.length === 0) {
    throw createHttpError(404, "栏目不存在");
  }

  const targetPath = deletePath.length === 1 ? [MISC_CATEGORY_NAME] : deletePath.slice(0, -1);
  await ensureFolderExists(toCloudinaryFolder(targetPath));

  let movedCount = 0;
  for (const file of resources) {
    if (String(file.public_id || "").endsWith("/__placeholder")) {
      continue;
    }

    const fileName = sanitizeFileName(String(file.public_id || "").split("/").pop() || "file");
    let nextPublicId = `${toCloudinaryFolder(targetPath)}/${fileName}`;
    if (nextPublicId === file.public_id) {
      continue;
    }
    nextPublicId = await resolveAvailablePublicId(nextPublicId, file.resource_type);

    try {
      await cloudinary.uploader.rename(file.public_id, nextPublicId, {
        resource_type: file.resource_type,
        overwrite: false,
        invalidate: true
      });
      movedCount += 1;
    } catch (error) {
      if (error?.http_code === 404) {
        console.warn("skip missing resource while deleting category:", file.public_id);
        continue;
      }
      throw error;
    }
  }

  await deletePlaceholders(resources);
  await cleanupFolderChain(deletePath);
  await cleanupCompatibleFolderChains(deletePath);
  await ensureFolderExists(toCloudinaryFolder(targetPath));

  return { movedCount, targetPath };
}

async function listResourcesByPrefixes(prefixes, includePlaceholders) {
  const uniqueResources = new Map();
  for (const prefix of prefixes) {
    const resources = await listResourcesByPrefix(prefix, includePlaceholders);
    resources.forEach((resource) => {
      uniqueResources.set(`${resource.resource_type}:${resource.public_id}`, resource);
    });
  }
  return Array.from(uniqueResources.values());
}

function buildCompatibleFolderPrefixes(categoryPath) {
  return buildCompatibleFolders(categoryPath).map((folder) => `${folder}/`);
}

function buildCompatibleFolders(categoryPath) {
  const encodedSegments = categoryPath.map(encodeCategoryName);
  const plainSegments = categoryPath.map((part) => String(part || "").replace(/^\/+|\/+$/g, ""));
  const folders = new Set();

  for (let mask = 0; mask < (1 << categoryPath.length); mask += 1) {
    const segments = categoryPath.map((_, index) => (
      mask & (1 << index) ? encodedSegments[index] : plainSegments[index]
    ));
    if (segments.every(Boolean)) {
      folders.add(`${ROOT_FOLDER}/${segments.join("/")}`);
    }
  }

  return Array.from(folders);
}

async function cleanupCompatibleFolderChains(pathParts) {
  const cloudinary = configureCloudinary();
  for (let depth = pathParts.length; depth >= 1; depth -= 1) {
    for (const folder of buildCompatibleFolders(pathParts.slice(0, depth))) {
      await cloudinary.api.delete_folder(folder).catch(() => {});
    }
  }
}

async function resolveAvailablePublicId(publicId, resourceType) {
  const cloudinary = configureCloudinary();
  const exists = async (candidate) => {
    try {
      await cloudinary.api.resource(candidate, {
        resource_type: resourceType,
        type: "upload"
      });
      return true;
    } catch (error) {
      if (error?.http_code === 404) {
        return false;
      }
      throw error;
    }
  };

  if (!(await exists(publicId))) {
    return publicId;
  }

  const slashIndex = publicId.lastIndexOf("/");
  const folder = publicId.slice(0, slashIndex + 1);
  const name = publicId.slice(slashIndex + 1);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${folder}${Date.now()}_${index}_${name}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw createHttpError(409, "无法生成不重复的文件路径");
}

async function deletePlaceholders(resources) {
  const cloudinary = configureCloudinary();
  const placeholderGroups = new Map();
  resources
    .filter((file) => String(file.public_id || "").endsWith("/__placeholder"))
    .forEach((file) => {
      const type = file.resource_type || "raw";
      if (!placeholderGroups.has(type)) {
        placeholderGroups.set(type, []);
      }
      placeholderGroups.get(type).push(file.public_id);
    });

  for (const [resourceType, publicIds] of placeholderGroups.entries()) {
    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds, {
        resource_type: resourceType,
        type: "upload",
        invalidate: true
      }).catch(() => {});
    }
  }
}

async function cleanupFolderChain(pathParts) {
  const cloudinary = configureCloudinary();
  for (let depth = pathParts.length; depth >= 1; depth -= 1) {
    await cloudinary.api.delete_folder(toCloudinaryFolder(pathParts.slice(0, depth))).catch(() => {});
  }
}

async function listResourcesByPrefix(prefix, includePlaceholders) {
  const cloudinary = configureCloudinary();
  const resourceTypes = ["raw", "image", "video"];
  const allResources = [];

  for (const resourceType of resourceTypes) {
    let nextCursor = undefined;
    do {
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix,
        max_results: 500,
        next_cursor: nextCursor,
        resource_type: resourceType
      }).catch((error) => {
        if (error?.http_code === 404) {
          return { resources: [] };
        }
        throw error;
      });

      (result.resources || []).forEach((resource) => {
        if (!includePlaceholders && String(resource.public_id || "").endsWith("/__placeholder")) {
          return;
        }
        allResources.push({
          public_id: resource.public_id,
          resource_type: resource.resource_type || resourceType
        });
      });
      nextCursor = result.next_cursor;
    } while (nextCursor);
  }

  return allResources;
}

async function saveCategoryOrder(order) {
  const cloudinary = configureCloudinary();
  const normalizedOrder = normalizeOrderPayload(order);
  const encodedOrder = Buffer.from(JSON.stringify(normalizedOrder), "utf8").toString("base64");
  const placeholder = "data:text/plain;base64,b3JkZXI=";

  await cloudinary.uploader.upload(placeholder, {
    resource_type: "raw",
    public_id: ORDER_CONFIG_PUBLIC_ID,
    overwrite: true,
    invalidate: true,
    context: `category_order=${encodedOrder}`
  });
}

async function loadCategoryOrder() {
  const cloudinary = configureCloudinary();

  try {
    const resource = await cloudinary.api.resource(ORDER_CONFIG_PUBLIC_ID, {
      resource_type: "raw",
      type: "upload",
      context: true
    });
    const encodedOrder = String(
      resource?.context?.custom?.category_order ||
      resource?.context?.category_order ||
      ""
    ).trim();

    if (!encodedOrder) {
      return [];
    }

    const decoded = Buffer.from(encodedOrder, "base64").toString("utf8");
    return normalizeOrderPayload(JSON.parse(decoded));
  } catch (error) {
    if (error?.http_code !== 404) {
      console.error("load category order failed:", error);
    }
    return [];
  }
}

function normalizeOrderPayload(order) {
  if (!Array.isArray(order)) {
    return [];
  }

  return order
    .map((item) => ({
      name: normalizePlainName(item?.name),
      children: normalizeOrderPayload(item?.children || item?.subCategories || [])
    }))
    .filter((item) => item.name);
}

function normalizeCategoryPath(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((part, index) => validateCategoryPart(part, `${index + 1}级栏目名称`));
}

function validateCategoryPart(value, label) {
  return validateFolderName(value, label);
}

function toCloudinaryFolder(categoryPath) {
  return `${ROOT_FOLDER}/${categoryPath.map(encodeCategoryName).join("/")}`;
}

function encodeCategoryName(name) {
  return `${NAME_PREFIX}${Buffer.from(String(name), "utf8").toString("base64url")}`;
}

function decodeCategoryName(segment) {
  const value = String(segment || "");
  if (!value.startsWith(NAME_PREFIX)) {
    return value;
  }
  try {
    return Buffer.from(value.slice(NAME_PREFIX.length), "base64url").toString("utf8");
  } catch (error) {
    return value;
  }
}

function splitPublicId(publicId) {
  return String(publicId || "").split("/").filter(Boolean);
}

function publicIdPartsToCategoryPath(parts) {
  if (parts[0] !== ROOT_FOLDER || !parts[1] || parts[1] === "__config") {
    return [];
  }

  const categorySegments = parts.slice(1);
  const last = categorySegments[categorySegments.length - 1] || "";
  if (last === "__placeholder") {
    categorySegments.pop();
  } else {
    categorySegments.pop();
  }

  return categorySegments.slice(0, MAX_CATEGORY_DEPTH).map(decodeCategoryName);
}

function addPathToTree(nodes, pathParts) {
  let current = nodes;
  pathParts.forEach((name, index) => {
    let node = current.find((item) => item.name === name);
    if (!node) {
      const path = pathParts.slice(0, index + 1);
      node = { name, path, children: [] };
      current.push(node);
    }
    current = node.children;
  });
}

function sortTree(nodes, orderTree) {
  const orderMap = new Map((orderTree || []).map((item, index) => [item.name, { index, children: item.children || [] }]));
  nodes.sort((left, right) => {
    const leftOrder = orderMap.get(left.name);
    const rightOrder = orderMap.get(right.name);
    const leftRank = leftOrder ? leftOrder.index : Number.MAX_SAFE_INTEGER;
    const rightRank = rightOrder ? rightOrder.index : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return String(left.name).localeCompare(String(right.name), "zh-CN");
  });

  nodes.forEach((node) => {
    sortTree(node.children || [], orderMap.get(node.name)?.children || []);
  });
}

function attachLegacySubCategories(nodes) {
  nodes.forEach((node) => {
    node.subCategories = (node.children || []).map((child) => child.name);
    attachLegacySubCategories(node.children || []);
  });
}

function normalizePlainName(value) {
  return String(value || "").trim();
}
