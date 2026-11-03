// Fake adapter: hangs past any bounded test timeout (tests ADAPTER_TIMEOUT + kill).
setTimeout(() => process.exit(0), 30_000);
