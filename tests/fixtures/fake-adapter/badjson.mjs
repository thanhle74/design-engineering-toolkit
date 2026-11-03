// Fake adapter: stdout is not JSON (tests ADAPTER_OUTPUT_INVALID_JSON).
process.stdout.write("this is not json at all\n");
process.exit(0);
