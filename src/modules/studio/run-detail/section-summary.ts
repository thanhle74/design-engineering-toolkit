/**
 * [74] Honest section/compose summary for the run overview (pure).
 *
 * Source of truth: the run's OWN data — `run.sections` (engine-declared
 * PageStructure detection facts, `elementCount` is DETECTION info, not
 * composition output) and `run.mappings` (composeDisposition per entry).
 * Nothing here is hardcoded: a section counts as composed only when it carries
 * at least one "mapped" compose entry (the #72 ledger definition — the #72
 * extended fixture composes 5/12 sections with 7 skipped ENTRIES, and this
 * derivation reports exactly that instead of a blanket "converted" claim).
 *
 * Honesty rules ([29]/[61] doctrine):
 *  - unknown stays unknown: an absent section `role` is `null`, never an
 *    invented label;
 *  - a real zero is a zero: a section whose mappings carry no `gap` entries
 *    reports none;
 *  - GAP / SKIPPED / EXCLUDED are never folded into a success count — they
 *    stay visible as their own counters.
 */
import type {
   StudioComposeDisposition,
   StudioMappingView,
   StudioRunView,
   StudioSectionView,
} from "@/src/modules/studio/shared/contracts";

/** Dispositions of the mappings attached to one section (nonzero only). */
export type DispositionCounts = Partial<
   Record<StudioComposeDisposition, number>
>;

export interface SectionComposeRow {
   order: number;
   name: string;
   /** Engine role, verbatim; `null` when the run does not carry one. */
   role: string | null;
   elementCount: number;
   /**
    * True when at least one mapping entry for this section composed natively
    * ("mapped"). Deliberately NOT derived from `elementCount`: detection
    * counts elements that composition may later skip, so `elementCount > 0`
    * would overcount (real #72 run: 11 detected vs 5 composed).
    */
   composed: boolean;
   /** Mapping entries grouped by compose disposition (nonzero keys only). */
   dispositions: DispositionCounts;
   /** Entries flagged NEEDS_REVIEW among this section's mappings. */
   needsReview: number;
   /** True when at least one mapping entry points at this section. */
   hasMappings: boolean;
}

export interface RunSectionSummary {
   /** Section rows in engine `order` (stable by array position on ties). */
   rows: SectionComposeRow[];
   totalSections: number;
   /** Sections carrying at least one "mapped" compose entry. */
   composedSections: number;
   /** Sections with no "mapped" compose entry (detected but not composed). */
   notComposedSections: number;
   /** Run-wide mapping counts, including the not-composed dispositions. */
   totals: Required<DispositionCounts> & {
      needsReview: number;
      /** Entries without any sectionId attached. */
      unassigned: number;
   };
}

function emptyTotals(): RunSectionSummary["totals"] {
   return {
      mapped: 0,
      gap: 0,
      "decoration-merged": 0,
      excluded: 0,
      skipped: 0,
      needsReview: 0,
      unassigned: 0,
   };
}

/** One-pass derivation of the per-section and run-wide compose facts. */
export function summarizeRunSections(run: StudioRunView): RunSectionSummary {
   const sections: StudioSectionView[] = [...run.sections].sort(
      (a, b) => a.order - b.order,
   );

   const totals = emptyTotals();
   const bySection = new Map<string, StudioMappingView[]>();
   for (const m of run.mappings) {
      const dispositionTotal = totals[m.composeDisposition];
      totals[m.composeDisposition] = (dispositionTotal ?? 0) + 1;
      if (m.needsReview) totals.needsReview += 1;
      if (m.sectionId) {
         const bucket = bySection.get(m.sectionId);
         if (bucket) {
            bucket.push(m);
         } else {
            bySection.set(m.sectionId, [m]);
         }
      } else {
         totals.unassigned += 1;
      }
   }

   const rows: SectionComposeRow[] = sections.map((sec) => {
      const mappings = bySection.get(sec.sectionId) ?? [];
      const dispositions: DispositionCounts = {};
      let needsReview = 0;
      for (const m of mappings) {
         dispositions[m.composeDisposition] =
            (dispositions[m.composeDisposition] ?? 0) + 1;
         if (m.needsReview) needsReview += 1;
      }
      return {
         order: sec.order,
         name: sec.name,
         role: sec.role ?? null,
         elementCount: sec.elementCount,
         composed: (dispositions.mapped ?? 0) > 0,
         dispositions,
         needsReview,
         hasMappings: mappings.length > 0,
      };
   });

   const composedSections = rows.filter((r) => r.composed).length;
   return {
      rows,
      totalSections: rows.length,
      composedSections,
      notComposedSections: rows.length - composedSections,
      totals,
   };
}

/**
 * Render one section's disposition counts as a compact "1 mapped · 2 gap"
 * fragment list (nonzero entries only, engine vocabulary verbatim).
 */
export function dispositionSummaryText(
   dispositions: DispositionCounts,
): string[] {
   const order: StudioComposeDisposition[] = [
      "mapped",
      "gap",
      "decoration-merged",
      "skipped",
      "excluded",
   ];
   return order
      .filter((d) => (dispositions[d] ?? 0) > 0)
      .map((d) => `${dispositions[d]} ${d}`);
}
