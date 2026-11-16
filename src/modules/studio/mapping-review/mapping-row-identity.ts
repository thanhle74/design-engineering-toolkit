/**
 * [74] Stable row identity for mapping rows (AG-011 follow-up).
 *
 * A `StudioMappingView` entry carries NO unique id field — the contract
 * (`shared/contracts/studio-run-view.ts`) documents that duplicate `nodeId`
 * occurrences are REAL (AG-009 observed `n-f18f7c3e5cd3` twice in one live
 * run: multiple gap assessments / bindings for the same Figma node). A
 * positional index is equally wrong as a key source: an index computed AFTER
 * filtering changes whenever the search/disposition filter changes, so rows
 * remount, selection state is lost and an inspector can bind to the wrong
 * occurrence.
 *
 * The identity below is derived from STABLE SOURCE FACTS only:
 *   nodeId · sectionId · composeDisposition · reviewDisposition ·
 *   sourceLocator · target binding · note
 * Two entries whose facts agree entirely are disambiguated by an OCCURRENCE
 * index computed ONCE over the UNFILTERED source array (engine emission
 * order). The caller must therefore call `mappingRowKeys` on the full,
 * unfiltered list and keep the returned keys aligned to that list; any
 * filter/sort/reorder of the rows afterwards must carry the precomputed key.
 *
 * Guarantee: same source array ⇒ same key per entry, across any filtering;
 * distinct entries ⇒ distinct keys, even with identical `nodeId`.
 */
import type { StudioMappingView } from "@/src/modules/studio/shared/contracts";

/** Placeholder for an optional fact the entry does not carry. */
const ABSENT = "-";

/** Target binding rendered as one stable fact string (or ABSENT). */
function targetFact(target: StudioMappingView["target"]): string {
   if (!target) return ABSENT;
   return (
      `${target.capabilityId}/${target.appearanceId}` +
      `/${target.nativeElement ?? ABSENT}/${target.nativeField ?? ABSENT}`
   );
}

/**
 * One deterministic row key per entry, aligned by index with `mappings`.
 *
 * The key shape is `<facts>#<occurrence>` where `<facts>` is every stable
 * source fact joined with `|` and `<occurrence>` counts the previous entries
 * in `mappings` with byte-identical facts. The occurrence suffix also makes
 * the identity robust against separator collisions inside free-text facts
 * (locator/note): even if two distinct tuples joined to the same string,
 * their per-fact occurrence counters keep the final keys distinct.
 */
export function mappingRowKeys(
   mappings: readonly StudioMappingView[],
): string[] {
   const occurrence = new Map<string, number>();
   return mappings.map((m) => {
      const facts = [
         m.nodeId,
         m.sectionId ?? ABSENT,
         m.composeDisposition,
         m.reviewDisposition ?? ABSENT,
         m.sourceLocator ?? ABSENT,
         targetFact(m.target),
         m.note ?? ABSENT,
      ].join("|");
      const seen = occurrence.get(facts) ?? 0;
      occurrence.set(facts, seen + 1);
      return `${facts}#${seen}`;
   });
}

/**
 * Row keys paired with their entries — the shape callers keep alongside the
 * unfiltered array so filtering never recomputes identity.
 */
export interface KeyedMapping {
   mapping: StudioMappingView;
   rowKey: string;
}

/** `mappingRowKeys` zipped with the entries it identifies. */
export function keyedMappings(
   mappings: readonly StudioMappingView[],
): KeyedMapping[] {
   const keys = mappingRowKeys(mappings);
   return mappings.map((mapping, index) => ({ mapping, rowKey: keys[index]! }));
}
