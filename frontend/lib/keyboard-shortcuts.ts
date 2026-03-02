"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type ShortcutMap = Record<string, string | (() => void)>;

/**
 * useKeyboardShortcuts — leader-key based shortcut system.
 *
 * The user presses `leaderKey` (e.g. "\") followed by a mapped key within 1 second.
 * String values in `map` are treated as router push paths.
 * Function values are called directly.
 *
 * @param map - Shortcut key → route path or callback.
 * @param leaderKeyRef - Ref that holds the current leader key character.
 */
export function useKeyboardShortcuts(
  map: ShortcutMap,
  leaderKeyRef: React.RefObject<string>
): void {
  const router = useRouter();
  // Keep a stable ref to the map so the effect doesn't need to re-run when it changes.
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    let leaderActive = false;
    let leaderTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const leader = leaderKeyRef.current ?? "\\";

      if (e.key === leader) {
        e.preventDefault();
        leaderActive = true;
        if (leaderTimeout) clearTimeout(leaderTimeout);
        leaderTimeout = setTimeout(() => { leaderActive = false; }, 1000);
        return;
      }

      if (!leaderActive) return;
      e.preventDefault();
      leaderActive = false;
      if (leaderTimeout) clearTimeout(leaderTimeout);

      const action = mapRef.current[e.key];
      if (!action) return;
      if (typeof action === "string") {
        router.push(action);
      } else {
        action();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (leaderTimeout) clearTimeout(leaderTimeout);
    };
  }, [router, leaderKeyRef]);
}
