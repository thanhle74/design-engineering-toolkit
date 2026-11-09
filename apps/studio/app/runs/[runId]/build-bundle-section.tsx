import { CircleAlert, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { StudioRunView } from "@/src/shared/contracts";

/**
 * [40] Build-bundle section — rendered ONLY when the run view carries the
 * additive `build` block (i.e. the run is a `det build` bundle). Shows the
 * persisted stage table, the honest gap list, and Studio-side manifest
 * verification truth. Native Page Builder HTML stays source/download only:
 * no Magento storefront or Admin preview is claimed anywhere here.
 */
export function BuildBundleSection({ run }: { run: StudioRunView }) {
  const build = run.build;
  if (build === undefined) return null;

  const failedStages = build.stages.filter((stage) => stage.status === "failed");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Build bundle</h2>
        </CardTitle>
        <CardDescription>
          Assembled from the build-manifest.json bundle written by{" "}
          <span className="font-mono">det build</span> (profile{" "}
          <span className="font-mono">{run.profileId ?? "unknown"}</span>, platform{" "}
          <span className="font-mono">{run.platformId ?? "unknown"}</span>). The root manifest is
          the trust anchor; every declared output is re-checked against its recorded SHA-256 and
          byte size before it is downloadable.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {build.manifestVerified ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Manifest verified: every declared output matches its recorded SHA-256 and byte size.
          </p>
        ) : (
          <Alert variant="destructive">
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Manifest verification failed</AlertTitle>
            <AlertDescription>
              At least one declared output does not match the recorded SHA-256/bytes — the bundle
              is tampered or stale. Downloads of manifest outputs are refused until the bundle is
              rebuilt.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Exit code</TableHead>
                <TableHead>Output dir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {build.stages.map((stage) => (
                <TableRow key={stage.stage}>
                  <TableCell className="font-mono">{stage.stage}</TableCell>
                  <TableCell>
                    <Badge
                      variant={stage.status === "failed" ? "destructive" : "outline"}
                    >
                      {stage.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{stage.exitCode}</TableCell>
                  <TableCell className="font-mono text-xs">{stage.outDir ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Gaps {failedStages.length > 0 ? "" : "and boundaries"}
          </h3>
          <ul className="flex flex-col gap-2">
            {build.gaps.map((gap) => (
              <li key={gap.code} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
                <span className="font-mono text-xs font-medium">
                  {gap.code}
                  {gap.count !== undefined ? ` · count ${gap.count}` : ""}
                </span>
                <span className="text-sm text-muted-foreground">{gap.message}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Config identity <span className="font-mono">{build.configContentHash}</span> · This bundle
          is an offline build. Native Page Builder HTML is offered as{" "}
          <strong>source/download only</strong> — installing it into a Magento instance and any
          storefront/Admin preview remain operator steps (see the manifest gaps), never claims of
          this UI.
        </p>
      </CardContent>
    </Card>
  );
}
