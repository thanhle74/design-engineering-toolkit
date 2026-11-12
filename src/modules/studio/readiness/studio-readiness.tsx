"use client";

/**
 * [70] Studio readiness context — SEEDED by the Integrator (contract freeze);
 * lane W-A OWNS this directory from here on and refines the UX freely, but
 * the `useStudioReadiness()` contract below is frozen (consumed by W-E).
 *
 * Client mirror of GET /api/environment (UI state is never authorization —
 * the server re-checks every mutation itself). The provider auto-checks once
 * on mount and exposes an explicit `recheck()` for the header "Kiểm tra"
 * button. `status === null && !checking && error === null` is impossible:
 * before the first result the provider is always `checking` or `error`.
 */
import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useRef,
   useState,
   type ReactNode,
} from "react";

import type { StudioReadinessStatus } from "@/src/modules/studio/shared/contracts/build-flow";

export interface StudioReadinessContextValue {
   /** Null until the first completed check ("Chưa kiểm tra"). */
   status: StudioReadinessStatus | null;
   /** True while a check is in flight ("Đang kiểm tra"). */
   checking: boolean;
   /** Fetch/transport failure ("Lỗi") — distinct from status.ready === false. */
   error: string | null;
   /** Manual re-check (the header "Kiểm tra" button). */
   recheck: () => void;
}

const StudioReadinessContext = createContext<StudioReadinessContextValue>({
   status: null,
   checking: false,
   error: null,
   recheck: () => {},
});

export function StudioReadinessProvider({ children }: { children: ReactNode }) {
   const [status, setStatus] = useState<StudioReadinessStatus | null>(null);
   const [checking, setChecking] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const inFlight = useRef(0);

   const runCheck = useCallback(() => {
      inFlight.current += 1;
      setChecking(true);
      setError(null);
      fetch("/api/environment", { cache: "no-store" })
         .then(async (response) => {
            if (!response.ok) {
               throw new Error(
                  `Kiểm tra môi trường thất bại (HTTP ${response.status}).`,
               );
            }
            return (await response.json()) as StudioReadinessStatus;
         })
         .then((next) => {
            setStatus(next);
            setChecking(false);
         })
         .catch((cause: unknown) => {
            setError(
               cause instanceof Error
                  ? cause.message
                  : "Kiểm tra môi trường thất bại.",
            );
            setChecking(false);
         });
   }, []);

   useEffect(() => {
      // Deferred one tick: the check flips state asynchronously so the mount
      // effect never triggers a synchronous cascading render.
      const timer = setTimeout(runCheck, 0);
      return () => clearTimeout(timer);
   }, [runCheck]);

   const value = useMemo<StudioReadinessContextValue>(
      () => ({ status, checking, error, recheck: runCheck }),
      [status, checking, error, runCheck],
   );

   return (
      <StudioReadinessContext.Provider value={value}>
         {children}
      </StudioReadinessContext.Provider>
   );
}

export function useStudioReadiness(): StudioReadinessContextValue {
   return useContext(StudioReadinessContext);
}
