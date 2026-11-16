// [70] CMS installer renderer — the generated Magento Page Builder PHP installer is the
// FIRST-CLASS `det build` bundle artifact, together with its evidence companions.
//
// HARD BOUNDARIES (issue #70, worker lane W-D):
// - DET itself NEVER connects to or writes any Magento installation. This module only
//   GENERATES deterministic, operator-executed files; every write happens later, only when
//   a human runs the generated script inside their own installation.
// - Determinism: the same inputs produce BYTE-IDENTICAL outputs — no timestamps, no random,
//   no environment reads. Idempotent builds are a design goal, not an accident.
// - Platform-neutral core (this module's public surface + JSON documents); PHP exists only
//   inside the emitted template strings.
// - The frozen artifact names/roles come from the [70] contract freeze
//   (src/modules/studio/shared/contracts/build-flow.ts, READ-ONLY for this lane):
//   install-homepage.php (cms-installer), pagebuilder-content.html (native-content-copy),
//   mapping-and-gaps.json (mapping-gap-report), README.md (operator-readme). The literals
//   below must equal that contract; the module-owned test suite locks the equality.
// - Honesty: the generated installer is UNPROVEN against a live Magento until an authorized
//   isolated-store run. The header and the operator README say exactly that.

import { createHash } from "node:crypto";

/* ------------------------------- shapes -------------------------------- */

/** The explicit CMS write target declared in the build config (`cmsInstall` block). */
export interface CmsInstallTarget {
   identifier: string;
   title: string;
   storeId: number;
   active: boolean;
}

/** Build provenance echoed into the installer header and the operator README. */
export interface CmsInstallerProvenance {
   sourceId: string;
   revisionId: string;
   profileId: string;
   platformId: string;
}

export interface CmsInstallerInput {
   cmsInstall: CmsInstallTarget;
   /** Byte-exact composed Page Builder content (the bundle's native-content.html). */
   content: string;
   provenance: CmsInstallerProvenance;
}

/** One mapping entry of a compose report (verbatim shape of compose-report.json). */
export interface ComposeMappingEntryLite {
   sourceNodeId: string;
   sourceName?: string;
   sourceLocator?: string;
   disposition: "mapped" | "gap" | "decoration-merged" | "excluded" | "skipped";
   target?: {
      capabilityId: string;
      appearanceId: string;
      nativeElement?: string;
      nativeField?: string;
   };
   note?: string;
}

/** One diagnostic of a compose report (verbatim shape of compose-report.json). */
export interface ComposeDiagnosticLite {
   code: string;
   severity: string;
   message: string;
   subject?: { type: string; id: string };
}

export interface MappingAndGapsInput {
   source: { sourceId: string; revisionId: string };
   cmsInstall: CmsInstallTarget;
   report: {
      mapping: ComposeMappingEntryLite[];
      diagnostics: ComposeDiagnosticLite[];
   };
   /** The build manifest's gap list (same order the manifest carries). */
   buildGaps: { code: string; message: string; count?: number }[];
}

export interface InstallerReadmeInput {
   cmsInstall: CmsInstallTarget;
   provenance: CmsInstallerProvenance;
}

/** The four install-bundle files emitted at the bundle ROOT (frozen [70] names). */
export const CMS_INSTALL_BUNDLE_FILES = {
   installer: "install-homepage.php",
   pageBuilderContent: "pagebuilder-content.html",
   mappingAndGaps: "mapping-and-gaps.json",
   readme: "README.md",
} as const;

/** The four additive build-manifest output roles (frozen [70] contract). */
export const CMS_INSTALL_BUNDLE_ROLES = {
   installer: "cms-installer",
   pageBuilderContent: "native-content-copy",
   mappingAndGaps: "mapping-gap-report",
   readme: "operator-readme",
} as const;

/** The manifest gap code recorded when the build config declares no cmsInstall target. */
export const CMS_INSTALL_TARGET_UNDECLARED =
   "CMS_INSTALL_TARGET_UNDECLARED" as const;

/* ------------------------- deterministic helpers ------------------------- */

// Nowdoc terminator sequence; ANY occurrence inside the content forces the fallback
// embedding (a PHP heredoc/nowdoc body must never contain its own terminator).
const NOWDOC_MARKER = "DET_PB_CONTENT";

/**
 * PHP single-quoted string literal with var_export-identical escaping (only backslash and
 * single quote are escaped; every other byte passes through verbatim, so UTF-8 stays exact).
 */
function phpSingleQuoted(value: string): string {
   return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

/**
 * The byte-exact content embedding expression. Two deterministic forms:
 * - nowdoc `<<<'DET_PB_CONTENT'` (default). PHP 7.3+ body semantics: exactly one newline
 *   separates the content from the terminator line and the parser consumes exactly that
 *   newline, so the body equals the content byte-for-byte (with or without a trailing
 *   newline). No interpolation exists in a nowdoc — `'`, `"`, `\`, `<?php`, tabs and
 *   unicode pass through untouched.
 * - var_export-style single-quoted literal (fallback) when the content contains the
 *   terminator sequence ANYWHERE (the collision check is deliberately broader than the
 *   parser's rule — it also rejects an indented terminator line, which PHP 7.3+ would
 *   still treat as the end of the body).
 * This function is the shared SEAM the tests probe through: the generated installer keeps
 * the embedded bytes reachable via `det_pb_embedded_content()` and never executes its entry
 * point when it is included (see the emitted guard), so a probe can include the file and
 * assert the returned bytes.
 */
export function embedPhpContentExpression(content: string): {
   mode: "nowdoc" | "var_export";
   expression: string;
} {
   if (content.includes(NOWDOC_MARKER)) {
      return { mode: "var_export", expression: phpSingleQuoted(content) };
   }
   return {
      mode: "nowdoc",
      expression: `<<<'${NOWDOC_MARKER}'\n${content}\n${NOWDOC_MARKER}`,
   };
}

function sha256Hex(value: string): string {
   return createHash("sha256").update(value, "utf8").digest("hex");
}

// Header comment echoes are display-only; `*/` inside a value could close the comment early,
// so display echoes are sanitized. The machine-readable constants below carry the exact
// escaped values and are the single source of truth for every code path.
const commentSafe = (value: string): string => value.replace(/\*\//g, "* /");

function padLabel(label: string): string {
   return label.padEnd(11);
}

/* --------------------------- installer renderer -------------------------- */

/**
 * Render the Magento CMS installer PHP script (pure + deterministic).
 *
 * Generated script contract (see the emitted header for the operator-facing text):
 * - `declare(strict_types=1)`; runs ONLY as CLI and only when executed directly; being
 *   included (e.g. by the byte-exactness probe) never executes anything.
 * - Install location `<magento-root>/det-install/`; Magento root resolved as
 *   `realpath(__DIR__ . '/..')`; a missing `<magentoRoot>/app/bootstrap.php` is a STDERR
 *   message + exit 1 — never a fatal on wrong placement.
 * - Boots Magento exactly like the platform's own CLI applications do
 *   (`\Magento\Framework\App\Bootstrap::create(BP, $_SERVER)`) and implements a REAL
 *   `\Magento\Framework\AppInterface` (`DetCmsInstallerApp`) in the shape of the platform's
 *   own `\Magento\Framework\App\Cron`: `launch()` sets the `crontab` area, loads the area
 *   config, performs the work and returns the constructor-injected
 *   `\Magento\Framework\App\Console\Response` — a REAL `\Magento\Framework\App\ResponseInterface`
 *   whose `sendResponse()` exists and is invoked by `Bootstrap::run()`
 *   (`$response = $application->launch(); $response->sendResponse();`). A controller Result
 *   object is NEVER returned: Result objects expose `renderResult()`, NOT `sendResponse()`,
 *   so `Bootstrap::run()` would fatal AFTER the CMS write ([70] C70-1, fixed here).
 * - CMS write through the supported service layer ONLY: `\Magento\Cms\Api\PageRepositoryInterface`
 *   for save; the existing-page lookup goes through
 *   `\Magento\Cms\Model\ResourceModel\Page\Collection` with `addFieldToFilter` on the
 *   declared identifier — NO raw SQL on any cms_page table, ever.
 * - STRICT target resolution: the page is addressed ONLY by the declared identifier within
 *   the declared store scope. An existing page whose store set differs from the declared
 *   scope (including store 0 "all store views") refuses loudly (exit 1) — never guessed,
 *   never re-scoped. The store config value `web/default/cms_home_page` is NEVER read or
 *   written and no other page is ever touched.
 * - Idempotent create-or-update keyed on (identifier, store scope); prints
 *   `created|updated` + page id. Full try/catch -> STDERR + non-zero exit.
 * - `--dry-run`: validates placement, prints the exact plan (identifier/title/store/active,
 *   content byte length, content sha256) and performs NO write; the application is not
 *   booted.
 * - No credentials, no secrets, no network access; metadata is embedded via
 *   json_encode/var_export forms only.
 */
export function renderCmsInstallerPhp(input: CmsInstallerInput): string {
   const { cmsInstall, content, provenance } = input;
   const embedded = embedPhpContentExpression(content);
   const contentSha = sha256Hex(content);
   const provenanceJson = phpSingleQuoted(
      JSON.stringify({
         sourceId: provenance.sourceId,
         revisionId: provenance.revisionId,
         profileId: provenance.profileId,
         platformId: provenance.platformId,
      }),
   );
   const embedNote =
      embedded.mode === "nowdoc"
         ? "nowdoc heredoc (no terminator collision detected at generation time)"
         : "var_export-style single-quoted literal (the content contains the nowdoc terminator sequence; the fallback embedding is byte-exact)";

   return `<?php
declare(strict_types=1);

/**
 * =====================================================================
 * GENERATED BY DET — Design Engineering Toolkit (issue #70)
 * DO NOT EDIT BY HAND — regenerate via \`det build\`.
 * =====================================================================
 *
 * What this file is: the operator-executed CMS installer for ONE composed
 * Magento Page Builder page. It is generated OFFLINE and carries the exact
 * page content embedded below (byte-verified by DET's own test suite).
 *
 * EXPLICIT TARGET DECLARATION (echoed from the validated build config;
 * this script addresses exactly this target and NOTHING else):
 *   ${padLabel("identifier")}${commentSafe(cmsInstall.identifier)}
 *   ${padLabel("title")}${commentSafe(cmsInstall.title)}
 *   ${padLabel("storeId")}${cmsInstall.storeId}
 *   ${padLabel("active")}${cmsInstall.active ? "true" : "false"}
 *
 * PROVENANCE (offline det build):
 *   ${padLabel("sourceId")}${commentSafe(provenance.sourceId)}
 *   ${padLabel("revisionId")}${commentSafe(provenance.revisionId)}
 *   ${padLabel("profileId")}${commentSafe(provenance.profileId)}
 *   ${padLabel("platformId")}${commentSafe(provenance.platformId)}
 *   ${padLabel("content")}sha256=${contentSha}
 *
 * WARNINGS — read before running:
 *  - RUNNING THIS SCRIPT WRITES THE CMS PAGE IN THIS MAGENTO INSTALLATION.
 *    DET itself NEVER writes to any Magento installation: this is a generated
 *    script executed by the operator. Run \`php install-homepage.php --dry-run\`
 *    FIRST — it validates placement and prints the exact plan without writing.
 *  - INSTALL LOCATION: copy this file to <magento-root>/det-install/ and run it
 *    from there. It resolves \$magentoRoot = realpath(__DIR__ . '/..') and
 *    requires <magentoRoot>/app/bootstrap.php; a wrong placement is a STDERR
 *    message + exit 1 — never a fatal.
 *  - WRITE PATH: service layer ONLY — \\Magento\\Cms\\Api\\PageRepositoryInterface
 *    for save; the existing-page lookup uses
 *    \\Magento\\Cms\\Model\\ResourceModel\\Page\\Collection with addFieldToFilter on
 *    the declared identifier. NO raw SQL on any cms_page table.
 *  - STORE SCOPE: the page is stored with an EXPLICIT store scope
 *    (\$page->setStoreId([$storeId]) with $storeId = the declared store id).
 *    An existing page with the same identifier under a DIFFERENT store set
 *    (including store 0 "all store views") REFUSES the run (exit 1) — never
 *    guessed, never re-scoped.
 *  - CONFIRMATION FLAGS ([74]):
 *      a) NON-DEFAULT store scope: when the declared store_id is NOT 0, a real
 *         run must pass the explicit matching flag --store-id=<storeId>
 *         (e.g. --store-id=${cmsInstall.storeId}) — a missing or mismatched
 *         flag REFUSES the run (exit 1). --dry-run never needs the flag.
 *      b) NO silent overwrite: an EXISTING page under the declared scope is
 *         never replaced silently — the run REFUSES (exit 1) unless the
 *         operator passes --force. A brand-new page needs no --force.
 *  - MEDIA ([74]): files under this bundle's media/ directory are copied into
 *    <magento-root>/pub/media/ ONLY. Every destination is checked by realpath
 *    containment (it must resolve INSIDE the resolved pub/media), symlinks in
 *    the bundle media tree and any '..' path segment REFUSE the run BEFORE
 *    anything is written, existing pub/media files with DIFFERENT bytes REFUSE
 *    the run unless --force (byte-identical files are skipped — idempotent),
 *    and directory/file permissions are 0755/0644.
 *  - CACHE ([74]): after a successful page write the script cleans ONLY the
 *    cache types [full_page, block_html] — a scoped clean, NEVER a flush-all —
 *    so the installed page and its media render immediately.
 *  - SCOPE GUARANTEES: this script NEVER reads or writes the store config value
 *    web/default/cms_home_page (the store's default homepage is untouched) and
 *    NEVER touches any other CMS page; resolution is strictly by the declared
 *    identifier within the declared store scope.
 *  - IDEMPOTENT: create-or-update keyed on (identifier, store scope); a second
 *    run with the same flags reports action=updated with the same page id
 *    (existing pages require --force, byte-identical media is skipped).
 *  - PARTIAL COVERAGE: the bundle's mapping-and-gaps.json lists every mapping
 *    gap and exclusion. Partial composition coverage is NOT pixel-perfect.
 *  - RUNTIME PROOF: the emitted runtime shape (AppInterface launch -> a REAL
 *    ResponseInterface with sendResponse(), service-layer write, idempotent
 *    create-or-update of the SAME page id, scope-conflict refusal) was executed
 *    against a real isolated Magento test store during the [70] correction
 *    proof. On YOUR installation it is still your operator duty to run
 *    \`--dry-run\` first. No credentials of any kind are embedded and none are
 *    needed.
 */

// ---- Declared target: the single source of truth for every code path ------------------------
const DET_TARGET = [
    'identifier' => ${phpSingleQuoted(cmsInstall.identifier)},
    'title' => ${phpSingleQuoted(cmsInstall.title)},
    'storeId' => ${cmsInstall.storeId},
    'active' => ${cmsInstall.active ? "true" : "false"},
];

// ---- Provenance metadata (json_encode form; no credentials, no secrets) ---------------------
const DET_PROVENANCE_JSON = ${provenanceJson};

/**
 * Byte-exact embedded Page Builder content — the ONLY place the content bytes
 * live in this file. Embedding: ${embedNote}.
 *
 * Seam note: DET's test probe defines DET_CMS_INSTALLER_INCLUDED, includes this
 * file and calls this function directly to assert the returned bytes equal the
 * bundle's pagebuilder-content.html byte-for-byte (see the emitted entry-point
 * guard below: an included file never executes).
 */
function det_pb_embedded_content(): string
{
    return ${embedded.expression};
}

// ---- Entry point (runs ONLY when this file is executed directly as CLI) ---------------------
if (defined('DET_CMS_INSTALLER_INCLUDED')) {
    // Included for inspection/probing (the embedding seam) — never execute.
    return;
}
if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, 'det-cms-installer: CLI only — non-CLI execution is refused.' . PHP_EOL);
    exit(1);
}
if (!isset($argv) || realpath((string) $argv[0]) !== __FILE__) {
    // Included from another script without the probe marker — do nothing.
    return;
}

// INSTALL LOCATION contract: <magento-root>/det-install/install-homepage.php
// Validated BEFORE any Magento-dependent class is declared: PHP binds a class
// implementing \Magento\Framework\AppInterface only when execution reaches the
// declaration, so a wrong placement below is a STDERR message + exit 1 — never
// a fatal, and the file stays lint/probe-safe outside a Magento checkout.
$magentoRoot = realpath(__DIR__ . '/..');
if ($magentoRoot === false || !is_file($magentoRoot . '/app/bootstrap.php')) {
    fwrite(STDERR, 'det-cms-installer: wrong install location — expected <magento-root>/det-install/ (resolved candidate ' . var_export(__DIR__ . '/..', true) . ' carries no app/bootstrap.php). Nothing was written.' . PHP_EOL);
    exit(1);
}

if (in_array('--dry-run', $argv, true)) {
    // Dry run: the bootstrap file's presence is validated above; the Magento
    // application is NOT booted and NOTHING is written. The exact plan:
    $planContent = det_pb_embedded_content();
    $mediaPlan = [];
    $mediaPlanProblems = [];
    $mediaSourceDir = __DIR__ . '/media';
    // [74 C74-2] validate the media tree even in dry-run: a symlinked media root
    // or symlinked media entry is a refusal condition for the REAL run, so the
    // plan must fail loudly (exit nonzero) instead of listing outside content.
    if (is_link($mediaSourceDir)) {
        $mediaPlanProblems[] = 'bundle media root (media/) is a symbolic link — refused';
    } elseif (is_dir($mediaSourceDir)) {
        $iterator = new \\RecursiveIteratorIterator(
            new \\RecursiveDirectoryIterator($mediaSourceDir, \\FilesystemIterator::SKIP_DOTS),
            \\RecursiveIteratorIterator::SELF_FIRST
        );
        foreach ($iterator as $item) {
            if ($item->isLink()) {
                $mediaPlanProblems[] = 'symlink inside the bundle media tree (refused): ' . substr($item->getPathname(), strlen($mediaSourceDir) + 1);
                continue;
            }
            if ($item->isFile()) {
                $relPath = substr($item->getPathname(), strlen($mediaSourceDir) + 1);
                $mediaPlan[] = [
                    'source' => 'media/' . $relPath,
                    'target' => 'pub/media/' . $relPath,
                    'bytes' => $item->getSize(),
                ];
            }
        }
    }
    if (count($mediaPlanProblems) > 0) {
        fwrite(STDERR, 'det-cms-installer: REFUSING the run (dry-run validation): ' . implode('; ', $mediaPlanProblems) . '. Nothing was written — dry-run never writes.' . PHP_EOL);
        exit(1);
    }
    $dryRunPlan = [
        'mode' => 'dry-run',
        'action' => 'none — dry-run validates placement and prints the plan only',
        'identifier' => DET_TARGET['identifier'],
        'title' => DET_TARGET['title'],
        'storeId' => DET_TARGET['storeId'],
        'active' => DET_TARGET['active'],
        'contentBytes' => strlen($planContent),
        'contentSha256' => hash('sha256', $planContent),
        // [74] honest disclosure of what a REAL run would do (never done by a dry run):
        'writeMode' => 'create-or-update of the ONE declared page only; an EXISTING page under the declared scope refuses unless --force; a different store scope refuses',
        'cacheFlush' => 'on a real run only: clean Magento cache types [full_page, block_html] — a scoped clean, never flush-all',
    ];
    if (DET_TARGET['storeId'] !== 0) {
        // [74] a NON-DEFAULT store scope requires the explicit confirmation flag on a real run.
        $dryRunPlan['requiresFlags'] = ['--store-id=' . (string) DET_TARGET['storeId']];
    }
    if (count($mediaPlan) > 0) {
        $dryRunPlan['mediaAssets'] = [
            'count' => count($mediaPlan),
            'totalBytes' => array_sum(array_column($mediaPlan, 'bytes')),
            'files' => array_slice(array_column($mediaPlan, 'target'), 0, 10),
        ];
    }
    fwrite(STDOUT, json_encode($dryRunPlan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL);
    exit(0);
}

require $magentoRoot . '/app/bootstrap.php';

/**
 * A REAL \\Magento\\Framework\\AppInterface implementation in the platform's own
 * CLI-application shape (the shape \\Magento\\Framework\\App\\Cron uses): launch()
 * sets the crontab area, loads the area config, performs the CMS write through
 * the service layer and returns the constructor-injected
 * \\Magento\\Framework\\App\\Console\\Response — a REAL
 * \\Magento\\Framework\\App\\ResponseInterface whose sendResponse() EXISTS and is
 * invoked by \\Magento\\Framework\\App\\Bootstrap::run()
 * ($response = $application->launch(); $response->sendResponse();).
 *
 * A controller Result object is NEVER returned here: Result objects expose
 * renderResult(), NOT sendResponse(), so Bootstrap::run() would fatal AFTER the
 * CMS write ([70] C70-1, fixed). Declared after a successful bootstrap require
 * (see the placement guard above).
 *
 * Deliberately NOT final: Bootstrap::createApplication() resolves the app class
 * through DI, so Magento generates DetCmsInstallerApp\\Interceptor extends
 * DetCmsInstallerApp at boot. A final class makes that generation a fatal
 * ("Class DetCmsInstallerApp\\Interceptor cannot extend final class ..."),
 * which the live store-5 rerun on 2026-11-16 proved (exit 255 before any
 * write). Non-final is the native Magento AppInterface contract.
 */
class DetCmsInstallerApp implements \\Magento\\Framework\\AppInterface
{
    public const EXIT_OK = 0;
    public const EXIT_FAILURE = 1;

    /** @var \\Magento\\Framework\\App\\State */
    private $state;

    /** @var \\Magento\\Framework\\App\\Console\\Response — the CLI ResponseInterface the platform's own cron application returns */
    private $response;

    /** @var \\Magento\\Framework\\ObjectManagerInterface */
    private $objectManager;

    /** @var int recorded outcome, read via getExitCode() after Bootstrap::run() returns */
    private $exitCode = self::EXIT_OK;

    public function __construct(
        \\Magento\\Framework\\App\\State $state,
        \\Magento\\Framework\\App\\Console\\Response $response,
        \\Magento\\Framework\\ObjectManagerInterface $objectManager
    ) {
        $this->state = $state;
        $this->response = $response;
        $this->objectManager = $objectManager;
    }

    public function launch()
    {
        // Area/boot semantics of the platform's own CLI application
        // (\\Magento\\Framework\\App\\Cron::launch()): crontab area + area config.
        $area = \\Magento\\Framework\\App\\Area::AREA_CRONTAB;
        $this->state->setAreaCode($area);
        /** @var \\Magento\\Framework\\ObjectManager\\ConfigLoaderInterface $configLoader */
        $configLoader = $this->objectManager->get(
            \\Magento\\Framework\\ObjectManager\\ConfigLoaderInterface::class
        );
        $this->objectManager->configure($configLoader->load($area));
        try {
            $this->execute();
            $this->response->setCode(self::EXIT_OK);
        } catch (\\Throwable $e) {
            $this->failWith($e);
        }
        // A REAL \\Magento\\Framework\\App\\ResponseInterface — Bootstrap::run()
        // invokes sendResponse() on it, which (for this CLI response) exits the
        // process with the recorded code.
        return $this->response;
    }

    public function catchException(\\Magento\\Framework\\App\\Bootstrap $bootstrap, \\Exception $exception)
    {
        // Reachable only for exceptions escaping launch() itself. Handled here
        // (return true) so Bootstrap::run() does not rethrow; the failure exit
        // code stays truthful via getExitCode() in the epilogue below.
        $this->failWith($exception);
        return true;
    }

    public function getExitCode(): int
    {
        return $this->exitCode;
    }

    /**
     * Report on STDERR and record the failure exit code — the ONLY exit-decision
     * point of the application (no exit() inside the write path).
     */
    private function failWith(\\Throwable $e): void
    {
        fwrite(STDERR, 'det-cms-installer: ' . $e->getMessage() . PHP_EOL);
        $this->exitCode = self::EXIT_FAILURE;
        $this->response->setCode(self::EXIT_FAILURE);
    }

    /**
     * Create-or-update the ONE declared target, strictly keyed on
     * (identifier, store scope). Refuses loudly on any ambiguity; never touches
     * any other page; never reads or writes web/default/cms_home_page. Any
     * refusal is a thrown \\RuntimeException (a recorded exit 1, never a partial
     * write and never a silent guess), and EVERY refusal below is raised BEFORE
     * the first filesystem or database write — a refused run leaves the
     * installation byte-for-byte untouched ([74] hardening):
     * 1. explicit confirmation flag --store-id=<n> for a NON-DEFAULT store scope;
     * 2. bundle media tree integrity (symlinks, traversal segments) — refused;
     * 3. existing-page collisions under a different store scope — refused;
     * 4. ambiguous targets — refused;
     * 5. an EXISTING page under the declared scope refuses unless --force;
     * 6. existing pub/media files with DIFFERENT bytes refuse unless --force
     *    (byte-identical files are skipped — idempotent reruns).
     */
    private function execute(): void
    {
        $content = det_pb_embedded_content();
        $storeId = (int) DET_TARGET['storeId'];
        $identifier = (string) DET_TARGET['identifier'];
        $cliArgs = is_array($_SERVER['argv'] ?? null) ? $_SERVER['argv'] : [];
        $force = in_array('--force', $cliArgs, true);

        // ---- Gate 1: EXPLICIT confirmation flag for a NON-DEFAULT store scope ---------------
        if ($storeId !== 0) {
            $hasStoreFlag = false;
            $flagStoreId = null;
            $argCount = count($cliArgs);
            for ($i = 0; $i < $argCount; $i++) {
                $arg = (string) $cliArgs[$i];
                if (strpos($arg, '--store-id=') === 0) {
                    $hasStoreFlag = true;
                    $flagStoreId = (int) substr($arg, strlen('--store-id='));
                } elseif ($arg === '--store-id' && $i + 1 < $argCount) {
                    $hasStoreFlag = true;
                    $flagStoreId = (int) $cliArgs[$i + 1];
                }
            }
            if (!$hasStoreFlag) {
                throw new \\RuntimeException(
                    'REFUSING to write: this bundle targets a NON-DEFAULT store scope (store_id=' . (string) $storeId . '). A real run must pass the explicit matching flag --store-id=' . (string) $storeId . ' to confirm the store scope (--dry-run needs no flag). Nothing was written.'
                );
            }
            if ($flagStoreId !== $storeId) {
                throw new \\RuntimeException(
                    'REFUSING to write: the passed --store-id flag (' . (string) $flagStoreId . ') does not match the declared store_id=' . (string) $storeId . '. This script writes ONLY its declared store scope; nothing was written.'
                );
            }
        }

        // ---- Gate 2: bundle media tree integrity (validation ONLY — no writes) -------------
        $mediaSourceDir = __DIR__ . '/media';
        $mediaEntries = [];
        $mediaProblems = [];
        // [74 C74-2] the entry-level isLink() guard below never sees the ROOT of the
        // media tree: is_dir() would follow a symlinked media/ root and iterate an
        // outside tree. Refuse the root before any iteration or read.
        if (is_link($mediaSourceDir)) {
            throw new \\RuntimeException(
                'REFUSING the run: the bundle media root (media/) is a symbolic link — bundle media must be a real directory inside det-install/. Nothing was written.'
            );
        }
        if (is_dir($mediaSourceDir)) {
            $iterator = new \\RecursiveIteratorIterator(
                new \\RecursiveDirectoryIterator($mediaSourceDir, \\FilesystemIterator::SKIP_DOTS),
                \\RecursiveIteratorIterator::LEAVES_ONLY
            );
            /** @var \\SplFileInfo $item */
            foreach ($iterator as $item) {
                if (!$item->isFile()) {
                    continue;
                }
                $relPath = substr($item->getPathname(), strlen($mediaSourceDir) + 1);
                // A symlinked media entry could smuggle out-of-tree content into
                // pub/media: refuse the run before anything is written.
                if ($item->isLink()) {
                    $mediaProblems[] = 'symlink inside the bundle media tree (refused): ' . $relPath;
                    continue;
                }
                $unsafeReason = null;
                if ($relPath === '' || strpos($relPath, "\\0") !== false || strpos($relPath, '\\\\') !== false) {
                    $unsafeReason = 'unsafe relative media path';
                } elseif ($relPath[0] === '/') {
                    $unsafeReason = 'absolute relative media path';
                } else {
                    foreach (explode('/', $relPath) as $segment) {
                        if ($segment === '' || $segment === '.' || $segment === '..') {
                            $unsafeReason = 'path traversal segment in relative media path';
                            break;
                        }
                    }
                }
                if ($unsafeReason !== null) {
                    $mediaProblems[] = $unsafeReason . ' (refused): ' . var_export($relPath, true);
                    continue;
                }
                $mediaEntries[] = [$item->getPathname(), $relPath];
            }
            if (count($mediaProblems) > 0) {
                throw new \\RuntimeException(
                    'REFUSING the run: the bundle media tree carries unsafe entr(ies) — ' . implode('; ', $mediaProblems) . '. Nothing was written.'
                );
            }
        }

        // ---- Gate 3+4: existing-page collisions and ambiguity (read-only lookups) ----------
        // Find existing pages STRICTLY by the declared identifier — no fuzzy or
        // partial match, no other page is ever considered.
        /** @var \\Magento\\Cms\\Model\\ResourceModel\\Page\\Collection $collection */
        $collection = $this->objectManager
            ->create(\\Magento\\Cms\\Model\\ResourceModel\\Page\\CollectionFactory::class)
            ->create();
        $collection->addFieldToFilter('identifier', $identifier);

        $candidates = [];
        $conflicts = [];
        /** @var \\Magento\\Cms\\Model\\Page $page */
        foreach ($collection as $page) {
            $storeIds = $page->getStoreId();
            $storeIds = is_array($storeIds)
                ? array_map('intval', array_values($storeIds))
                : [(int) $storeIds];
            // EXACT store-set match with the declared scope (store 0 is the
            // all-store-views scope and is NOT interchangeable with a specific
            // store): any different store set is a loud refusal, not a guess.
            if ($storeIds === [$storeId]) {
                $candidates[] = ['page' => $page, 'storeIds' => $storeIds];
            } else {
                $conflicts[] = ['page' => $page, 'storeIds' => $storeIds];
            }
        }

        if (count($conflicts) > 0) {
            $lines = [];
            foreach ($conflicts as $conflict) {
                $lines[] = 'cms page id=' . (string) $conflict['page']->getId()
                    . ' store_id=' . json_encode($conflict['storeIds']);
            }
            throw new \\RuntimeException(
                'REFUSING to write: cms page(s) with the same identifier exist under a DIFFERENT store scope than the declared store_id=' . (string) $storeId . ' (' . implode('; ', $lines) . '). Nothing was written; resolve the collision manually (DET never re-scopes or guesses).'
            );
        }
        if (count($candidates) > 1) {
            throw new \\RuntimeException(
                'REFUSING to write: ' . (string) count($candidates) . ' cms page(s) already match the identifier under the declared store scope — ambiguous target, nothing was written.'
            );
        }

        // ---- Gate 5: an EXISTING page is never overwritten silently ------------------------
        $action = 'created';
        if (count($candidates) === 1) {
            if (!$force) {
                throw new \\RuntimeException(
                    'REFUSING to write: cms page id=' . (string) $candidates[0]['page']->getId() . ' already exists with the declared identifier under the declared store scope. Re-run with --force to update it in place (the script does NOT back up the previous content — record its page id and restore it in Admin if needed). Nothing was written.'
                );
            }
            $action = 'updated';
        }

        // ---- Gate 6: media overwrite classification (read-only hashing, no writes) ---------
        $magentoRoot = realpath(__DIR__ . '/..');
        $pubMediaDir = $magentoRoot . '/pub/media';
        $copyList = [];
        $mediaConflicts = [];
        $mediaSkipped = 0;
        foreach ($mediaEntries as $entry) {
            $sourcePath = $entry[0];
            $relPath = $entry[1];
            $targetPath = $pubMediaDir . '/' . $relPath;
            if (is_file($targetPath)) {
                $sourceHash = hash_file('sha256', $sourcePath);
                $targetHash = hash_file('sha256', $targetPath);
                if (is_string($sourceHash) && $sourceHash === $targetHash) {
                    // Byte-identical: an idempotent rerun, not a change.
                    $mediaSkipped++;
                } else {
                    $mediaConflicts[] = ['source' => $sourcePath, 'rel' => $relPath, 'target' => $targetPath];
                }
            } else {
                $copyList[] = ['source' => $sourcePath, 'rel' => $relPath, 'target' => $targetPath];
            }
        }
        if (count($mediaConflicts) > 0 && !$force) {
            $conflictNames = [];
            foreach ($mediaConflicts as $mediaConflict) {
                $conflictNames[] = $mediaConflict['rel'];
            }
            throw new \\RuntimeException(
                'REFUSING to overwrite existing pub/media file(s) with DIFFERENT bytes: ' . implode('; ', $conflictNames) . '. Re-run with --force to replace them (no backup is taken). Nothing was written.'
            );
        }
        if ($force && count($mediaConflicts) > 0) {
            $copyList = array_merge($copyList, $mediaConflicts);
        }

        // ---- Gate 6.5: destination preflight (read-only — still no writes) ------------------
        // [74 C74-2] is_file()/copy() FOLLOW symlinks: a preexisting symlinked destination
        // file used to be classified, then (with --force) copied THROUGH the link —
        // overwriting its outside target — with the realpath containment check only
        // running AFTER the destructive write. Refuse BEFORE the first mkdir/copy/CMS
        // write instead: every planned destination must be a real path inside a real
        // directory chain under pub/media. Iterate ALL bundle media entries (even
        // byte-identical skips): a symlink standing where the bundle owns a file is a
        // trust-boundary change regardless of what would have been written.
        $destProblems = [];
        foreach ($mediaEntries as $entry) {
            $candidate = $pubMediaDir . '/' . $entry[1];
            if (is_link($candidate)) {
                $destProblems[] = 'symlinked destination file (refused even with --force): ' . $entry[1];
                continue;
            }
            // Walk every EXISTING ancestor from the destination's directory up to
            // pub/media: a symlinked ancestor dir could redirect the write outside
            // pub/media. Non-existent segments will be created fresh inside a
            // contained chain, so only existing links matter here.
            $walk = dirname($candidate);
            while (true) {
                if (is_link($walk)) {
                    $destProblems[] = 'symlinked destination directory for ' . $entry[1] . ' (via ' . $walk . ')';
                    break;
                }
                if ($walk === $pubMediaDir) {
                    break;
                }
                $parent = dirname($walk);
                if ($parent === $walk) {
                    break;
                }
                $walk = $parent;
            }
        }
        if (count($destProblems) > 0) {
            throw new \\RuntimeException(
                'REFUSING media copy BEFORE any write: symlinked destination(s) detected in pub/media — ' . implode('; ', $destProblems) . '. Nothing was written; remove or replace the symlink(s) manually first (DET never writes through a link, even with --force).'
            );
        }

        /** @var \\Magento\\Cms\\Api\\PageRepositoryInterface $pageRepository */
        $pageRepository = $this->objectManager->create(\\Magento\\Cms\\Api\\PageRepositoryInterface::class);

        // ---- WRITES START HERE: every refusal above happened before the first write --------
        $copiedMediaCount = 0;
        $copiedMediaBytes = 0;
        if (count($copyList) > 0) {
            if (!is_dir($pubMediaDir)) {
                if (!@mkdir($pubMediaDir, 0755, true) && !is_dir($pubMediaDir)) {
                    throw new \\RuntimeException('Failed to create the pub/media destination directory: ' . $pubMediaDir);
                }
            }
            $pubMediaReal = realpath($pubMediaDir);
            if ($pubMediaReal === false || $pubMediaReal === '/') {
                throw new \\RuntimeException('Cannot resolve the pub/media destination: ' . $pubMediaDir);
            }
            $pubMediaPrefix = $pubMediaReal . '/';
            foreach ($copyList as $copyEntry) {
                $targetPath = $pubMediaDir . '/' . $copyEntry['rel'];
                $targetDir = dirname($targetPath);
                if (!is_dir($targetDir)) {
                    if (!@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
                        throw new \\RuntimeException('Failed to create directory: ' . $targetDir);
                    }
                }
                $targetDirReal = realpath($targetDir);
                // CONTAINMENT: the RESOLVED destination directory must stay inside
                // the RESOLVED pub/media — a symlinked or aliased escape refuses.
                if ($targetDirReal === false || strpos($targetDirReal . '/', $pubMediaPrefix) !== 0) {
                    throw new \\RuntimeException('REFUSING media copy: resolved destination escapes pub/media (rel: ' . $copyEntry['rel'] . ').');
                }
                $containedTarget = $targetDirReal . '/' . basename($copyEntry['rel']);
                if (!@copy($copyEntry['source'], $containedTarget)) {
                    throw new \\RuntimeException('Failed to copy media asset to: ' . $containedTarget);
                }
                @chmod($containedTarget, 0644);
                $writtenReal = realpath($containedTarget);
                if ($writtenReal === false || strpos($writtenReal . '/', $pubMediaPrefix) !== 0) {
                    throw new \\RuntimeException('REFUSING media copy: written path escaped pub/media (rel: ' . $copyEntry['rel'] . ').');
                }
                $copiedMediaCount++;
                $copiedMediaBytes += (int) filesize($copyEntry['source']);
            }
        }
        if ($copiedMediaCount > 0 || $mediaSkipped > 0) {
            fwrite(STDOUT, sprintf(
                'det-cms-installer: media copy to pub/media/ — copied %d file(s) (%d bytes), skipped %d byte-identical file(s)' . PHP_EOL,
                $copiedMediaCount,
                $copiedMediaBytes,
                $mediaSkipped
            ));
        }

        if ($action === 'updated') {
            $page = $candidates[0]['page'];
        } else {
            /** @var \\Magento\\Cms\\Model\\Page $page */
            $page = $this->objectManager->create(\\Magento\\Cms\\Model\\PageFactory::class)->create();
            $page->setIdentifier($identifier);
        }
        // EXPLICIT declared store scope — the only scope this script may write.
        $page->setStoreId([$storeId]);
        $page->setTitle(DET_TARGET['title']);
        $page->setContent($content);
        $page->setIsActive((bool) DET_TARGET['active']);

        $saved = $pageRepository->save($page);
        fwrite(STDOUT, sprintf(
            'det-cms-installer: action=%s page_id=%s identifier=%s title=%s store_id=%d active=%s content_bytes=%d content_sha256=%s provenance=%s' . PHP_EOL,
            $action,
            (string) $saved->getId(),
            $identifier,
            (string) DET_TARGET['title'],
            $storeId,
            DET_TARGET['active'] ? 'true' : 'false',
            strlen($content),
            hash('sha256', $content),
            DET_PROVENANCE_JSON
        ));

        // Cache refresh: clean ONLY the scoped CMS-affecting cache types so the new
        // page and media render immediately — a scoped clean, NEVER a flush-all.
        try {
            /** @var \\Magento\\Framework\\App\\Cache\\Manager $cacheManager */
            $cacheManager = $this->objectManager->get(\\Magento\\Framework\\App\\Cache\\Manager::class);
            $cacheManager->clean(['full_page', 'block_html']);
            fwrite(STDOUT, 'det-cms-installer: cleaned cache types [full_page, block_html]' . PHP_EOL);
        } catch (\\Throwable $cacheEx) {
            fwrite(STDOUT, 'det-cms-installer: notice — cache clean skipped (' . $cacheEx->getMessage() . ')' . PHP_EOL);
        }
    }
}

$bootstrap = \\Magento\\Framework\\App\\Bootstrap::create(BP, $_SERVER);
/** @var DetCmsInstallerApp $app */
$app = $bootstrap->createApplication(DetCmsInstallerApp::class);
$bootstrap->run($app);
// Success path: Bootstrap::run() invoked sendResponse() on the returned
// ResponseInterface, which exited the process with the recorded code (platform
// behavior of \\Magento\\Framework\\App\\Console\\Response).
// Escaped-exception path: catchException() recorded the failure — exit it.
exit($app->getExitCode());
`;
}

/* ------------------------ mapping-and-gaps renderer ----------------------- */

const DISPOSITIONS = [
   "mapped",
   "gap",
   "decoration-merged",
   "excluded",
   "skipped",
] as const;

/**
 * Render `mapping-and-gaps.json`: the operator-facing, honest mapping ledger for the
 * install bundle. Deterministic: entries keep the compose report's own order; counts are
 * computed over all five dispositions (present even at zero, so the shape is stable);
 * per-entry reasons carry the mapping note plus every compose diagnostic addressed to that
 * node; `gaps` lists the build gap codes first (manifest order) then the compose
 * diagnostics (report order). No timestamps, no volatile fields.
 */
export function renderMappingAndGaps(input: MappingAndGapsInput): string {
   const { source, cmsInstall, report, buildGaps } = input;
   const mapping = Array.isArray(report.mapping) ? report.mapping : [];
   const diagnostics = Array.isArray(report.diagnostics)
      ? report.diagnostics
      : [];

   const counts: Record<(typeof DISPOSITIONS)[number], number> = {
      mapped: 0,
      gap: 0,
      "decoration-merged": 0,
      excluded: 0,
      skipped: 0,
   };
   const entries = mapping.map((entry) => {
      if ((DISPOSITIONS as readonly string[]).includes(entry.disposition)) {
         counts[entry.disposition] += 1;
      }
      const reasons: string[] = [];
      if (typeof entry.note === "string" && entry.note.length > 0) {
         reasons.push(entry.note);
      }
      for (const d of diagnostics) {
         if (
            d.subject &&
            d.subject.type === "node" &&
            d.subject.id === entry.sourceNodeId
         ) {
            reasons.push(`${d.code}: ${d.message}`);
         }
      }
      return {
         nodeId: entry.sourceNodeId,
         ...(typeof entry.sourceName === "string"
            ? { sourceName: entry.sourceName }
            : {}),
         disposition: entry.disposition,
         ...(entry.target ? { target: entry.target } : {}),
         reasons,
      };
   });

   const gaps = [
      ...buildGaps.map((g) => ({
         code: g.code,
         message: g.message,
         ...(typeof g.count === "number" ? { count: g.count } : {}),
      })),
      ...diagnostics.map((d) => ({
         code: d.code,
         severity: d.severity,
         message: d.message,
         ...(d.subject ? { subject: d.subject } : {}),
      })),
   ];

   const doc = {
      schemaVersion: 1 as const,
      kind: "det-mapping-and-gaps" as const,
      source: { sourceId: source.sourceId, revisionId: source.revisionId },
      cmsInstall: {
         identifier: cmsInstall.identifier,
         title: cmsInstall.title,
         storeId: cmsInstall.storeId,
         active: cmsInstall.active,
      },
      ledger: { counts, entries },
      gaps,
   };
   // Same serialization convention as every CLI JSON artifact: 2-space indent + newline.
   return JSON.stringify(doc, null, 2) + "\n";
}

/* --------------------------- README renderer ------------------------------ */

/**
 * Render the Vietnamese operator README (`README.md` of the install bundle): what the
 * bundle is, the copy step, the dry-run-first workflow, the explicit write warning, the
 * idempotency + rollback guidance, and the honesty pointer to mapping-and-gaps.json.
 */
export function renderInstallerReadme(input: InstallerReadmeInput): string {
   const { cmsInstall, provenance } = input;
   return `# DET Studio — bộ cài trang CMS (Magento Page Builder)

Bó artifact này do \`det build\` sinh **offline** và **byte-xác định** (xây lại cùng input →
cùng byte). Nó KHÔNG chứa dữ liệu đăng nhập, KHÔNG kết nối mạng và **DET tự thân KHÔNG BAO GIỜ
ghi vào Magento** — mọi thao tác ghi diễn ra ở đây, khi chính bạn chạy script bên dưới trong
chính bản cài Magento của bạn.

## Bó gồm những gì

| Tệp | Vai trò |
|---|---|
| \`install-homepage.php\` | script cài trang CMS (chạy trong Magento của bạn) |
| \`pagebuilder-content.html\` | nội dung Page Builder chính xác đến từng byte (bản sao của \`03-composition/native-content.html\`) |
| \`mapping-and-gaps.json\` | sổ cái mapping thẳng thắn: cái gì đã map, cái nào là gap/excluded/skipped |
| \`build-manifest.json\` | bảng kê toàn bộ bó kèm sha256 từng tệp để kiểm chứng |
| \`media/\` (nếu có) | thư mục hình ảnh/media đi kèm (script tự động copy vào \`pub/media/\`) |

## Mục tiêu khai báo tường minh (không đoán)

- identifier: \`${cmsInstall.identifier}\`
- title: \`${cmsInstall.title}\`
- storeId: ${cmsInstall.storeId}
- active: ${cmsInstall.active ? "true" : "false"}
- Nguồn (offline build): \`${provenance.sourceId}\` @ revision \`${provenance.revisionId}\`
  (profile \`${provenance.profileId}\`, platform \`${provenance.platformId}\`)

Script **chỉ** tác động đúng trang có identifier trên, trong đúng store scope khai báo.
Không bao giờ đọc/ghi giá trị cấu hình \`web/default/cms_home_page\` (trang chủ mặc định của
store **không bị đụng tới**) và không bao giờ đụng vào trang CMS nào khác. Nếu tồn tại trang
cùng identifier nhưng thuộc bộ store **khác**, script **từ chối chạy** (exit 1) — không đoán.

## Cách chạy

1. Copy **toàn bộ bó** vào \`<magento-root>/det-install/\` (script giải mã gốc Magento bằng
   \`realpath(__DIR__ . '/..')\` và yêu cầu \`app/bootstrap.php\`; đặt sai chỗ thì nó báo lỗi
   STDERR + exit 1, không bao giờ fatal).
2. Chạy **dry-run TRƯỚC** — chỉ in kế hoạch (identifier/title/store/active, số byte nội dung,
   sha256, cờ bắt buộc nếu có, media sẽ copy, và loại cache sẽ làm sạch) và **không ghi gì cả**:

   \`\`\`bash
   php install-homepage.php --dry-run
   \`\`\`

3. Cài thật (CẢNH BÁO: lệnh dưới **GHI TRANG CMS** trong bản cài Magento này):

   \`\`\`bash
   php install-homepage.php
   \`\`\`

## Cờ xác nhận bắt buộc (đọc kỹ — script từ chối nếu thiếu)

- **Store khác mặc định**: nếu \`storeId\` khai báo **khác 0**, lệnh cài thật PHẢI kèm cờ khớp
  \`--store-id=<storeId>\` (ví dụ \`--dry-run\` thì không cần cờ, nhưng cài thật thì bắt buộc).
  Thiếu cờ hoặc cờ sai số → script **từ chối chạy** (exit 1), không ghi gì cả.
- **Không ghi đè im lặng**: nếu trang CMS với identifier trên **đã tồn tại** trong đúng store
  scope khai báo, script **từ chối** (exit 1) cho tới khi bạn thêm cờ \`--force\` để ghi đè
  một cách tường minh. Trang mới tạo thì không cần \`--force\`.
- **Media ghi đè**: tệp đã có sẵn trong \`pub/media/\` nhưng **khác byte** cũng bị từ chối nếu
  thiếu \`--force\`; tệp **giống hệt về byte** thì được bỏ qua (chạy lại an toàn).

## Cảnh báo ghi (đọc kỹ)

**CHẠY SCRIPT NÀY SẼ GHI TRANG CMS TRONG CHÍNH BẢN CÀI MAGENTO NÀY.** DET không bao giờ tự
ghi; đây là script do operator thực thi. Hãy chạy \`--dry-run\` trước. Script chỉ ghi qua tầng
service \\Magento\\Cms\\Api\\PageRepositoryInterface (không có SQL trực tiếp lên bảng cms_page).

## Media (ảnh đi kèm bó)

Các tệp trong thư mục \`media/\` của bó được copy **CHỈ** vào \`<magento-root>/pub/media/\`
(kiểm tra containment bằng realpath; symlink trong cây media của bó hoặc bất kỳ segment
\`..\` nào sẽ khiến script **từ chối chạy trước khi ghi thứ gì**; quyền thư mục/tệp là
0755/0644). Tệp thương merchant đã có sẵn cùng nội dung byte thì được bỏ qua — không ghi lại.

## Cache (chỉ làm sạch có chọn lọc)

Sau khi ghi trang thành công, script **chỉ** làm sạch 2 loại cache \`[full_page, block_html]\`
(làm sạch có chọn lọc — **KHÔNG BAO GIỜ flush-all**) để trang và media mới hiển thị ngay.
Dry-run cũng in rõ thông báo này trong kế hoạch.

## Chạy lại là an toàn (idempotent)

Chạy lần hai (với đúng bộ cờ, kể cả \`--force\` khi trang đã tồn tại) báo \`action=updated\`
với cùng page id — create-or-update khoá theo cặp (identifier, store scope), không sinh
trang trùng; media giống byte được bỏ qua.

## Hoàn tác (rollback)

- Script in ra \`action\` và \`page_id\` khi chạy — **ghi lại page id này**.
- Trước lần chạy đầu, hãy sao lưu nội dung hiện có của trang (Admin hoặc DB backup của bạn);
  muốn hoàn tác, khôi phục nội dung cũ trong Admin theo đúng page id đã in.
- Toàn bộ nội dung mới nằm nguyên vẹn trong \`pagebuilder-content.html\` — nếu cần cài lại
  hoặc đối chiếu, đó là nguồn byte-chính-xác.

## Trung thực về độ phủ

\`mapping-and-gaps.json\` liệt kê từng node nguồn với trạng thái mapped / gap /
decoration-merged / excluded / skipped cùng lý do. **Độ phủ compose từng phần KHÔNG đồng nghĩa
pixel-perfect**: mọi gap đều được ghi nhận, không có gì bị "vá" im lặng. Hình dạng chạy thật
của script (launch trả về \\Magento\\Framework\\App\\ResponseInterface có sendResponse() thật —
không bao giờ trả về controller Result —, ghi qua service layer, idempotent cùng page id, từ
chối xung đột store scope) **đã được chạy chứng minh trên một store Magento cách ly** trong đợt
sửa lỗi [70]; trên bản cài Magento của BẠN, hãy luôn chạy \`--dry-run\` trước — đó là trách
nhiệm operator cuối cùng.
`;
}
