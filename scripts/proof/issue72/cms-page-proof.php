<?php
declare(strict_types=1);

/**
 * [72] W-E CMS page proof driver for the isolated det_preview QA store (issue #72).
 *
 * STATUS: READY (write modes implemented) — but NOT EXECUTED in write modes during
 * the discovery mission. Every WRITE goes through Magento's service layer
 * (\Magento\Cms\Api\PageRepositoryInterface), ported byte-faithfully from the
 * [70] generated-installer write path (src/modules/magento/adapters/
 * magento-cms-installer/render-cms-installer.ts), which was PROVEN LIVE on store 5
 * in [70] C70-2 (create page_id=46, update, idempotent rerun, fail-closed scope
 * conflict, cleanup via deleteById — receipt
 * docs/converter/RECEIPT-ISSUE70-CORRECTION.md). No raw SQL writes, ever.
 *
 * Modes:
 *   verify   READ-ONLY. SELECTs the page row by identifier via PDO (env.php creds)
 *            and prints JSON: page row (sha256 of content), store_ids, and a Page
 *            Builder structure summary (data-content-type counts by type).
 *            Exit 0 when the page is found (scope_match says whether its store set
 *            equals [store]), exit 1 when not found.
 *   create   WRITE. Creates the page at the declared (identifier, [store]) scope.
 *            Refuses if a page with the identifier already exists under ANY scope.
 *   update   WRITE. Updates ONLY the page whose store set is EXACTLY [store].
 *            Refuses if it does not exist or exists under a different store set.
 *   cleanup  WRITE. Deletes ONLY the page whose store set is EXACTLY [store].
 *            Nothing found => action=none, exit 0 (idempotent).
 *
 * Safety rails (all mandatory):
 *   - store 5 (det_preview) ONLY is the sanctioned target for this issue; the
 *     --store value must be a positive integer and mutating modes additionally
 *     refuse store 0 (all-store scope).
 *   - mutating modes require an explicit --yes AND a test identifier matching
 *     /^det-qa-/ (typo protection: no real page can ever be targeted).
 *   - create/update require --file (master-format HTML), read as raw bytes.
 *   - the Magento boot + write path mirrors the [70] generated installer:
 *     crontab-area CLI app (\Magento\Framework\App\Cron shape) returning a REAL
 *     \Magento\Framework\App\Console\Response — never a controller Result —
 *     with ONE exit-decision point and loud, no-write refusals.
 *
 * Usage:
 *   php scripts/proof/issue72/cms-page-proof.php --mode=verify  --identifier=<id> --store=5
 *   php scripts/proof/issue72/cms-page-proof.php --mode=create  --identifier=det-qa-72 --store=5 --file=<master.html> --title=<t> --yes
 *   php scripts/proof/issue72/cms-page-proof.php --mode=update  --identifier=det-qa-72 --store=5 --file=<master.html> --title=<t> --yes
 *   php scripts/proof/issue72/cms-page-proof.php --mode=cleanup --identifier=det-qa-72 --store=5 --yes
 *
 * Exit codes: 0 success · 1 refusal/failure · 2 usage error.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "cms-page-proof: CLI only\n");
    exit(1);
}

const MUTATING_IDENT_PREFIX = 'det-qa-';

/* ------------------------------- argument parse --------------------------- */

$mode = $identifier = $file = $title = $magentoRoot = null;
$store = null;
$yes = false;

foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--mode=')) {
        $mode = substr($arg, 7);
    } elseif (str_starts_with($arg, '--identifier=')) {
        $identifier = substr($arg, 13);
    } elseif (str_starts_with($arg, '--store=')) {
        $store = substr($arg, 8);
    } elseif (str_starts_with($arg, '--file=')) {
        $file = substr($arg, 7);
    } elseif (str_starts_with($arg, '--title=')) {
        $title = substr($arg, 8);
    } elseif (str_starts_with($arg, '--magento-root=')) {
        $magentoRoot = substr($arg, 15);
    } elseif ($arg === '--yes') {
        $yes = true;
    } elseif ($arg === '--help' || $arg === '-h') {
        // usage block mirrors the docblock above
        $help = <<<'TXT'
        usage:
          php cms-page-proof.php --mode=verify  --identifier=<id> --store=5
          php cms-page-proof.php --mode=create  --identifier=det-qa-72 --store=5 --file=<master.html> --title=<t> --yes
          php cms-page-proof.php --mode=update  --identifier=det-qa-72 --store=5 --file=<master.html> --title=<t> --yes
          php cms-page-proof.php --mode=cleanup --identifier=det-qa-72 --store=5 --yes
        options:
          --magento-root=<path>  (default /home/thanhle/Sites/Magento/slaunchpad)
          --yes                  required for create/update/cleanup
        TXT;
        fwrite(STDOUT, $help . PHP_EOL);
        exit(0);
    } else {
        fwrite(STDERR, "cms-page-proof: unknown argument '{$arg}' (see --help)\n");
        exit(2);
    }
}

$mode = $mode === null ? null : strtolower($mode);
$mutation = in_array($mode, ['create', 'update', 'cleanup'], true);
if ($mode === null || !in_array($mode, ['verify', 'create', 'update', 'cleanup'], true)) {
    fwrite(STDERR, "cms-page-proof: --mode must be one of verify|create|update|cleanup\n");
    exit(2);
}

$magentoRoot = rtrim((string) ($magentoRoot ?? '/home/thanhle/Sites/Magento/slaunchpad'), '/');
$envFile = $magentoRoot . '/app/etc/env.php';
if (!is_file($envFile)) {
    fwrite(STDERR, "cms-page-proof: env.php not found at {$envFile}\n");
    exit(2);
}

$storeId = null;
if ($store === null || !ctype_digit($store) || (int) $store < 1) {
    fwrite(STDERR, "cms-page-proof: --store must be a positive store id (det_preview is 5)\n");
    exit(2);
}
$storeId = (int) $store;

$failUsage = function (string $msg): void {
    fwrite(STDERR, "cms-page-proof: {$msg}\n");
    exit(2);
};

// Safety rails for the WRITE modes, enforced before anything is touched.
$content = null;
if ($mutation) {
    if ($identifier === null || !str_starts_with($identifier, MUTATING_IDENT_PREFIX)) {
        $failUsage('mutating modes require an explicit test identifier with the "' . MUTATING_IDENT_PREFIX . '" prefix (got ' . var_export($identifier, true) . ')');
    }
    if ($storeId === 0) {
        $failUsage('mutating modes refuse store 0 (all-store scope) — a specific QA store view is mandatory');
    }
    if (!$yes) {
        $failUsage('mutating mode ' . $mode . ' requires explicit --yes (nothing was touched)');
    }
    if (in_array($mode, ['create', 'update'], true)) {
        if ($file === null || !is_file($file)) {
            $failUsage('mode ' . $mode . ' requires --file pointing to a master-format HTML file');
        }
        $content = file_get_contents($file);
        if ($content === false) {
            $failUsage('cannot read --file ' . $file);
        }
        if ($title === null || trim($title) === '') {
            $failUsage('mode ' . $mode . ' requires --title');
        }
    }
}

/** @var list<array<string, mixed>> */
$pdoRead = function (PDO $pdo, string $sql, array $params = []): array {
    if (!preg_match('/^\s*(SELECT|SHOW)\b/i', $sql)) {
        throw new RuntimeException('cms-page-proof: refusing non-read statement');
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = [];
    while (($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
        $rows[] = $row;
    }
    return $rows;
};

/* --------------------------------- verify --------------------------------- */
/* Pure PDO read — no Magento boot, no cache, no session, nothing written. */

if ($mode === 'verify') {
    if ($identifier === null || $identifier === '') {
        $failUsage('mode verify requires --identifier');
    }
    try {
        /** @var array<string, mixed> $env */
        $env = require $envFile;
        $conn = $env['db']['connection']['default'] ?? null;
        if (!is_array($conn)) {
            $failUsage('default DB connection not configured in env.php');
        }
        $dsn = 'mysql:host=' . $conn['host'] . ';dbname=' . $conn['dbname']
            . (isset($conn['port']) ? ';port=' . $conn['port'] : '') . ';charset=utf8';
        $pdo = new PDO($dsn, (string) $conn['username'], (string) ($conn['password'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);

        $rows = $pdoRead($pdo, <<<'SQL'
            SELECT p.page_id, p.identifier, p.title, p.is_active,
                   LOWER(SHA2(p.content, 256)) AS content_sha256, LENGTH(p.content) AS content_bytes,
                   p.update_time AS updated_at
            FROM cms_page p
            WHERE p.identifier = :identifier
            SQL, [':identifier' => $identifier]);

        if (count($rows) === 0) {
            fwrite(STDOUT, json_encode([
                'mode' => 'verify',
                'identifier' => $identifier,
                'store' => $storeId,
                'found' => false,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
            fwrite(STDERR, "cms-page-proof: verify — no cms_page row with identifier '{$identifier}'\n");
            exit(1);
        }

        $storeRows = $pdoRead(
            $pdo,
            'SELECT page_id, store_id FROM cms_page_store WHERE page_id IN (' .
            implode(',', array_fill(0, count($rows), '?')) . ') ORDER BY page_id, store_id',
            array_map(static fn (array $r): int => (int) $r['page_id'], $rows)
        );
        $storesByPage = [];
        foreach ($storeRows as $sr) {
            $storesByPage[(int) $sr['page_id']][] = (int) $sr['store_id'];
        }

        $pages = [];
        foreach ($rows as $r) {
            $contentRow = $pdoRead(
                $pdo,
                'SELECT content FROM cms_page WHERE page_id = ?',
                [(int) $r['page_id']]
            );
            $html = (string) ($contentRow[0]['content'] ?? '');
            $typeCounts = [];
            if (preg_match_all('/data-content-type="([^"]+)"/', $html, $m)) {
                foreach ($m[1] as $type) {
                    $typeCounts[$type] = ($typeCounts[$type] ?? 0) + 1;
                }
            }
            ksort($typeCounts);
            $storeIds = $storesByPage[(int) $r['page_id']] ?? [];
            $pages[] = [
                'page_id' => (int) $r['page_id'],
                'identifier' => (string) $r['identifier'],
                'title' => (string) $r['title'],
                'is_active' => (int) $r['is_active'],
                'store_ids' => $storeIds,
                'scope_match' => $storeIds === [$storeId],
                'content_sha256' => (string) $r['content_sha256'],
                'content_bytes' => (int) $r['content_bytes'],
                'updated_at' => $r['updated_at'] === null ? null : (string) $r['updated_at'],
                'structure' => [
                    'data_content_type_total' => array_sum($typeCounts),
                    'data_content_type_counts' => $typeCounts,
                ],
            ];
        }

        fwrite(STDOUT, json_encode([
            'mode' => 'verify',
            'identifier' => $identifier,
            'store' => $storeId,
            'found' => true,
            'pages' => $pages,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL);
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, 'cms-page-proof: verify failed: ' . $e->getMessage() . "\n");
        exit(1);
    }
}

/* ---------------------- WRITE modes (create/update/cleanup) ---------------------- */
/* Boot Magento exactly like the [70] generated installer and write ONLY through
 * \Magento\Cms\Api\PageRepositoryInterface. The plan is printed BEFORE the boot so
 * a refusal costs nothing. */

fwrite(STDOUT, json_encode([
    'mode' => $mode,
    'plan' => [
        'identifier' => $identifier,
        'store_id' => $storeId,
        'title' => $title,
        'content_bytes' => $content === null ? null : strlen($content),
        'content_sha256' => $content === null ? null : hash('sha256', $content),
        'source_file' => $file,
        'write_layer' => '\Magento\Cms\Api\PageRepositoryInterface (no raw SQL)',
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);

require $magentoRoot . '/app/bootstrap.php';

/**
 * CLI application in the platform's own \Magento\Framework\App\Cron shape — the
 * exact boot contract proven LIVE in [70] C70-2: launch() sets the crontab area,
 * loads its area config, performs the service-layer write and returns the
 * constructor-injected \Magento\Framework\App\Console\Response (a REAL
 * ResponseInterface whose sendResponse() Bootstrap::run() invokes). A controller
 * Result is never returned ([70] C70-1). One exit-decision point (failWith()).
 */
final class DetQa72CmsProofApp implements \Magento\Framework\AppInterface
{
    public const EXIT_OK = 0;
    public const EXIT_FAILURE = 1;

    private \Magento\Framework\App\State $state;
    private \Magento\Framework\App\Console\Response $response;
    private \Magento\Framework\ObjectManagerInterface $objectManager;
    private int $exitCode = self::EXIT_OK;

    /** @var array<string, mixed> */
    private array $plan;

    /** @param array<string, mixed> $plan mode, identifier, storeId, title, content, action */
    public function __construct(
        \Magento\Framework\App\State $state,
        \Magento\Framework\App\Console\Response $response,
        \Magento\Framework\ObjectManagerInterface $objectManager,
        array $plan
    ) {
        $this->state = $state;
        $this->response = $response;
        $this->objectManager = $objectManager;
        $this->plan = $plan;
    }

    public function launch()
    {
        $area = \Magento\Framework\App\Area::AREA_CRONTAB;
        $this->state->setAreaCode($area);
        /** @var \Magento\Framework\ObjectManager\ConfigLoaderInterface $configLoader */
        $configLoader = $this->objectManager->get(\Magento\Framework\ObjectManager\ConfigLoaderInterface::class);
        $this->objectManager->configure($configLoader->load($area));
        try {
            $this->execute();
            $this->response->setCode(self::EXIT_OK);
        } catch (\Throwable $e) {
            $this->failWith($e);
        }
        return $this->response;
    }

    public function catchException(\Magento\Framework\App\Bootstrap $bootstrap, \Exception $exception): bool
    {
        $this->failWith($exception);
        return true;
    }

    public function getExitCode(): int
    {
        return $this->exitCode;
    }

    private function failWith(\Throwable $e): void
    {
        fwrite(STDERR, 'cms-page-proof: ' . $e->getMessage() . PHP_EOL);
        $this->exitCode = self::EXIT_FAILURE;
        $this->response->setCode(self::EXIT_FAILURE);
    }

    /**
     * Strict (identifier, EXACT store set) target resolution — the [70] proven
     * fail-closed semantics: any same-identifier page under a different store
     * scope, or an ambiguous duplicate, is a loud REFUSAL with nothing written.
     */
    private function resolveTarget(): array // [action, ?Page]
    {
        $identifier = (string) $this->plan['identifier'];
        $storeId = (int) $this->plan['storeId'];

        /** @var \Magento\Cms\Model\ResourceModel\Page\Collection $collection */
        $collection = $this->objectManager
            ->create(\Magento\Cms\Model\ResourceModel\Page\CollectionFactory::class)
            ->create();
        $collection->addFieldToFilter('identifier', $identifier);

        $candidates = [];
        $conflicts = [];
        /** @var \Magento\Cms\Model\Page $page */
        foreach ($collection as $page) {
            $storeIds = $page->getStoreId();
            $storeIds = is_array($storeIds)
                ? array_map('intval', array_values($storeIds))
                : [(int) $storeIds];
            if ($storeIds === [$storeId]) {
                $candidates[] = $page;
            } else {
                $conflicts[] = ['page_id' => (int) $page->getId(), 'store_ids' => $storeIds];
            }
        }

        if (count($conflicts) > 0) {
            throw new \RuntimeException(
                'REFUSING: cms page(s) with the same identifier exist under a DIFFERENT store scope than store_id='
                . (string) $storeId . ' (' . json_encode($conflicts) . '). Nothing was written; DET never re-scopes.'
            );
        }
        if (count($candidates) > 1) {
            throw new \RuntimeException(
                'REFUSING: ' . (string) count($candidates) . ' cms page(s) match the identifier under the declared scope — ambiguous target, nothing was written.'
            );
        }

        $mode = (string) $this->plan['mode'];
        $existing = $candidates[0] ?? null;
        if ($mode === 'create') {
            if ($existing !== null) {
                throw new \RuntimeException(
                    'REFUSING: cms page id=' . (string) $existing->getId() . ' already carries this identifier at the declared scope — mode create never overwrites (use update). Nothing was written.'
                );
            }
            return ['created', null];
        }
        // update / cleanup
        if ($existing === null) {
            if ($mode === 'cleanup') {
                return ['none', null]; // idempotent cleanup: nothing to delete
            }
            throw new \RuntimeException(
                'REFUSING: no cms page with this identifier exists at the declared scope — mode update never creates (use create). Nothing was written.'
            );
        }
        return [$mode === 'cleanup' ? 'deleted' : 'updated', $existing];
    }

    private function execute(): void
    {
        $mode = (string) $this->plan['mode'];
        [$action, $page] = $this->resolveTarget();

        /** @var \Magento\Cms\Api\PageRepositoryInterface $pageRepository */
        $pageRepository = $this->objectManager->create(\Magento\Cms\Api\PageRepositoryInterface::class);

        $pageId = null;
        if ($action === 'created') {
            /** @var \Magento\Cms\Model\Page $page */
            $page = $this->objectManager->create(\Magento\Cms\Model\PageFactory::class)->create();
            $page->setIdentifier((string) $this->plan['identifier']);
            // EXPLICIT declared store scope — the only scope this script may write.
            $page->setStoreId([(int) $this->plan['storeId']]);
            $page->setTitle((string) $this->plan['title']);
            $page->setContent((string) $this->plan['content']);
            $page->setIsActive(true);
            $saved = $pageRepository->save($page);
            $pageId = (int) $saved->getId();
        } elseif ($action === 'updated') {
            $page->setStoreId([(int) $this->plan['storeId']]);
            $page->setTitle((string) $this->plan['title']);
            $page->setContent((string) $this->plan['content']);
            $page->setIsActive(true);
            $saved = $pageRepository->save($page);
            $pageId = (int) $saved->getId();
        } elseif ($action === 'deleted') {
            $pageId = (int) $page->getId();
            $pageRepository->deleteById($pageId); // the [70] proven cleanup path
        }

        fwrite(STDOUT, json_encode([
            'mode' => $mode,
            'action' => $action,
            'page_id' => $pageId,
            'identifier' => $this->plan['identifier'],
            'store_id' => (int) $this->plan['storeId'],
            'content_bytes' => $this->plan['content'] === null ? null : strlen((string) $this->plan['content']),
            'content_sha256' => $this->plan['content'] === null ? null : hash('sha256', (string) $this->plan['content']),
            'write_layer' => '\Magento\Cms\Api\PageRepositoryInterface',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    }
}

/** @var array<string, mixed> $env */
$env = require $envFile;
$conn = $env['db']['connection']['default'] ?? null;
if (!is_array($conn)) {
    fwrite(STDERR, "cms-page-proof: default DB connection not configured in env.php\n");
    exit(2);
}

$bootstrap = \Magento\Framework\App\Bootstrap::create(BP, $_SERVER);
/** @var DetQa72CmsProofApp $app */
$app = $bootstrap->createApplication(DetQa72CmsProofApp::class, [
    'plan' => [
        'mode' => $mode,
        'identifier' => $identifier,
        'storeId' => $storeId,
        'title' => $title,
        'content' => $content,
    ],
]);
$bootstrap->run($app);
// Success path: Bootstrap::run() invoked sendResponse() on the returned
// ResponseInterface, which exits with the recorded code (platform behavior of
// \Magento\Framework\App\Console\Response). Escaped-exception path: catchException()
// recorded the failure — exit it.
exit($app->getExitCode());
