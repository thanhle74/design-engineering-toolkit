<?php
/**
 * [72] READ-ONLY frontend-pipeline render probe.
 *
 * Loads a CMS page's STORED content through the exact storefront template
 * filter (Magento\Cms\Model\Template\Filter — the filter Cms\Page::_toHtml
 * applies) and reports the resulting Page Builder structure.
 *
 * Why the {{widget}} directive is stripped here: this Slaunchpad checkout has
 * a PRE-EXISTING Hyvä theme bug (pre-1.5 swatch-item.phtml override throws
 * "product.swatch.item rendered without option data") that aborts ANY CMS
 * render containing a catalog widget — see exception.log and the admin proof
 * receipt. The abort kills the WHOLE page render (empty #contentarea), so the
 * directive is removed before filtering to prove the composed Page Builder
 * HTML renders through the storefront pipeline itself. The widget directive
 * resolving to CatalogWidget grid.phtml is proven separately by the abort
 * stack trace (grid.phtml appears in it) — recorded in the receipt.
 *
 * No writes: reads the page, filters a string in memory, prints JSON.
 *
 * Usage: php render-frontend-filter.php --identifier=det-qa-72-home --store=5
 */

use Magento\Framework\App\Bootstrap;

if (!isset($argv[1])) {
    fwrite(STDERR, "usage: php render-frontend-filter.php --identifier=<id> --store=<id>\n");
    exit(2);
}
$opts = [];
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--([a-z-]+)=(.+)$/', $arg, $m)) {
        $opts[$m[1]] = $m[2];
    }
}
$identifier = $opts['identifier'] ?? 'det-qa-72-home';
$storeId = (int)($opts['store'] ?? 5);

$magentoRoot = getenv('DET_MAGENTO_ROOT') ?: '/home/thanhle/Sites/Magento/slaunchpad';
require $magentoRoot . '/app/bootstrap.php';

$params = $_SERVER;
$params[Bootstrap::INIT_PARAM_FILESYSTEM_DIR_PATHS] = [];
$bootstrap = Bootstrap::create($magentoRoot, $params);
$objectManager = $bootstrap->getObjectManager();

/** @var Magento\Cms\Api\PageRepositoryInterface $pageRepository */
$pageRepository = $objectManager->get(Magento\Cms\Api\PageRepositoryInterface::class);
/** @var Magento\Cms\Api\PageRepositoryInterface $search */
$searchResults = $objectManager->create(Magento\Cms\Model\ResourceModel\Page\Collection::class);
$searchResults->addFieldToFilter('identifier', $identifier);
$searchResults->addFieldToFilter('store_id', [$storeId, 0]);
$found = null;
foreach ($searchResults as $page) {
    $found = $page;
    break;
}
if ($found === null) {
    fwrite(STDERR, "page not found: {$identifier}\n");
    exit(1);
}
$stored = (string)$found->getContent();

/** @var Magento\Cms\Model\Template\Filter $filter */
$filter = $objectManager->get(Magento\Cms\Model\Template\Filter::class);

// (a) full render attempt — records whether the widget aborts (exception or empty)
$fullFailed = null;
try {
    $fullHtml = $filter->filter($stored);
} catch (\Throwable $e) {
    $fullFailed = get_class($e) . ': ' . substr($e->getMessage(), 0, 160);
    $fullHtml = '';
}

// (b) widget-stripped render — the storefront-pipeline proof of the PB HTML
$widgetStripped = preg_replace('/\{\{widget[^}]*\}\}/', '<!-- widget-directive-excluded -->', $stored);
try {
    $strippedHtml = $filter->filter($widgetStripped);
    $strippedFailed = null;
} catch (\Throwable $e) {
    $strippedFailed = get_class($e) . ': ' . substr($e->getMessage(), 0, 160);
    $strippedHtml = '';
}

$countTypes = static function (string $html): array {
    $counts = [];
    foreach (preg_match_all('/data-content-type="([^"]+)"/', $html, $m) ? $m[1] : [] as $t) {
        $counts[$t] = ($counts[$t] ?? 0) + 1;
    }
    return $counts;
};

$out = [
    'mode' => 'read-only-frontend-filter-render',
    'identifier' => $identifier,
    'store' => $storeId,
    'page_id' => (int)$found->getId(),
    'stored_bytes' => strlen($stored),
    'stored_content_type_counts' => $countTypes($stored),
    'full_filter_render' => [
        'ok' => $fullFailed === null,
        'error' => $fullFailed,
        'html_bytes' => strlen($fullHtml),
    ],
    'widget_stripped_filter_render' => [
        'ok' => $strippedFailed === null,
        'error' => $strippedFailed,
        'html_bytes' => strlen($strippedHtml),
        'content_type_counts' => $countTypes($strippedHtml),
        'has_pb_style_block' => strpos($strippedHtml, 'data-pb-style') !== false,
        'has_banner_text_marker' => strpos($strippedHtml, 'CHAPTER 01') !== false,
        'has_text_marker' => strpos($strippedHtml, 'THE CIRCULAR') !== false,
    ],
];
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
