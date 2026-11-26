"use client";

import { useEffect, useState } from "react";

type Theme = "sunshine" | "sunset";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "sunset" ? "dark" : "light";

  try {
    window.localStorage.setItem("connexa-theme", theme);
  } catch {
    // The theme remains active for the current page when storage is unavailable.
  }

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "sunset" ? "#17100F" : "#F8F5EB";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("sunshine");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === "sunset" ? "sunset" : "sunshine";
    setTheme(saved);

    function syncTheme(event: StorageEvent) {
      if (event.key !== "connexa-theme") return;
      const next: Theme = event.newValue === "sunset" ? "sunset" : "sunshine";
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next === "sunset" ? "dark" : "light";
      setTheme(next);
    }

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const nextTheme: Theme = theme === "sunshine" ? "sunset" : "sunshine";
  const label = theme === "sunshine" ? "Ativar tema escuro Sunset" : "Ativar tema claro Sunshine";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      aria-label={label}
      aria-pressed={theme === "sunset"}
      title={label}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{theme === "sunshine" ? "☾" : "☀"}</span>
      <span className="theme-toggle-label">{theme === "sunshine" ? "Sunset" : "Sunshine"}</span>
    </button>
  );
}
