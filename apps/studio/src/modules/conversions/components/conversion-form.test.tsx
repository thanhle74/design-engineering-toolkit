import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { DEMO_PROFILES } from "../conversion-options";
import { ConversionForm } from "./conversion-form";

const VALID_URL =
  "https://www.figma.com/design/AbC123xyzQrs/My%20Design%20File?node-id=245-2";

afterEach(cleanup);

describe("ConversionForm — project profile configuration", () => {
  it("renders the truthful NOT_CONFIGURED hint when no profiles are provided", () => {
    render(<ConversionForm />);

    const hint = screen.getByTestId("profiles-not-configured");
    expect(hint).toHaveTextContent(/NOT CONFIGURED/);
    expect(hint).toHaveTextContent(
      /No project profiles configured — profiles come from local DET profile configuration\./
    );
    // Only the output target select is rendered; there is no profile selector.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByText("Project profile")).not.toBeInTheDocument();
  });

  it("renders a profile select fed by the profiles prop and hides the hint", () => {
    render(<ConversionForm profiles={DEMO_PROFILES} />);

    expect(screen.queryByTestId("profiles-not-configured")).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    // The first profile is selected by default and visibly demo-labeled in the
    // trigger. antd renders the selected label in a sibling of the combobox
    // input, so the label is asserted on the Select root (.ant-select).
    const profileTrigger = screen.getByRole("combobox", { name: "Project profile" });
    const profileRoot = profileTrigger.closest(".ant-select");
    expect(profileRoot).not.toBeNull();
    expect(profileRoot).toHaveTextContent("DEMO — Fashion storefront");
  });
});

describe("ConversionForm — validation blocks submit", () => {
  it("blocks submit for garbage input with an inline, announced reason and no result", async () => {
    const user = userEvent.setup();
    render(<ConversionForm profiles={DEMO_PROFILES} />);

    await user.type(screen.getByLabelText("Figma design source"), "convert my design please");
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/not a figma\.com URL|design-file URL/i);
    expect(screen.queryByTestId("conversion-result")).not.toBeInTheDocument();
  });

  it("blocks submit for a design URL missing node-id with a specific reason", async () => {
    const user = userEvent.setup();
    render(<ConversionForm />);

    await user.type(
      screen.getByLabelText("Figma design source"),
      "https://www.figma.com/design/FILEKEY01/Name"
    );
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/missing a node-id parameter/);
    expect(screen.queryByTestId("conversion-result")).not.toBeInTheDocument();
  });

  it("clears the error and shows the summary after the input is corrected", async () => {
    const user = userEvent.setup();
    render(<ConversionForm />);

    const input = screen.getByLabelText("Figma design source");
    await user.type(input, "garbage");
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, VALID_URL);
    // The error is re-evaluated live once shown, so it clears without resubmitting.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /review conversion request/i }));
    expect(screen.getByTestId("conversion-result")).toBeInTheDocument();
  });
});

describe("ConversionForm — honest NOT CONNECTED result", () => {
  it("shows the parsed summary and the not-connected notice on valid submit", async () => {
    const user = userEvent.setup();
    render(<ConversionForm profiles={DEMO_PROFILES} />);

    await user.type(screen.getByLabelText("Figma design source"), VALID_URL);
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));

    const result = screen.getByTestId("conversion-result");
    expect(within(result).getByText("AbC123xyzQrs")).toBeInTheDocument();
    expect(within(result).getByText("245:2")).toBeInTheDocument();
    expect(within(result).getByText("Native Page Builder")).toBeInTheDocument();
    expect(within(result).getByText("DEMO — Fashion storefront")).toBeInTheDocument();

    // The action is explicitly unavailable — never a fake success.
    expect(within(result).getByText("NOT CONNECTED")).toBeInTheDocument();
    expect(
      within(result).getByText(/Conversion execution is not connected/)
    ).toBeInTheDocument();
    expect(within(result).getByText(/\[28\] owns the engine bridge/)).toBeInTheDocument();
    expect(within(result).getByText(/No conversion was run/)).toBeInTheDocument();

    // No progress or success claim anywhere.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeNull();
    expect(screen.queryByText(/running|in progress|queued/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/conversion (complete|succeeded|successful|started)/i)
    ).not.toBeInTheDocument();
  });

  it("is keyboard-submittable via Enter in the source input", async () => {
    const user = userEvent.setup();
    render(<ConversionForm />);

    const input = screen.getByLabelText("Figma design source");
    await user.type(input, "245:2");
    await user.type(input, "{Enter}");

    const result = screen.getByTestId("conversion-result");
    expect(within(result).getByText("245:2")).toBeInTheDocument();
    expect(within(result).getByText(/No conversion was run/)).toBeInTheDocument();
  });

  it("reports an unknown file key honestly for a bare node id", async () => {
    const user = userEvent.setup();
    render(<ConversionForm />);

    await user.type(screen.getByLabelText("Figma design source"), "245:2");
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));

    const result = screen.getByTestId("conversion-result");
    expect(within(result).getByText("Not provided (bare node id)")).toBeInTheDocument();
    expect(within(result).getByText(/no file key was provided/i)).toBeInTheDocument();
    expect(within(result).getByText(/No conversion was run/)).toBeInTheDocument();
  });

  it("marks the summary profile as not configured when none are provided", async () => {
    const user = userEvent.setup();
    render(<ConversionForm />);

    await user.type(screen.getByLabelText("Figma design source"), VALID_URL);
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));

    const result = screen.getByTestId("conversion-result");
    expect(within(result).getByText("Not configured")).toBeInTheDocument();
  });

  it("never persists input: no localStorage or sessionStorage writes", async () => {
    const user = userEvent.setup();
    render(<ConversionForm profiles={DEMO_PROFILES} />);

    await user.type(screen.getByLabelText("Figma design source"), VALID_URL);
    await user.click(screen.getByRole("button", { name: /review conversion request/i }));

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
