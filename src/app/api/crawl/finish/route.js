// app/api/crawl/finish/route.js
import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { list, put } from "@vercel/blob";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req) {
  const { jobId } = await req.json();
  const jobRef = adminDb.collection("jobs").doc(jobId);
  const jobPrefix = `jobs/${jobId}`;

  try {
    await jobRef.update({ status: "zipping" });

    const zipBuffer = await buildZipBuffer(jobPrefix);

    const zipBlob = await put(`${jobPrefix}/site.zip`, zipBuffer, {
      access: "public",
      contentType: "application/zip",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    await jobRef.update({
      status: "done",
      zipPath: `${jobPrefix}/site.zip`,
      downloadUrl: zipBlob.url,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Zip failed for job ${jobId}:`, err);
    await jobRef.update({ status: "failed", error: String(err.message || err) });
    return NextResponse.json({ error: "Zip failed" }, { status: 500 });
  }
}

async function buildZipBuffer(prefix) {
  const { blobs } = await list({ prefix });

  const archive = archiver("zip", { zlib: { level: 9 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  const chunks = [];
  const collected = new Promise((resolve, reject) => {
    passthrough.on("data", (c) => chunks.push(c));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);
  });

  for (const blob of blobs) {
    if (blob.pathname.endsWith("site.zip")) continue;
    const res = await fetch(blob.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const relativeName = blob.pathname.replace(`${prefix}/`, "");
    archive.append(buf, { name: relativeName });
  }

  await archive.finalize();
  return collected;
}