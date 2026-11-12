// Fake adapter: exits nonzero with stderr (tests ADAPTER_EXIT_NONZERO).
process.stderr.write("fake adapter crashed on purpose\n");
process.exit(1);
