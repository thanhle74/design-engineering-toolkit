<?php
declare(strict_types=1);

/**
 * [70] C70-2 Magento integration proof harness (issue #70 correction).
 *
 * Asserts, against a REAL Magento installation, that the generated CMS installer
 * application's returned response is a REAL \Magento\Framework\App\ResponseInterface
 * exposing sendResponse() — the exact \Magento\Framework\App\Bootstrap::run()
 * contract ($response = $application->launch(); $response->sendResponse();) —
 * and then performs the REAL sendResponse() (with terminateOnSend disabled so
 * this harness keeps exit control). No mocks: the class exercised here is the
 * generated one, byte-identically extracted.
 *
 * Why the extraction: the generated file declares its class AFTER its CLI entry
 * guard, and PHP declares classes LATE (never hoists them past a top-level
 * return), so `include install-homepage.php` cannot yield the class. This
 * harness therefore derives a runnable copy with two EXACT textual cuts and
 * requires the generated installer itself UNCHANGED (the full-file execution
 * path — Bootstrap::run() -> launch() -> sendResponse() -> exit code — is
 * proven separately by running `php install-homepage.php` directly).
 *
 * Cuts (both mandatory, both verified to exist):
 *  1. from the line `// ---- Entry point (runs ONLY when this file is executed directly as CLI)`
 *    through the line `require $magentoRoot . '/app/bootstrap.php';` (inclusive) —
 *    the CLI guards, the placement guard, the --dry-run branch and the bootstrap
 *    require; this harness boots Magento itself;
 *  2. from the line `$bootstrap = \Magento\Framework\App\Bootstrap::create(BP, $_SERVER);`
 *    to EOF — the direct-execution tail (Bootstrap::run + exit); this harness owns
 *    the process exit code.
 *
 * Usage (operator, on the isolated test store):
 *   php det-proof-harness.php <magento-root> <det-install-dir>
 * Exits 0 when the response contract holds and the launch recorded EXIT_OK;
 * non-zero otherwise. This file performs the CMS WRITE the launch performs —
 * run the installer's --dry-run first and run this harness only where a write
 * is authorized.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "det-proof-harness: CLI only\n");
    exit(1);
}
[$self, $magentoRootArg, $installDirArg] = [...array_pad($argv, 3, null)];
$magentoRoot = realpath((string) $magentoRootArg);
$installDir = realpath((string) $installDirArg);
$installerPath = $installDir === false ? false : realpath($installDir . '/install-homepage.php');
if (
    $magentoRoot === false || !is_file($magentoRoot . '/app/bootstrap.php')
    || $installDir === false || $installerPath === false
) {
    fwrite(STDERR, "det-proof-harness: usage: php det-proof-harness.php <magento-root> <det-install-dir> (install-homepage.php must sit in the det-install dir)\n");
    exit(1);
}

$generated = file_get_contents($installerPath);
if ($generated === false) {
    fwrite(STDERR, "det-proof-harness: cannot read the generated installer\n");
    exit(1);
}

$cutStart = '// ---- Entry point (runs ONLY when this file is executed directly as CLI)';
$cutEnd = "require \$magentoRoot . '/app/bootstrap.php';";
$tailStart = '$bootstrap = \Magento\Framework\App\Bootstrap::create(BP, $_SERVER);';
$startPos = strpos($generated, $cutStart);
$endPos = strpos($generated, $cutEnd, $startPos === false ? 0 : $startPos);
$tailPos = strpos($generated, $tailStart);
if ($startPos === false || $endPos === false || $tailPos === false || $endPos < $startPos || $tailPos < $endPos) {
    fwrite(STDERR, "det-proof-harness: extraction anchors not found — the installer shape changed; refusing to guess.\n");
    exit(1);
}
$extracted =
    substr($generated, 0, $startPos)
    . substr($generated, $endPos + strlen($cutEnd), $tailPos - ($endPos + strlen($cutEnd)));

$extractedPath = $installDir . '/.det-proof-extracted-app.php';
if (file_put_contents($extractedPath, $extracted) === false) {
    fwrite(STDERR, "det-proof-harness: cannot write the extracted copy\n");
    exit(1);
}

require $magentoRoot . '/app/bootstrap.php';
require $extractedPath;

if (!class_exists('DetCmsInstallerApp')) {
    fwrite(STDERR, "det-proof-harness: DetCmsInstallerApp was not declared after extraction\n");
    exit(1);
}
$bootstrap = \Magento\Framework\App\Bootstrap::create($magentoRoot, $_SERVER);
$app = $bootstrap->createApplication(DetCmsInstallerApp::class);
if (!$app instanceof \Magento\Framework\AppInterface) {
    fwrite(STDERR, "det-proof-harness: app does not implement \\Magento\\Framework\\AppInterface\n");
    exit(1);
}
$response = $app->launch(); // REAL launch: performs the CMS write through the service layer
$report = [
    'responseClass' => get_class($response),
    'isResponseInterface' => $response instanceof \Magento\Framework\App\ResponseInterface,
    'hasSendResponse' => method_exists($response, 'sendResponse'),
    'exitCode' => $app->getExitCode(),
];
fwrite(STDOUT, 'det-proof-harness: ' . json_encode($report) . PHP_EOL);
if (!$report['isResponseInterface'] || !$report['hasSendResponse'] || $report['exitCode'] !== 0) {
    fwrite(STDERR, "det-proof-harness: response contract FAILED\n");
    exit(1);
}
if (method_exists($response, 'terminateOnSend')) {
    $response->terminateOnSend(false);
}
$response->sendResponse(); // the exact call Bootstrap::run() makes after launch()
unlink($extractedPath);
exit($app->getExitCode());
