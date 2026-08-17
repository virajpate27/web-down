// lib/crawlUtils.js
import axios from "axios";
import path from "path";
import crypto from "crypto";
import { put } from "@vercel/blob";

export function pageId(url) {
  return crypto.createHash("md5").update(url).digest("hex");
}

export function resolveUrl(src, baseUrl) {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

export function localPathFor(absoluteUrl, origin) {
  const u = new URL(absoluteUrl);
  const cleanPath = u.pathname.replace(/^\/+/, "") || "index";
  const sameOrigin = u.hostname === new URL(origin).hostname;
  return path.posix.join(
    "assets",
    sameOrigin ? cleanPath : `external/${u.hostname}${u.pathname}`
  );
}

export async function downloadAsset(url, blobPath) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 8000,
    headers: { "User-Agent": "WebsiteDownloaderBot/0.1" },
  });
  const contentType = res.headers["content-type"] || "application/octet-stream";
  await put(blobPath, Buffer.from(res.data), {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}