import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Database, Unplug, CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { DetRunReaderError } from "@/src/shared/contracts";
import {
  getStudioCatalog,
  STUDIO_DATA_DIR_ENV,
  type CatalogIntegrity,
  type CatalogProjectView,
  type CatalogRunStatus,
  type CatalogRunView,
  type CatalogStats,
} from "@/src/server/catalog/studio-catalog";

export const metadata: Metadata = { title: "Catalog" };

// Catalogue state is read per request (local DB + env) — fully blocking route.
export const instant = false;

function shortHash(hash: string): string {
  return hash.length > 19 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

const STATUS_VARIANT: Record<CatalogRunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  PARTIAL: "secondary",
  FAILED: "destructive",
  INTERRUPTED: "outline",
  RUNNING: "secondary",
};

/** Integrity badges never lie: the label always states the last-index state. */
const INTEGRITY_LABEL: Record<CatalogIntegrity, string> = {
  verified: "verified",
  unverified: "unverified",
  tampered: "TAMPERED",
  missing: "files missing",
  corrupt: "manifest corrupt",
};

function RunCatalogRow({ run }: { run: CatalogRunView }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {run.bundlePresent ? (
          <Link href={`/runs/${encodeURIComponent(run.id)}`} className="underline-offset-2 hover:underline">
            {run.id}
          </Link>
        ) : (
          run.id
        )}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={
            run.integrity === "verified"
              ? "outline"
              : run.integrity === "unverified"
                ? "secondary"
                : "destructive"
          }
        >
          {INTEGRITY_LABEL[run.integrity]}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        {run.projectId ?? <span className="text-muted-foreground">unknown (job started)</span>}
      </TableCell>
      <TableCell className="font-mono text-xs">{run.sourceId ?? "—"}</TableCell>
      <TableCell className="font-mono text-xs">{run.revisionId ?? "—"}</TableCell>
      <TableCell className="font-mono text-xs">{run.configHash === "" ? "—" : shortHash(run.configHash)}</TableCell>
      <TableCell className="text-xs">{run.artifactCount}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {run.startedAt ?? "—"}
        {run.finishedAt !== null ? ` → ${run.finishedAt}` : ""}
        {run.startedAt === null && run.finishedAt === null ? `catalogued ${run.indexedAt}` : ""}
      </TableCell>
    </TableRow>
  );
}

/**
 * [50] Catalogue — durable project/run metadata across Studio restarts.
 * Reads ONLY from the opt-in SQLite catalogue (`STUDIO_DATA_DIR`). Without it
 * the page renders an explicit not-connected state — never demo data, never a
 * fake catalogue. Artifact files stay on disk: the catalogue indexes hashes
 * and paths; downloads keep flowing through the file-backed reader, which
 * re-verifies live bytes against the build manifest on every read. Legacy
 * file-backed runs keep appearing in the regular listing — the catalogue adds
 * metadata, it never hides files.
 */
export default async function CatalogPage() {
  // Catalog state comes from local disk/env per request. fs/env are not
  // tracked as dynamic APIs by Cache Components, so signal request-time.
  await connection();

  const configured = process.env[STUDIO_DATA_DIR_ENV] !== undefined;
  let offMessage: string | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let projects: CatalogProjectView[] = [];
  let runs: CatalogRunView[] = [];
  let stats: CatalogStats | null = null;

  if (configured) {
    try {
      const catalog = await getStudioCatalog();
      if (catalog === null) {
        offMessage = "STUDIO_DATA_DIR is not set; the SQLite catalogue is off.";
      } else {
        const runsRoot = process.env.STUDIO_DET_RUNS_DIR;
        if (typeof runsRoot === "string") {
          await catalog.refreshIndex(runsRoot);
        }
        projects = catalog.listProjects();
        runs = catalog.listRuns();
        stats = catalog.stats();
      }
    } catch (error) {
      if (error instanceof DetRunReaderError) {
        errorCode = error.code;
        errorMessage = error.message;
      } else {
        throw error;
      }
    }
  } else {
    offMessage =
      "The SQLite catalogue is off: STUDIO_DATA_DIR is not set. Set it to a local directory to persist project/run metadata across Studio restarts; fixture and file-backed modes are unaffected.";
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="catalog-heading">
        <h1 id="catalog-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Database className="size-4 text-muted-foreground" aria-hidden="true" />
          Project / Run Catalog
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Durable, inspectable metadata about known projects, builds and their verified artifacts,
          persisted across Studio restarts. Files remain the truth: the catalogue indexes what the
          build manifest declared and what the on-disk bytes verified — it never makes a missing or
          tampered artifact downloadable.
        </p>
      </section>

      {!configured ? (
        <Alert>
          <Unplug className="size-4" aria-hidden="true" />
          <AlertTitle>Catalogue off</AlertTitle>
          <AlertDescription>{offMessage}</AlertDescription>
        </Alert>
      ) : errorCode !== null ? (
        <Alert>
          <CircleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Catalogue unavailable ({errorCode})</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{stats?.projects ?? 0}</span> projects
            </span>
            <span>
              <span className="font-medium text-foreground">{stats?.runs ?? 0}</span> runs (
              {stats
                ? `${stats.byStatus.SUCCEEDED} succeeded · ${stats.byStatus.PARTIAL} partial · ${stats.byStatus.FAILED} failed · ${stats.byStatus.INTERRUPTED} interrupted`
                : "—"}
              )
            </span>
            <span>
              <span className="font-medium text-foreground">{stats?.artifacts ?? 0}</span> catalogued
              artifacts
            </span>
          </div>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Projects</CardTitle>
              <CardDescription>
                Identity comes from the validated build manifests (profile id = project id). The
                config hash is the last observed validated value; every historical hash stays in
                the per-run pins and the config history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No projects catalogued yet. Run a build with the catalogue enabled (see Build) or
                  place a finished bundle in the configured runs root.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Config hash (last observed)</TableHead>
                      <TableHead>Config history</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>First seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-mono text-xs">{project.id}</TableCell>
                        <TableCell className="font-mono text-xs">{project.platformId}</TableCell>
                        <TableCell className="font-mono text-xs">{shortHash(project.configHash)}</TableCell>
                        <TableCell className="text-xs">{project.configHistoryCount}</TableCell>
                        <TableCell className="text-xs">{project.runCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{project.firstSeenAt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Runs</CardTitle>
              <CardDescription>
                Build jobs and indexed bundles with their frozen pins (config hash, source identity)
                and the last index&apos;s integrity verdict. Bundle runs open in the normal run view —
                downloads there are re-verified against the manifest bytes, exactly as without the
                catalogue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No catalogued runs yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Integrity (last index)</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Revision</TableHead>
                      <TableHead>Config pin</TableHead>
                      <TableHead>Artifacts</TableHead>
                      <TableHead>Timing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <RunCatalogRow key={run.id} run={run} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
