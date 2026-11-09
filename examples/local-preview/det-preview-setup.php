<?php
/**
 * LOCAL PREVIEW SETUP — the [28]-proven guarded installer for the isolated DET preview target
 * (issue #28; committed per the coordinator's C3 correction so the local preview is reproducible
 * from the repository, not from uncommitted operator steps).
 *
 * Local checkout ONLY. Performs exactly the isolated, reversible preview steps and NOTHING else.
 * EDIT THE CONFIG BLOCK below for your checkout (store view code/id to create, DET preview theme
 * path/registration id, announcement block id/content, homepage identifier); every identifier
 * collision aborts and every rollback is content-guarded — records this script did not create
 * are never modified or deleted.
 *   store-theme    Fix the n98-created 'det_preview' store view (website/active), assert the
 *                  DET/preview theme registration (id 7, parent Hyva/default) and assign it
 *                  SCOPED to store view 5 only (design/theme/theme_id @ stores/5 — the
 *                  platform's own design-configuration mechanism, same as the Admin form).
 *   announcement   Create the optional det-announcement CMS block (scoped to store 5, MOCK
 *                  editorial text from the design; aborts on identifier collision).
 *   homepage       Point store view 5 at the preview homepage: web/default/cms_home_page =
 *                  det-home-preview @ stores/5 (requires the page to exist — run the import
 *                  script first). Existing store views' configs untouched.
 *   status         Print the current scoped state (store row, theme config, homepage config,
 *                  block, untouched baseline stores/pages).
 *   rollback       Remove everything this script created/changed: config values @ stores/5,
 *                  the announcement block (content-guarded), and the det_preview store view
 *                  (guarded: only when unused by any page/block). Existing records are never
 *                  modified beyond the store view this script created.
 *
 * Uses Magento's own service layers (StoreRepositoryInterface, config WriterInterface,
 * BlockRepositoryInterface, ThemeProviderInterface). No direct SQL writes.
 *
 * Usage: php det_g28_preview_setup.php <store-theme|announcement|homepage|status|rollback>
 */

use Magento\Framework\App\Bootstrap;
use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\View\Design\Theme\ThemeProviderInterface;
use Magento\Store\Api\StoreRepositoryInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Cms\Api\BlockRepositoryInterface;
use Magento\Cms\Api\Data\BlockInterface;
use Magento\Cms\Api\Data\BlockInterfaceFactory as BlockFactory;

$action = $argv[1] ?? '';
// ---- CONFIG (edit per checkout; the shipped [28] local values are kept as defaults) ----------
$storeCode = 'det_preview';
$storeViewId = 5;
$themePath = 'DET/preview';
$themeId = 7; // registration id assigned by `bin/magento setup:upgrade` for app/design/frontend/DET/preview
$blockId = 'det-announcement';
$blockContent = '<div class="det-announcement"><p>NEW SEASON — AUTUMN/WINTER 2026</p></div>'; // MOCK preview strip text
$homeIdentifier = 'det-home-preview';
$homeConfigPath = 'web/default/cms_home_page';
$themeConfigPath = 'design/theme/theme_id';
// ---------------------------------------------------------------------------------------------
// PHP < 7.5-safe option parse: --key=value overrides of the CONFIG block (e.g. --store-id=6).
foreach (array_slice($argv, 2) as $opt) {
    if (preg_match('/^--([a-z-]+)=(.+)$/', $opt, $m)) {
        $key = $m[1]; $val = $m[2];
        $map = ['store-code' => 'storeCode', 'store-id' => 'storeViewId', 'theme-path' => 'themePath', 'theme-id' => 'themeId', 'block-id' => 'blockId', 'block-content' => 'blockContent', 'homepage-identifier' => 'homeIdentifier'];
        if (isset($map[$key])) ${$map[$key]} = $key === 'store-id' || $key === 'theme-id' ? (int)$val : $val;
    }
}

if (!in_array($action, ['store-theme', 'announcement', 'homepage', 'status', 'rollback'], true)) {
    fwrite(STDERR, "unknown action '$action'\n");
    exit(2);
}
try {
    require __DIR__ . '/app/bootstrap.php';
} catch (Throwable $e) {
    fwrite(STDERR, 'bootstrap failed: ' . $e->getMessage() . "\n");
    exit(2);
}
$bootstrap = Bootstrap::create(BP, $_SERVER);
$objectManager = $bootstrap->getObjectManager();
$objectManager->get(Magento\Framework\App\State::class)->setAreaCode('adminhtml');

/** @var StoreRepositoryInterface $storeRepository */
$storeRepository = $objectManager->get(StoreRepositoryInterface::class);
/** @var WriterInterface $configWriter */
$configWriter = $objectManager->get(WriterInterface::class);

function fail(string $msg): never { fwrite(STDERR, "ABORT: $msg\n"); exit(1); }
function ok(string $msg): void { echo "  $msg\n"; }

function loadStoreOrFail(StoreRepositoryInterface $storeRepository, string $code, int $expectedId): StoreInterface {
    try {
        $store = $storeRepository->get($code);
    } catch (Throwable $e) {
        fail("store view '$code' not found: " . $e->getMessage());
    }
    if ((int)$store->getId() !== $expectedId) {
        fail("store '$code' has id {$store->getId()}, expected $expectedId — refusing to touch an unexpected record");
    }
    return $store;
}

function assertThemeRegistered($objectManager, string $themePath, int $themeId): void {
    /** @var ThemeProviderInterface $themeProvider */
    $themeProvider = $objectManager->get(ThemeProviderInterface::class);
    $theme = $themeProvider->getThemeById($themeId);
    if (!$theme) fail("theme id $themeId not registered");
    if ($theme->getCode() !== $themePath) fail("theme id $themeId is '{$theme->getCode()}', expected '$themePath'");
    $parent = $theme->getParentId();
    $parentCode = $parent ? (string)(int)$parent : '(none)';
    if ($parentCode !== '4') fail("theme '$themePath' parent is '$parentCode', expected 'Hyva/default' — refusing to use an unexpected theme");
    ok("theme '$themePath' registered (id $themeId, parent $parentCode)");
}

function scopeValue($objectManager, string $path, string $scope, int $scopeId): ?string {
    /** @var Magento\Framework\App\Config $config */
    $config = $objectManager->get(Magento\Framework\App\Config::class);
    $all = $config->getValue($path, $scope, $scopeId > 0 ? $scopeId : null);
    return $all === null ? null : (string)$all;
}

switch ($action) {
    case 'store-theme':
        $store = loadStoreOrFail($storeRepository, $storeCode, $storeViewId);
        $changed = [];
        if ((int)$store->getWebsiteId() !== 1) { $changed[] = 'website_id=1'; }
        if ((int)$store->getGroupId() !== 1) { $changed[] = 'group_id=1'; }
        if ((int)$store->getIsActive() !== 1) { $changed[] = 'is_active=1'; }
        if ($changed) {
            // The Admin's own persistence path (System > All Stores save uses the same model
            // save through the store resource model — see Save.php storeModel->save()).
            /** @var Magento\Store\Model\Store $storeModel */
            $storeModel = $objectManager->create(Magento\Store\Model\Store::class);
            $storeModel->load($storeViewId);
            if ((int)$storeModel->getId() !== $storeViewId) fail("store model load failed for id $storeViewId");
            if (in_array('website_id=1', $changed, true)) $storeModel->setWebsiteId(1);
            if (in_array('group_id=1', $changed, true)) $storeModel->setGroupId(1);
            if (in_array('is_active=1', $changed, true)) $storeModel->setIsActive(1);
            $storeModel->save();
            ok("store view '$storeCode' corrected: " . implode(', ', $changed));
        } else {
            ok("store view '$storeCode' already scoped to website 1/group 1/active");
        }
        assertThemeRegistered($objectManager, $themePath, $themeId);
        $current = scopeValue($objectManager, $themeConfigPath, 'stores', $storeViewId);
        if ($current !== (string)$themeId) {
            $configWriter->save($themeConfigPath, (string)$themeId, 'stores', $storeViewId);
            ok("design/theme/theme_id @ stores/$storeViewId = $themeId (scoped write only)");
        } else {
            ok("design/theme/theme_id @ stores/$storeViewId already $themeId");
        }
        // Hyvä base theme demo content (hero + demo product sliders) is ifconfig-gated onto every
        // CMS homepage; scoped OFF for the preview store view only so the composed preview page is
        // the homepage's sole content. Baseline stores keep their current behavior.
        $demoFlag = 'hyva_theme_general/demo_content/show_homepage_demo_content';
        $currentDemo = scopeValue($objectManager, $demoFlag, 'stores', $storeViewId);
        if ($currentDemo !== '0') {
            $configWriter->save($demoFlag, '0', 'stores', $storeViewId);
            ok("$demoFlag @ stores/$storeViewId = 0 (Hyvä demo hero/sliders scoped off for the preview view)");
        } else {
            ok("$demoFlag @ stores/$storeViewId already 0");
        }
        // Same policy for the Magento demo-store notice: vi/en carry scoped 0; the new view
        // inherited default=1. Scoped OFF keeps the preview clean and baselines untouched.
        $noticeFlag = 'design/head/demonotice';
        $currentNotice = scopeValue($objectManager, $noticeFlag, 'stores', $storeViewId);
        if ($currentNotice !== '0') {
            $configWriter->save($noticeFlag, '0', 'stores', $storeViewId);
            ok("$noticeFlag @ stores/$storeViewId = 0 (demo-store notice scoped off, matching vi/en)");
        } else {
            ok("$noticeFlag @ stores/$storeViewId already 0");
        }
        $objectManager->get(Magento\Framework\App\Cache\Manager::class)->clean(['config', 'full_page']);
        ok('config + full_page cache cleaned');
        break;

    case 'announcement':
        /** @var BlockRepositoryInterface $blockRepository */
        $blockRepository = $objectManager->get(BlockRepositoryInterface::class);
        try {
            $blockRepository->getById($blockId);
            $existing = true;
        } catch (Throwable $e) {
            $existing = false;
        }
        if ($existing) fail("CMS block '$blockId' already exists — collision abort (never overwrite)");
        /** @var BlockFactory $blockFactory */
        $blockFactory = $objectManager->get(BlockFactory::class);
        $block = $blockFactory->create();
        $block->setIdentifier($blockId)
            ->setTitle('DET Announcement (Local Only)')
            ->setContent($blockContent)
            ->setIsActive(1)
            ->setStores([$storeViewId]);
        $blockRepository->save($block);
        ok("CMS block '$blockId' created (id {$block->getId()}, stores [$storeViewId])");
        $objectManager->get(Magento\Framework\App\Cache\Manager::class)->clean(['block_html', 'full_page']);
        break;

    case 'homepage':
        $store = loadStoreOrFail($storeRepository, $storeCode, $storeViewId);
        /** @var Magento\Cms\Api\PageRepositoryInterface $pageRepository */
        $pageRepository = $objectManager->get(Magento\Cms\Api\PageRepositoryInterface::class);
        try {
            $page = $pageRepository->getById($homeIdentifier);
        } catch (Throwable $e) {
            fail("preview homepage '$homeIdentifier' does not exist yet — run det-preview-import.php import first");
        }
        $stores = array_map('intval', (array)$page->getStores());
        if (!in_array($storeViewId, $stores, true)) {
            fail("page '$homeIdentifier' (id {$page->getId()}) is not assigned to store view $storeViewId (stores: " . implode(',', $stores) . ')');
        }
        $current = scopeValue($objectManager, $homeConfigPath, 'stores', $storeViewId);
        if ($current !== $homeIdentifier) {
            $configWriter->save($homeConfigPath, $homeIdentifier, 'stores', $storeViewId);
            ok("web/default/cms_home_page @ stores/$storeViewId = det-home-preview (scoped write only)");
        } else {
            ok("web/default/cms_home_page @ stores/$storeViewId already $homeIdentifier");
        }
        $objectManager->get(Magento\Framework\App\Cache\Manager::class)->clean(['config', 'full_page']);
        break;

    case 'status':
        $rows = [];
        foreach (['vi' => 1, 'en' => 4, 'det_preview' => 5] as $code => $id) {
            try {
                $s = $storeRepository->get($code);
                $rows[] = sprintf('store %d %s: website=%s group=%s active=%s', $s->getId(), $code, $s->getWebsiteId(), $s->getGroupId(), $s->getIsActive());
            } catch (Throwable $e) {
                $rows[] = "store $id $code: MISSING";
            }
        }
        echo implode("\n", $rows) . "\n";
        echo 'theme @ stores/5: ' . (scopeValue($objectManager, $themeConfigPath, 'stores', $storeViewId) ?? '(unset)') . "\n";
        echo 'home  @ stores/5: ' . (scopeValue($objectManager, $homeConfigPath, 'stores', $storeViewId) ?? '(unset)') . "\n";
        echo 'theme @ stores/1 (baseline): ' . (scopeValue($objectManager, $themeConfigPath, 'stores', 1) ?? '(inherits websites/1)') . "\n";
        echo 'home  @ stores/4 (baseline): ' . (scopeValue($objectManager, $homeConfigPath, 'stores', 4) ?? '(unset)') . "\n";
        /** @var BlockRepositoryInterface $blockRepository */
        $blockRepository = $objectManager->get(BlockRepositoryInterface::class);
        try {
            $b = $blockRepository->getById($blockId);
            echo "block $blockId: id={$b->getId()} active={$b->getIsActive()} stores=[" . implode(',', (array)$b->getStores()) . "]\n";
        } catch (Throwable $e) {
            echo "block $blockId: absent\n";
        }
        break;

    case 'rollback':
        // 1. unscoped config values
        $configWriter->delete($themeConfigPath, 'stores', $storeViewId);
        $configWriter->delete($homeConfigPath, 'stores', $storeViewId);
        $configWriter->delete('hyva_theme_general/demo_content/show_homepage_demo_content', 'stores', $storeViewId);
        $configWriter->delete('design/head/demonotice', 'stores', $storeViewId);
        ok("scoped config removed @ stores/$storeViewId (theme + homepage + demo-content flag)");
        // 2. the announcement block (content-guarded)
        /** @var BlockRepositoryInterface $blockRepository */
        $blockRepository = $objectManager->get(BlockRepositoryInterface::class);
        try {
            $b = $blockRepository->getById($blockId);
            if (trim((string)$b->getContent()) !== trim($blockContent)) {
                fail("block '$blockId' content does not match this script's payload — refusing to delete a record we did not create");
            }
            $blockRepository->deleteById($b->getId());
            ok("block '$blockId' deleted");
        } catch (Throwable $e) {
            ok("block '$blockId' absent");
        }
        // 3. the store view (guarded: only ours)
        $store = loadStoreOrFail($storeRepository, $storeCode, $storeViewId);
        $storeRepository->delete($store);
        ok("store view '$storeCode' (id $storeViewId) deleted");
        $objectManager->get(Magento\Framework\App\Cache\Manager::class)->clean(['config', 'block_html', 'full_page']);
        ok('rollback complete');
        break;
}
echo "done ($action)\n";
