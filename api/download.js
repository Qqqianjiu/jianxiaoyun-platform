const {
  configureCloudinary,
  createHttpError,
  parseDownloadCount,
  sanitizeFileName,
  sendJsonError,
  setCorsHeaders
} = require("./_utils");

module.exports = async (req, res) => {
  setCorsHeaders(res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Only GET is allowed"
    });
  }

  try {
    const publicId = String(req.query?.publicId || "").trim();
    const resourceType = String(req.query?.resourceType || "raw").trim() || "raw";
    const fileName = String(req.query?.fileName || "").trim();

    if (!publicId) {
      throw createHttpError(400, "Missing publicId");
    }

    const cloudinary = configureCloudinary();
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
      type: "upload"
    });

    const downloadFormat = resolveDownloadFormat(fileName, publicId, result);
    const sourceUrl = cloudinary.utils.private_download_url(publicId, downloadFormat, {
      resource_type: resourceType,
      type: "upload",
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 10
    });
    if (!sourceUrl) {
      throw createHttpError(404, "File not found");
    }

    const nextDownloadCount = parseDownloadCount(result) + 1;
    await cloudinary.api.update(publicId, {
      resource_type: resourceType,
      type: "upload",
      context: `download_count=${nextDownloadCount}`
    }).catch((error) => {
      console.error("download count update failed:", error);
    });

    const finalFileName = fileName || publicId.split("/").pop() || "download";
    const upstreamResponse = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow"
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      throw createHttpError(upstreamResponse.status || 502, `Upstream download failed: ${upstreamResponse.statusText || "unknown error"}`);
    }

    const safeFileName = sanitizeFileName(finalFileName);
    const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstreamResponse.headers.get("content-length");

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeRFC5987ValueChars(safeFileName)}`);

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("download api error:", error);
    return sendJsonError(res, error, "Download failed");
  }
};

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

function resolveDownloadFormat(fileName, publicId, resource) {
  const preferredName = String(fileName || "").trim() || String(publicId || "").split("/").pop() || "";
  const match = preferredName.match(/\.([a-z0-9]{1,12})$/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  const fallbackFormat = String(resource?.format || "").trim();
  if (fallbackFormat) {
    return fallbackFormat.toLowerCase();
  }

  throw createHttpError(400, "Unable to determine download file format");
}
