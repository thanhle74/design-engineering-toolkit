/**
 * [29] Studio — disposition/severity badge vocabulary.
 *
 * Canonical engine strings are rendered EXACTLY as the engine emits them.
 * Compose dispositions are the frozen `mapped | gap | decoration-merged |
 * excluded | skipped` vocabulary; `NEEDS_REVIEW` appears only as a review
 * disposition / derived flag badge, never as a compose disposition.
 *
 * Semantic color mapping (calm operator look, theme tokens + Tailwind palette):
 *   mapped            -> default (primary)
 *   gap               -> amber (attention, not destructive-red)
 *   decoration-merged -> secondary (muted)
 *   excluded          -> secondary (muted)
 *   skipped           -> outline
 *   NEEDS_REVIEW      -> amber + warning icon
 */
import { TriangleAlert } from "lucide-react";
import type {
  StudioComposeDisposition,
  StudioNodeKind,
  StudioReviewDisposition,
  StudioSeverity,
} from "@/src/shared/contracts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Amber attention tint shared by `gap` and `NEEDS_REVIEW`. */
const AMBER_BADGE =
  "border-amber-600/40 bg-amber-500/15 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300";

/** Muted fill used for "value absent" badges so unknown never looks like data. */
const UNKNOWN_BADGE = "border-dashed text-muted-foreground";

export function ComposeDispositionBadge({
  disposition,
}: {
  disposition: StudioComposeDisposition;
}) {
  switch (disposition) {
    case "mapped":
      return <Badge variant="default">{disposition}</Badge>;
    case "gap":
      return <Badge variant="outline" className={AMBER_BADGE}>{disposition}</Badge>;
    case "decoration-merged":
    case "excluded":
      return <Badge variant="secondary">{disposition}</Badge>;
    case "skipped":
      return <Badge variant="outline">{disposition}</Badge>;
  }
}

export function ReviewDispositionBadge({
  disposition,
}: {
  disposition: StudioReviewDisposition;
}) {
  if (disposition === "NEEDS_REVIEW") {
    return (
      <Badge variant="outline" className={AMBER_BADGE}>
        <TriangleAlert data-icon="inline-start" aria-hidden="true" />
        {disposition}
      </Badge>
    );
  }
  return <Badge variant="outline">{disposition}</Badge>;
}

export function KindBadge({ kind }: { kind?: StudioNodeKind }) {
  if (!kind) {
    return (
      <Badge variant="outline" className={UNKNOWN_BADGE}>
        unknown
      </Badge>
    );
  }
  return <Badge variant="outline">{kind}</Badge>;
}

export function SeverityBadge({ severity }: { severity: StudioSeverity }) {
  switch (severity) {
    case "info":
      return <Badge variant="secondary">{severity}</Badge>;
    case "warning":
      return <Badge variant="outline" className={AMBER_BADGE}>{severity}</Badge>;
    case "error":
      return <Badge variant="destructive">{severity}</Badge>;
  }
}

export function OriginBadge({
  origin,
}: {
  origin: "run" | "compose" | "review";
}) {
  return (
    <Badge variant="outline" className="font-mono">
      {origin}
    </Badge>
  );
}

/** DEMO/LIVE run-mode badge: a fixture run is always visibly labeled DEMO. */
export function RunModeBadge({ mode }: { mode: "fixture" | "live" }) {
  if (mode === "fixture") {
    return (
      <Badge
        variant="outline"
        data-testid="studio-demo-badge"
        className={cn("font-semibold tracking-wide", AMBER_BADGE)}
      >
        DEMO
      </Badge>
    );
  }
  return <Badge variant="default" data-testid="studio-live-badge">LIVE</Badge>;
}
