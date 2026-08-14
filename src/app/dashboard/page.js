// app/dashboard/page.js
"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

const STATUS_LABEL = {
  queued: "Queued",
  crawling: "Crawling pages…",
  zipping: "Packaging ZIP…",
  done: "Ready",
  failed: "Failed",
};

export default function Dashboard() {
  const { user, loading, login } = useAuth();
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "jobs"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return unsub;
  }, [user]);

  if (loading) return <main style={styles.main}>Loading…</main>;

  if (!user) {
    return (
      <main style={styles.main}>
        <p>Sign in to see your downloads.</p>
        <button style={styles.button} onClick={login}>
          Sign in
        </button>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>Your downloads</h1>
      {jobs.length === 0 && <p style={{ color: "#888" }}>No jobs yet.</p>}

      <div style={styles.list}>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </main>
  );
}

function JobRow({ job }) {
  const progress =
    job.pagesFound > 0
      ? Math.min(100, Math.round((job.pagesCrawled / job.pagesFound) * 100))
      : job.status === "done"
      ? 100
      : 0;

  return (
    <div style={styles.row}>
      <div style={{ flex: 1 }}>
        <div style={styles.url}>{job.sourceUrl}</div>
        <div style={styles.status}>
          {STATUS_LABEL[job.status] || job.status}
          {job.status === "crawling" &&
            ` (${job.pagesCrawled || 0}/${job.pagesFound || "?"})`}
        </div>
        {["crawling", "zipping"].includes(job.status) && (
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${progress}%` }} />
          </div>
        )}
        {job.status === "failed" && (
          <div style={styles.error}>{job.error || "Unknown error"}</div>
        )}
      </div>

      {job.status === "done" && job.downloadUrl && (
        <a href={job.downloadUrl} style={styles.download} target="_blank" rel="noreferrer">
          Download ZIP
        </a>
      )}
    </div>
  );
}

const styles = {
  main: { maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" },
  h1: { fontSize: 24, marginBottom: 20 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 16,
  },
  url: { fontWeight: 500, marginBottom: 4, wordBreak: "break-all" },
  status: { fontSize: 13, color: "#666" },
  barTrack: { height: 6, background: "#eee", borderRadius: 4, marginTop: 8, overflow: "hidden" },
  barFill: { height: "100%", background: "#111", transition: "width .3s" },
  error: { color: "#c0392b", fontSize: 13, marginTop: 6 },
  download: {
    padding: "8px 14px",
    background: "#111",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  button: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
};