// Fake adapter: floods stdout without end (tests ADAPTER_OUTPUT_OVERFLOW under a byte cap).
setInterval(() => {
  process.stdout.write("x".repeat(4096));
}, 1);
