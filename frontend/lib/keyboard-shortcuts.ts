"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type ShortcutMap = Record<string, string | (() => void)>;

/**
 * useKeyboardShortcuts — leader-key based shortcut system.
 *
 * The user presses one of the `leaderKeysRef` characters (e.g. "\") followed
 * by a mapped key within 1 second.
 * String values in `map` are treated as router push paths.
 * Function values are called directly.
 * Double-pressing any leader key triggers `onDoubleLeader`.
 *
 * @param map - Shortcut key → route path or callback.
 * @param leaderKeysRef - Ref that holds the current list of leader key characters.
 */
export function useKeyboardShortcuts(
  map: ShortcutMap,
  leaderKeysRef: React.RefObject<string[]>,
  onDoubleLeader?: () => void
): void {
  const router = useRouter();
  const mapRef = useRef(map);
  mapRef.current = map;
  const onDoubleLeaderRef = useRef(onDoubleLeader);
  onDoubleLeaderRef.current = onDoubleLeader;

  useEffect(() => {
    let leaderActive = false;
    let leaderTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const leaders = leaderKeysRef.current ?? ["\\"];
      const isLeader = leaders.includes(e.key);

      if (isLeader) {
        e.preventDefault();
        if (leaderActive) {
          // Double leader press → focus the main content pane
          leaderActive = false;
          if (leaderTimeout) { clearTimeout(leaderTimeout); leaderTimeout = null; }
          onDoubleLeaderRef.current?.();
          return;
        }
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
  }, [router, leaderKeysRef]);
}
