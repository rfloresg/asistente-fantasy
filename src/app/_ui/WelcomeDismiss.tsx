"use client";

import { useRouter } from "next/navigation";

import { WELCOME_COOKIE } from "./welcome-cookie";

export default function Dismiss() {
  const router = useRouter();
  return (
    <button type="button" className="link-btn" onClick={() => {
      document.cookie = `${WELCOME_COOKIE}=fuera; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }}>Ahora no</button>
  );
}
