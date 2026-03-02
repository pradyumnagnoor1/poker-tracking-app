import { useEffect, useRef, useState } from "react";

function formatElapsed(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Live elapsed timer anchored to a server timestamp.
 *
 * @param gameJoinedAt  ISO string from session_members.game_joined_at.
 *                      The timer starts from this point in absolute time,
 *                      so it survives browser refreshes correctly.
 *
 * @param frozenAt      Optional ISO string. When provided the timer freezes
 *                      at (frozenAt - gameJoinedAt) — used when the game has
 *                      ended or the player cashed out early.
 *
 * Usage:
 *   const { formatted, elapsedSeconds, hours } = useSessionTimer(gameJoinedAt);
 *   const { formatted } = useSessionTimer(gameJoinedAt, gameEndedAt); // frozen
 */
export function useSessionTimer(
    gameJoinedAt: string | null | undefined,
    frozenAt?: string | null
) {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (!gameJoinedAt) {
            setElapsedSeconds(0);
            return;
        }

        const startMs = new Date(gameJoinedAt).getTime();
        const endMs = frozenAt ? new Date(frozenAt).getTime() : null;

        const tick = () => {
            const nowMs = endMs ?? Date.now();
            setElapsedSeconds(Math.max(0, Math.floor((nowMs - startMs) / 1000)));
        };

        tick(); // run immediately so there's no 1-second blank on mount

        if (!endMs) {
            // Live: update every second
            intervalRef.current = setInterval(tick, 1000);
        }
        // If frozen (endMs set): no interval needed — value is constant

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [gameJoinedAt, frozenAt]);

    return {
        elapsedSeconds,
        formatted: formatElapsed(elapsedSeconds),
        hours: elapsedSeconds / 3600,
    };
}
