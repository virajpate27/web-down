// app/api/crawl/route.js
import { NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import archiver from "archiver";
import { PassThrough } from "stream";
import path from "path";
import { adminDb, adminBucket } from "@/lib/firebaseAdmin";

const ASSET_TAGS = [
  { selector: "link[rel=stylesheet]", attr: "href" },
  { selector: "script[src]", attr: "src" },
  { selector: "img[src]", attr: "src" },
];
 
export async function POST(req) {
  const { jobId } = await req.json();
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const jobRef = adminDb.collection("jobs").doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const job = jobSnap.data();

  try {
    await jobRef.update({ status: "crawling", pagesFound: 1, pagesCrawled: 0 });

    const pageUrl = job.sourceUrl;
    const origin = new URL(pageUrl).origin;

    const { data: html } = await axios.get(pageUrl, {
      timeout: 8000,
      headers: { "User-Agent": "WebsiteDownloaderBot/0.1" },
    });

    const $ = cheerio.load(html);
    const jobPrefix = `jobs/${jobId}`; 
    const assetTasks = [];

    for (const { selector, attr } of ASSET_TAGS) {
      $(selector).each((_, el) => {
        const src = $(el).attr(attr);
        if (!src) return;
        const absolute = resolveUrl(src, pageUrl);
        if (!absolute) return;
        const localPath = localPathFor(absolute, origin);
        assetTasks.push(
          downloadAsset(absolute, `${jobPrefix}/${localPath}`).then(() => {
            $(el).attr(attr, localPath);
          })
        );
      });
    }

    await Promise.allSettled(assetTasks);

    await adminBucket.file(`${jobPrefix}/index.html`).save($.html(), {
      contentType: "text/html",
    });

    await jobRef.update({ pagesCrawled: 1, status: "zipping" });

    const zipPath = `${jobPrefix}/site.zip`;
    await zipFolder(jobPrefix, zipPath);

    const [downloadUrl] = await adminBucket.file(zipPath).getSignedUrl({
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    await jobRef.update({ status: "done", zipPath, downloadUrl });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err);
    await jobRef.update({ status: "failed", error: String(err.message || err) });
    return NextResponse.json({ error: "Crawl failed" }, { status: 500 });
  }
}

function resolveUrl(src, baseUrl) {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

function localPathFor(absoluteUrl, origin) {
  const u = new URL(absoluteUrl);
  const cleanPath = u.pathname.replace(/^\/+/, "") || "index";
  const sameOrigin = u.hostname === new URL(origin).hostname;
  return path.posix.join(
    "assets",
    sameOrigin ? cleanPath : `external/${u.hostname}${u.pathname}`
  );
}

async function downloadAsset(url, storagePath) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 8000,
    headers: { "User-Agent": "WebsiteDownloaderBot/0.1" },
  });
  const contentType = res.headers["content-type"] || "application/octet-stream";
  await adminBucket.file(storagePath).save(Buffer.from(res.data), { contentType });
}

async function zipFolder(prefix, zipDestPath) {
  const [files] = await adminBucket.getFiles({ prefix });
  const archive = archiver("zip", { zlib: { level: 9 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  const uploadDone = new Promise((resolve, reject) => {
    passthrough
      .pipe(adminBucket.file(zipDestPath).createWriteStream({ contentType: "application/zip" }))
      .on("finish", resolve)
      .on("error", reject);
  });

  for (const file of files) {
    if (file.name === zipDestPath) continue;
    const relativeName = file.name.replace(`${prefix}/`, "");
    const [contents] = await file.download();
    archive.append(contents, { name: relativeName });
  }

  await archive.finalize();
  await uploadDone;
}