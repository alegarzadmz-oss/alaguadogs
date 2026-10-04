"use client";
import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";
export default function Page() {
  const { signOut } = useClerk();
  useEffect(() => {
    void signOut({ redirectUrl: "/" });
  }, [signOut]);
  return (
    <main className="auth-page">
      <p>Cerrando sesión…</p>
    </main>
  );
}
