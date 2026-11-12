// Fake adapter: valid JSON that fails the declared output contract (tests ADAPTER_OUTPUT_CONTRACT_VIOLATION).
process.stdout.write(JSON.stringify({ not: "a capability registry" }));
process.exit(0);
