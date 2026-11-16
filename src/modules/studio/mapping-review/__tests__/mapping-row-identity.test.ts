/**
 * [74] mappingRowKeys / keyedMappings — stable, fact-based row identity.
 *
 * Contracts under test:
 *  - STABILITY: the same source array yields the same key per entry — the
 *    keys of the entries that survive a filter are byte-identical before and
 *    after filtering (the old post-filter `idx++` broke this);
 *  - UNIQUENESS: distinct entries with the SAME nodeId stay distinct
 *    (duplicate nodeIds are real — AG-009's `n-f18f7c3e5cd3` ×2), including
 *    entries whose facts differ only in one optional field, and byte-equal
 *    fact duplicates are disambiguated by occurrence index;
 *  - ALIGNMENT: keyedMappings pairs each entry with its own key in order.
 */
import { describe, expect, it } from "vitest";

import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";
import {
   keyedMappings,
   mappingRowKeys,
} from "@/src/modules/studio/mapping-review";

function entry(overrides: Partial<StudioMappingView>): StudioMappingView {
   return {
      nodeId: "n-f18f7c3e5cd3",
      composeDisposition: "gap",
      reasons: [],
      needsReview: false,
      ...overrides,
   };
}

describe("mappingRowKeys — stability across filtering", () => {
   const mappings: StudioMappingView[] = [
      entry({ nodeId: "n-000000000001", sourceLocator: "design://x/1:1" }),
      entry({
         nodeId: "n-000000000002",
         composeDisposition: "mapped",
         sourceLocator: "design://x/1:2",
         target: {
            capabilityId: "magento_pagebuilder/banner",
            appearanceId: "poster",
         },
      }),
      entry({ nodeId: "n-000000000003", sourceLocator: "design://x/1:3" }),
   ];

   it("returns exactly one aligned key per entry", () => {
      const keys = mappingRowKeys(mappings);
      expect(keys).toHaveLength(mappings.length);
      expect(new Set(keys).size).toBe(keys.length);
   });

   it("keeps surviving rows' keys byte-identical when a filter drops others", () => {
      const before = mappingRowKeys(mappings);
      // Simulate the search/disposition filter keeping only the mapped entry
      // plus the first gap (the old implementation re-numbered these 0..n).
      const kept = [mappings[0]!, mappings[1]!];
      const after = mappingRowKeys(kept);

      expect(after[0]).toBe(before[0]);
      expect(after[1]).toBe(before[1]);
   });

   it("is deterministic across repeated calls on the same array", () => {
      expect(mappingRowKeys(mappings)).toEqual(mappingRowKeys(mappings));
   });
});

describe("mappingRowKeys — duplicate nodeIds", () => {
   it("gives duplicate-nodeId entries distinct keys when facts differ", () => {
      const dupNode = "n-f18f7c3e5cd3";
      const keys = mappingRowKeys([
         entry({
            nodeId: dupNode,
            sourceLocator: "design://x/10:1",
            note: "first gap assessment",
         }),
         entry({
            nodeId: dupNode,
            composeDisposition: "mapped",
            sourceLocator: "design://x/10:2",
            target: {
               capabilityId: "magento_pagebuilder/text",
               appearanceId: "default",
            },
         }),
      ]);
      expect(keys[0]).not.toBe(keys[1]);
   });

   it("separates entries whose facts differ in exactly one optional field", () => {
      const base = {
         nodeId: "n-f18f7c3e5cd3",
         sourceLocator: "design://x/10:1",
      };
      const keys = mappingRowKeys([
         entry({ ...base, note: "note A" }),
         entry({ ...base, note: "note B" }),
         entry({ ...base, sectionId: "s-0a1b2c3d4e5f" }),
         entry({ ...base }),
      ]);
      expect(new Set(keys).size).toBe(4);
   });

   it("disambiguates byte-identical fact duplicates by occurrence index", () => {
      const twin = {
         nodeId: "n-f18f7c3e5cd3",
         sourceLocator: "design://x/10:1",
         note: "repeated assessment",
      };
      const keys = mappingRowKeys([
         entry(twin),
         entry({ nodeId: "n-000000000009" }),
         entry(twin),
      ]);
      expect(keys[0]).not.toBe(keys[2]);
      expect(keys[2]!.endsWith("#1")).toBe(true);
      expect(keys[0]!.endsWith("#0")).toBe(true);
   });
});

describe("keyedMappings", () => {
   it("pairs every entry with the key mappingRowKeys assigns it", () => {
      const mappings: StudioMappingView[] = [
         entry({ nodeId: "n-000000000001" }),
         entry({ nodeId: "n-000000000002" }),
      ];
      const keyed = keyedMappings(mappings);
      expect(keyed.map((k) => k.mapping)).toEqual(mappings);
      expect(keyed.map((k) => k.rowKey)).toEqual(mappingRowKeys(mappings));
   });
});
