/**
 * [29] DET Studio — W-C "Preview & Export" lane: honest resolved-preview panel.
 *
 * Presentational only. Data enters as slices of the frozen `StudioRunView`
 * read model (`run.preview`, `run.mode`, `run.label`) — this module never
 * fetches, never imports server code, and never renders a screenshot, mock
 * image or fabricated frame as preview "proof".
 *
 * `preview.status === "unavailable"` is a normal, calm operator state: the
 * reader's reason is rendered verbatim, plus one line stating that a preview
 * appears only when [28]'s verified DET Preview Theme output is bound. It is
 * not a failure to hide.
 *
 * `preview.status === "available"` can only ever carry `verified: true` (the
 * frozen contract makes anything else unrepresentable): Studio then shows the
 * run label, the real URL as a visible link, an open-in-new-tab affordance
 * with `rel="noreferrer"`, and a small verified badge. No iframe — the
 * preview is engine-rendered in an isolated DET Preview Theme, outside Studio.
 *
 * DEMO fixture runs (`mode === "fixture"`) always carry a visible DEMO badge
 * near the preview panel so fixture data can never masquerade as live proof.
 */
import { ExternalLink, MonitorX, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StudioPreviewState, StudioRunMode } from "@/src/shared/contracts";

export interface PreviewPanelProps {
  /** The `run.preview` slice of the frozen read model. */
  preview: StudioPreviewState;
  /** The `run.mode` slice — fixture runs are visibly labeled DEMO. */
  mode: StudioRunMode;
  /** The `run.label` slice — rendered only for an available preview. */
  label: string;
}

export function PreviewPanel({ preview, mode, label }: PreviewPanelProps) {
  return (
    <Card size="sm" data-testid="preview-panel">
      <CardHeader>
        <CardTitle>
          <h2>Preview</h2>
        </CardTitle>
        <CardDescription>
          {preview.status === "available"
            ? "Resolved from the run's verified, isolated DET Preview Theme output."
            : "No verified preview is bound to this run."}
        </CardDescription>
        {mode === "fixture" ? (
          <CardAction>
            <Badge
              variant="outline"
              data-testid="preview-demo-badge"
              className="font-semibold tracking-wide border-dashed"
              title="DEMO fixture run — illustrative data, not a live conversion."
            >
              DEMO
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {preview.status === "unavailable" ? (
          <PreviewUnavailableReason reason={preview.reason} />
        ) : (
          <PreviewAvailableSource preview={preview} label={label} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Calm informational panel for the normal "no verified preview" state.
 * The reader-supplied reason is rendered VERBATIM in its own paragraph.
 */
function PreviewUnavailableReason({ reason }: { reason: string }) {
  return (
    <Alert className="border-border bg-muted/30">
      <MonitorX aria-hidden="true" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Preview unavailable
        <Badge variant="secondary" className="font-mono text-[10px]">
          PREVIEW_UNAVAILABLE
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <p data-testid="preview-unavailable-reason">{reason}</p>
        <p className="text-xs">
          A preview appears only when [28]&rsquo;s verified DET Preview Theme
          output is bound to this run. This is a normal state, not a failure.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** Available state: real URL as text + links, verified badge. Never an iframe. */
function PreviewAvailableSource({
  preview,
  label,
}: {
  preview: Extract<StudioPreviewState, { status: "available" }>;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge
          variant="secondary"
          data-testid="preview-verified-badge"
          title="Verified by the engine boundary — Studio never invents a preview URL or success."
        >
          <ShieldCheck aria-hidden="true" />
          Verified
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={preview.url}
          data-testid="preview-url-link"
          title={preview.url}
          className="text-sm underline underline-offset-4 break-all"
        >
          {preview.url}
        </a>
        <a
          href={preview.url}
          target="_blank"
          rel="noreferrer"
          data-testid="preview-new-tab-link"
          className="inline-flex items-center gap-1 text-xs underline underline-offset-4"
        >
          <ExternalLink aria-hidden="true" />
          Open in new tab
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        The preview is rendered by the engine&rsquo;s isolated DET Preview
        Theme, outside Studio. Studio shows the verified link only — never a
        mock screenshot as Magento proof.
      </p>
    </div>
  );
}
