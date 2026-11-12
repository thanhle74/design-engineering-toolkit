<?php
/**
 * LOCAL PREVIEW IMPORT — the [28]-proven guarded importer for the composed homepage into the
 * isolated DET preview store view (issue #28; committed per the coordinator's C3 correction).
 *
 * Local checkout ONLY; creates exactly ONE new CMS page (default identifier 'det-home-preview',
 * override with --identifier=...), assigned to the DET preview store view ONLY. Never touches
 * any existing page (identifier collision aborts; existing store views and the live Homepage are
 * untouched). Uses Magento's own CMS service layer (PageRepositoryInterface) — no direct SQL
 * writes.
 *
 * Usage: php det_g28_home_import.php <import|verify|edit-check|restore|rollback> [content-html-path]
 *   import       Create the disposable preview page (abort if identifier exists; content must
 *                carry the composed markers: column-group, button-item, banner).
 *   verify       Print page_id, stores, is_active, title, content sha256.
 *   edit-check   Service-layer heading edit -> re-read (round-trip proof), then restore to the
 *                composed bytes (no residual edit).
 *   restore      Re-save the page content from the composed file (idempotent reset).
 *   rollback     Delete the preview page (guarded: identifier must match).
 */
use Magento\Cms\Model\ResourceModel\Page as PageResource;
use Magento\Cms\Api\PageRepositoryInterface;
use Magento\Cms\Model\PageFactory;
use Magento\Framework\App\Bootstrap;

$action = $argv[1] ?? '';
// ---- CONFIG (edit per checkout; the shipped [28] local values are kept as defaults) ----------
$identifier = 'det-home-preview';
$title = 'DET Home Preview (Local Only)';
$storeId = 5; // store view 'det_preview' (id 5) — the isolated DET preview target
// ---------------------------------------------------------------------------------------------
foreach (array_slice($argv, 2) as $opt) {
    if (preg_match('/^--([a-z-]+)=(.+)$/', $opt, $m)) {
        if ($m[1] === 'identifier') $identifier = $m[2];
        if ($m[1] === 'store-id') $storeId = (int)$m[2];
        if ($m[1] === 'title') $title = $m[2];
    }
}

$contentPath = null;
for ($i = 2; $i < count($argv); $i++) {
    if (str_starts_with($argv[$i], '--')) continue; // --key=value CONFIG overrides, handled below
    if ($contentPath === null) $contentPath = $argv[$i];
}
if ($contentPath === null) $contentPath = __DIR__ . '/out/det-home-preview/native-content.html';

if (!in_array($action, ['import', 'verify', 'edit-check', 'restore', 'rollback'], true)) {
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

/** @var PageResource $pageResource */
$pageResource = $objectManager->get(PageResource::class);
/** @var PageRepositoryInterface $pageRepository */
$pageRepository = $objectManager->get(PageRepositoryInterface::class);
/** @var PageFactory $pageFactory */
$pageFactory = $objectManager->get(PageFactory::class);

function fail(string $msg): never { fwrite(STDERR, "ABORT: $msg\n"); exit(1); }

/**
 * Identifier-based page lookup (R2 correction): `PageRepositoryInterface::getById()` loads by
 * the NUMERIC primary key — whether a string identifier happens to resolve is a resource-model
 * fallback that varies across Magento versions. Load a fresh model with the EXPLICIT
 * 'identifier' field here, then use the returned numeric id with the repository.
 * @return array{0: ?int, 1: \Magento\Cms\Model\Page} [numeric page id or null, loaded model]
 */
function findPageByIdentifier(PageResource $pageResource, PageFactory $pageFactory, string $identifier): array
{
    $lookup = $pageFactory->create();
    $pageResource->load($lookup, $identifier, 'identifier');
    $id = $lookup->getId() ? (int)$lookup->getId() : null;
    return [$id, $lookup];
}

$content = @file_get_contents($contentPath);
if ($content === false) fail("composed content not found: $contentPath");
foreach (['data-content-type="column-group"', 'data-content-type="button-item"', 'data-content-type="banner"'] as $marker) {
    if (strpos($content, $marker) === false) fail("composed content lacks expected marker $marker — refusing to import (stale/foreign content)");
}
$sha = hash('sha256', $content);

/** @var \Magento\Cms\Model\Page|null $existing */
[$existingId, $existing] = findPageByIdentifier($pageResource, $pageFactory, $identifier);
$existing = $existingId !== null ? $pageRepository->getById($existingId) : null;

switch ($action) {
    case 'import':
        if ($existing && $existing->getId()) fail("page '$identifier' already exists (page_id {$existing->getId()}) — collision abort, never overwrite");
        $page = $pageFactory->create();
        $page->setIdentifier($identifier)
            ->setTitle($title)
            ->setContentHeading($title)
            ->setContent($content)
            ->setIsActive(1)
            ->setStores([$storeId])
            ->setPageLayout('cms-full-width'); // full-width CMS layout if present; harmless fallback otherwise
        $pageRepository->save($page);
        [$savedId] = findPageByIdentifier($pageResource, $pageFactory, $identifier);
        if ($savedId === null) fail("page '$identifier' not resolvable by identifier after save");
        $readBack = $pageRepository->getById($savedId);
        $storedSha = hash('sha256', (string)$readBack->getContent());
        echo 'imported page_id=' . $readBack->getId() . ' stores=[' . implode(',', (array)$readBack->getStores()) . ']'
            . ' content_sha256=' . $storedSha . "\n";
        echo $storedSha === $sha ? "integrity PASS (read-back equals composed bytes)\n" : "ABORT: integrity FAIL ($storedSha != $sha)\n";
        if ($storedSha !== $sha) exit(1);
        break;

    case 'verify':
        if (!$existing || !$existing->getId()) fail("page '$identifier' does not exist");
        echo 'page_id=' . $existing->getId() . ' stores=[' . implode(',', (array)$existing->getStores()) . ']'
            . ' is_active=' . $existing->getIsActive() . ' title=' . $existing->getTitle()
            . ' content_sha256=' . hash('sha256', (string)$existing->getContent()) . "\n";
        break;

    case 'edit-check':
        if (!$existing || !$existing->getId()) fail("page '$identifier' does not exist");
        $before = hash('sha256', (string)$existing->getContent());
        $edited = str_replace('The Quiet Grandeur', 'The Quiet Grandeur (SMOKE EDIT)', (string)$existing->getContent());
        if ($edited === (string)$existing->getContent()) fail('edit marker did not change the content (heading text not found)');
        $existing->setContent($edited);
        $pageRepository->save($existing);
        $after = $pageRepository->getById($identifier);
        $editedSha = hash('sha256', (string)$after->getContent());
        echo ($editedSha !== $before ? "edit round-trip PASS (content changed: $before -> $editedSha)\n" : "ABORT: edit did not persist\n");
        if ($editedSha === $before) exit(1);
        $after->setContent($content);
        $pageRepository->save($after);
        $restored = $pageRepository->getById($identifier);
        $restoredSha = hash('sha256', (string)$restored->getContent());
        echo $restoredSha === $sha ? "restore PASS (back to composed bytes: $restoredSha)\n" : "ABORT: restore FAIL ($restoredSha)\n";
        if ($restoredSha !== $sha) exit(1);
        break;

    case 'restore':
        if (!$existing || !$existing->getId()) fail("page '$identifier' does not exist");
        $existing->setContent($content);
        $pageRepository->save($existing);
        echo 'restored content_sha256=' . hash('sha256', (string)$pageRepository->getById($identifier)->getContent()) . "\n";
        break;

    case 'rollback':
        if ($existingId === null) { echo "page '$identifier' absent; nothing to do\n"; exit(0); }
        // Ownership guards (R2): a destructive rollback refuses any record this script cannot
        // prove is its own — per-store assignment AND an exact content-hash match.
        $stores = array_map('intval', (array)$existing->getStores());
        if (!in_array($storeId, $stores, true)) {
            fail("page '$identifier' (id $existingId) is not assigned to store view $storeId (stores: " . implode(',', $stores) . ") — refusing to delete a record that is not provably ours");
        }
        $storedSha = hash('sha256', (string)$existing->getContent());
        if ($storedSha !== $sha) {
            fail("page '$identifier' content sha256 '$storedSha' does not match this script's composed content '$sha' — refusing to delete a modified/foreign page");
        }
        $pageRepository->delete($existing);
        [$gone] = findPageByIdentifier($pageResource, $pageFactory, $identifier);
        if ($gone !== null) fail("page '$identifier' still present after delete");
        echo "page '$identifier' (id $existingId) deleted\n";
        break;
}
echo "done ($action)\n";
