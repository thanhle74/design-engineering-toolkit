"use client";

/**
 * [29] DET Studio — New Conversion form (client component, lane W-A).
 *
 * The studio's entry action: parse/validate a Figma design source, pick an
 * output target and (when configured) a project profile. On a valid submit it
 * renders the honest NOT CONNECTED result state — the form never claims a
 * conversion ran, never shows progress, and stores nothing anywhere.
 *
 * There is deliberately NO Figma token field: [28]'s engine owns Figma access.
 */
import * as React from "react";
import { Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { DEFAULT_OUTPUT_TARGET, OUTPUT_TARGET_OPTIONS } from "../conversion-options";
import { parseFigmaInput, type FigmaInputParseResult } from "../figma-input";
import type {
  ConversionOutputTarget,
  ConversionRequestSummary,
  StudioProfileOption,
} from "../types";
import { NotConnectedResult } from "./not-connected-result";

interface ConversionFormProps {
  /**
   * Project profiles from local DET profile configuration, supplied by the host
   * page. Absent or empty renders the truthful NOT_CONFIGURED hint; the
   * module-local DEMO_PROFILES constant exists for tests/demo wiring only.
   */
  profiles?: readonly StudioProfileOption[];
  className?: string;
}

const SOURCE_INPUT_ID = "figma-source";
const SOURCE_ERROR_ID = "figma-source-error";
const SOURCE_HELP_ID = "figma-source-help";
const TARGET_SELECT_ID = "output-target";
const PROFILE_SELECT_ID = "project-profile";

export function ConversionForm({ profiles, className }: ConversionFormProps) {
  const availableProfiles = React.useMemo(
    () => (profiles && profiles.length > 0 ? profiles : []),
    [profiles]
  );
  const profilesConfigured = availableProfiles.length > 0;

  const [sourceInput, setSourceInput] = React.useState("");
  const [target, setTarget] = React.useState<ConversionOutputTarget>(DEFAULT_OUTPUT_TARGET);
  const [profileId, setProfileId] = React.useState<string>("");
  const [validation, setValidation] = React.useState<FigmaInputParseResult | null>(null);
  const [summary, setSummary] = React.useState<ConversionRequestSummary | null>(null);

  // Fall back to the first configured profile when no explicit choice was made.
  const selectedProfileId = profileId || availableProfiles[0]?.id || "";
  const selectedProfile = availableProfiles.find((p) => p.id === selectedProfileId) ?? null;

  const validationError = validation && !validation.ok ? validation : null;

  function handleSourceChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSourceInput(event.target.value);
    // Re-validate live once an error is showing so the message can't go stale.
    if (validationError) {
      setValidation(parseFigmaInput(event.target.value));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = parseFigmaInput(sourceInput);
    if (!parsed.ok) {
      // Invalid input blocks submit with a clear, inline reason.
      setValidation(parsed);
      setSummary(null);
      return;
    }

    setValidation(null);
    setSummary({
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      inputKind: parsed.inputKind,
      target,
      profileId: selectedProfile?.id ?? null,
      profileName: selectedProfile?.name ?? null,
    });
  }

  return (
    <section aria-labelledby="new-conversion-heading" className={cn("w-full max-w-2xl", className)}>
      <h2 id="new-conversion-heading" className="text-base font-semibold tracking-tight">
        New conversion
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Point the studio at one Figma frame to convert. Studio only prepares and reviews the
        request — the det engine performs the conversion.
      </p>

      <form className="mt-4 space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor={SOURCE_INPUT_ID}>Figma design source</Label>
          <Input
            id={SOURCE_INPUT_ID}
            name="figmaSource"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.figma.com/design/<fileKey>/<fileName>?node-id=245-2 — or 245:2"
            value={sourceInput}
            onChange={handleSourceChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Uniform keyboard submit: implicit form submission for Enter in
                // text inputs varies by engine, so request it exactly once here.
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={validationError ? `${SOURCE_ERROR_ID} ${SOURCE_HELP_ID}` : SOURCE_HELP_ID}
            className="font-mono text-sm"
          />
          {validationError ? (
            <p id={SOURCE_ERROR_ID} role="alert" className="text-xs text-destructive">
              {validationError.message}
            </p>
          ) : null}
          <p id={SOURCE_HELP_ID} className="text-xs text-muted-foreground">
            Accepted: a Figma design-file URL including node-id (…?node-id=1-2), or a bare node
            id like 245:2. A URL without node-id is rejected — the engine needs a node to extract.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={TARGET_SELECT_ID}>Output target</Label>
            <Select value={target} onValueChange={(value) => setTarget(value as ConversionOutputTarget)}>
              <SelectTrigger id={TARGET_SELECT_ID} className="w-full">
                {/* Children keep the trigger truthful before the first open — Radix
                    only portals item text into the trigger once items mount. */}
                <SelectValue placeholder="Select output target">
                  {OUTPUT_TARGET_OPTIONS.find((option) => option.value === target)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_TARGET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            {profilesConfigured ? (
              <>
                <Label htmlFor={PROFILE_SELECT_ID}>Project profile</Label>
                <Select value={selectedProfileId} onValueChange={setProfileId}>
                  <SelectTrigger id={PROFILE_SELECT_ID} className="w-full">
                    <SelectValue placeholder="Select project profile">
                      {selectedProfile?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <div
                data-testid="profiles-not-configured"
                className="rounded-md border border-dashed px-4 py-3"
              >
                <p className="text-xs font-medium">Profile: NOT CONFIGURED</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No project profiles configured — profiles come from local DET profile
                  configuration.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Review conversion request</Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Unplug className="size-3.5" aria-hidden="true" />
              Execution not connected — issue [28] owns the engine bridge.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Submitting only validates this input and shows a request summary. No conversion runs
            and nothing is stored.
          </p>
        </div>
      </form>

      {summary ? <NotConnectedResult summary={summary} className="mt-5" /> : null}
    </section>
  );
}
