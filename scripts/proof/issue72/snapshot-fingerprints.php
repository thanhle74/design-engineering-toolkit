<?php
declare(strict_types=1);

/**
 * [72] W-E isolation snapshot — read-only CMS fingerprints (issue #72).
 *
 * Connects to the local Magento database through app/etc/env.php (plain PDO,
 * SELECT-only) and prints a JSON snapshot to STDOUT:
 *
 *   meta            provenance (magento root, db name, generated_at_utc; NOT part
 *                   of the fingerprint payload — compare `fingerprint` instead)
 *   cms_pages[]     every cms_page row: page_id, identifier, title, is_active,
 *                   store_ids (from cms_page_store), content_sha256 (SHA2 of the
 *                   raw content column), updated_at (cms_page.update_time)
 *   store5_config{} core_config_data rows for scope='stores' scope_id=5
 *                   (all paths present, homepage + base_url rows included) plus
 *                   the default-scope web/unsecure/base_url + secure/base_url for
 *                   context (store 5 inherits them — no store-scoped override)
 *   counts          cms_page / cms_page_store row counts and counts by store_id
 *
 * IDEMPOTENT + READ-ONLY: opens no Magento PHP (no bootstrap, no area, no cache
 * writes, no cron side effects), issues ONLY SELECT / SHOW statements, writes no
 * file. Running it repeatedly changes nothing and the `fingerprint` payload is
 * deterministic (only `meta.generated_at_utc` differs between runs).
 *
 * Usage:
 *   php scripts/proof/issue72/snapshot-fingerprints.php [ --magento-root=<path> ]
 *
 * Exit 0 on success; non-zero on any DB/connection error (fail closed — a
 * partial snapshot is never printed).
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "snapshot-fingerprints: CLI only\n");
    exit(1);
}

$magentoRoot = '/home/thanhle/Sites/Magento/slaunchpad';
foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--magento-root=')) {
        $magentoRoot = substr($arg, strlen('--magento-root='));
    } elseif ($arg === '--help' || $arg === '-h') {
        fwrite(STDOUT, "usage: php snapshot-fingerprints.php [ --magento-root=<path> ]\n");
        exit(0);
    } else {
        fwrite(STDERR, "snapshot-fingerprints: unknown argument '{$arg}'\n");
        exit(1);
    }
}

$magentoRoot = rtrim($magentoRoot, '/');
$envFile = $magentoRoot . '/app/etc/env.php';
if (!is_file($envFile)) {
    fwrite(STDERR, "snapshot-fingerprints: env.php not found at {$envFile}\n");
    exit(1);
}

/** @var array<string, mixed> $env */
$env = require $envFile;
$conn = $env['db']['connection']['default'] ?? null;
if (!is_array($conn) || !isset($conn['host'], $conn['dbname'], $conn['username'])) {
    fwrite(STDERR, "snapshot-fingerprints: default DB connection is not configured in env.php\n");
    exit(1);
}

try {
    $dsn = 'mysql:host=' . $conn['host'] . ';dbname=' . $conn['dbname']
        . (isset($conn['port']) ? ';port=' . $conn['port'] : '') . ';charset=utf8';
    $pdo = new PDO($dsn, (string) $conn['username'], (string) ($conn['password'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Throwable $e) {
    fwrite(STDERR, 'snapshot-fingerprints: PDO connect failed: ' . $e->getMessage() . "\n");
    exit(1);
}

/**
 * Execute one read-only statement and collect all rows (SELECT/SHOW only).
 * @return list<array<string, mixed>>
 */
$fetchAll = function (PDO $pdo, string $sql): array {
    if (!preg_match('/^\s*(SELECT|SHOW)\b/i', $sql)) {
        throw new RuntimeException('snapshot-fingerprints: refusing non-read statement');
    }
    $stmt = $pdo->query($sql);
    $rows = [];
    while (($row = $stmt->fetch()) !== false) {
        $rows[] = $row;
    }
    return $rows;
};

try {
    // 1. Every cms_page row + its content fingerprint + store assignments.
    $pageRows = $fetchAll($pdo, <<<'SQL'
        SELECT p.page_id, p.identifier, p.title, p.is_active,
               LOWER(SHA2(p.content, 256)) AS content_sha256, p.update_time AS updated_at
        FROM cms_page p
        ORDER BY p.page_id
        SQL);
    $storeRows = $fetchAll($pdo, 'SELECT page_id, store_id FROM cms_page_store ORDER BY page_id, store_id');

    $storesByPage = [];
    foreach ($storeRows as $sr) {
        $storesByPage[(int) $sr['page_id']][] = (int) $sr['store_id'];
    }

    $cmsPages = [];
    foreach ($pageRows as $pr) {
        $cmsPages[] = [
            'page_id' => (int) $pr['page_id'],
            'identifier' => (string) $pr['identifier'],
            'title' => (string) $pr['title'],
            'is_active' => (int) $pr['is_active'],
            'store_ids' => $storesByPage[(int) $pr['page_id']] ?? [],
            'content_sha256' => $pr['content_sha256'] === null ? null : (string) $pr['content_sha256'],
            'updated_at' => $pr['updated_at'] === null ? null : (string) $pr['updated_at'],
        ];
    }

    // 2. Store-5 config: every override actually present, plus inherited base URLs.
    $store5Rows = $fetchAll($pdo, <<<'SQL'
        SELECT path, value
        FROM core_config_data
        WHERE scope = 'stores' AND scope_id = 5
        ORDER BY path
        SQL);
    $store5Config = [];
    foreach ($store5Rows as $cr) {
        $store5Config[(string) $cr['path']] = (string) $cr['value'];
    }

    $defaultBaseUrlRows = $fetchAll($pdo, <<<'SQL'
        SELECT path, value
        FROM core_config_data
        WHERE scope = 'default' AND scope_id = 0
          AND path IN ('web/unsecure/base_url', 'web/secure/base_url')
        ORDER BY path
        SQL);
    $defaultConfig = [];
    foreach ($defaultBaseUrlRows as $cr) {
        $defaultConfig[(string) $cr['path']] = (string) $cr['value'];
    }

    // 3. Counts.
    $pageCountRow = $fetchAll($pdo, 'SELECT COUNT(*) AS c FROM cms_page');
    $pageStoreCountRow = $fetchAll($pdo, 'SELECT COUNT(*) AS c FROM cms_page_store');
    $countByStoreRows = $fetchAll($pdo, <<<'SQL'
        SELECT store_id, COUNT(*) AS c
        FROM cms_page_store
        GROUP BY store_id
        ORDER BY store_id
        SQL);
    $countByStore = [];
    foreach ($countByStoreRows as $r) {
        $countByStore[(string) (int) $r['store_id']] = (int) $r['c'];
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'snapshot-fingerprints: query failed: ' . $e->getMessage() . "\n");
    exit(1);
}

// Deterministic fingerprint payload (excludes meta.generated_at_utc).
$fingerprint = [
    'cms_pages' => $cmsPages,
    'store5_config' => $store5Config,
    'default_inherited_config' => $defaultConfig,
    'counts' => [
        'cms_page_rows' => (int) $pageCountRow[0]['c'],
        'cms_page_store_rows' => (int) $pageStoreCountRow[0]['c'],
        'page_store_rows_by_store_id' => $countByStore,
    ],
];

$snapshot = [
    'meta' => [
        'tool' => 'scripts/proof/issue72/snapshot-fingerprints.php',
        'issue' => 72,
        'purpose' => 'read-only CMS isolation snapshot for DET issue #72 (store-5-only proof)',
        'magento_root' => $magentoRoot,
        'db_name' => (string) $conn['dbname'],
        'read_only' => true,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ],
    'fingerprint' => $fingerprint,
    // Pre-existing #70 artifacts the Coordinator flagged — surfaced here so any
    // later diff proves they were never modified. Identified by page_id in the
    // fingerprint above; listed separately only as a convenience index.
    'preexisting_issue70_artifacts' => array_values(array_filter(
        array_map(static fn (array $p): array => [
            'page_id' => $p['page_id'],
            'identifier' => $p['identifier'],
            'title' => $p['title'],
            'store_ids' => $p['store_ids'],
            'content_sha256' => $p['content_sha256'],
        ], $cmsPages),
        static fn (array $p): bool => in_array($p['page_id'], [35, 36], true)
    )),
];

fwrite(STDOUT, json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL);
exit(0);
