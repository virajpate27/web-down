// app/page.js
"use client";

import { useAuth } from "@/lib/useAuth";

export default function Home() {
  const { user, loading, login, logout } = useAuth();

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Website downloader</h1>
      {user ? (
        <>
          <p>Signed in as {user.displayName}</p>
          <button onClick={logout}>Sign out</button>
        </>
      ) : (
        <button onClick={login}>Sign in with Google</button>
      )}
    </main>
  );
}