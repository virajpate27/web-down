// app/page.js
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

const FREE_MAX_PAGES  = 20;
const FREE_MAX_DEPTH = 2;

export default function Home() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function normalizeUrl(input) {
    try {
      const withProtocol = /^https?:\/\//i.test(input)
        ? input
        : `https://${input}`;
      const parsed = new URL(withProtocol);
      return parsed.toString();
    } catch {
      return null;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!user) {
      await login();
      return;
    }

    const normalized = normalizeUrl(url.trim());
    if (!normalized) {
      setError("Enter a valid website URL, e.g. example.com");
      return;
    }

    setSubmitting(true);
    try {
      const jobRef = await addDoc(collection(db, "jobs"), {
        userId: user.uid,
        sourceUrl: normalized,
        status: "queued",
        maxPages: FREE_MAX_PAGES,
        maxDepth: FREE_MAX_DEPTH,
        pagesFound: 0,
        pagesCrawled: 0, 
        zipPath: null,
        downloadUrl: null,
        error: null,
        createdAt: serverTimestamp(),
      });

      fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobRef.id }),
      });

      router.push(`/dashboard?job=${jobRef.id}`);
    } catch (err) {
      console.error(err);
      setError("Something went wrong starting the job. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Website downloader</h1>
        <p style={styles.sub}>
          Paste a link. We&apos;ll crawl the pages, pull the assets, and pack it
          all into a ZIP you can use offline.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            style={styles.input}
            disabled={submitting || loading}
          />
          <button
            type="submit"
            style={styles.button}
            disabled={submitting || loading}
          >
            {submitting
              ? "Starting…"
              : user
                ? "Download"
                : "Sign in & download"}
          </button>
        </form>

        {error && <p style={styles.error}>{error}</p>}

        <p style={styles.hint}>
          Up to {FREE_MAX_PAGES} pages, {FREE_MAX_DEPTH} levels deep.
        </p>
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  card: { maxWidth: 480, width: "100%", textAlign: "center" },
  h1: { fontSize: 32, marginBottom: 8 },
  sub: { color: "#666", marginBottom: 24, lineHeight: 1.5 },
  form: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 16,
  },
  button: {
    padding: "12px 20px",
    borderRadius: 8,
    border: "none",
    background: "#111",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
  },
  error: { color: "#c0392b", marginTop: 12 },
  hint: { color: "#999", fontSize: 13, marginTop: 16 },
};
