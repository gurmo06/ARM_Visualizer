import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PredictorPanel } from "../src/app/PredictorPanel";
import type { DirectionCounter, PredictionMode, PredictorEntry } from "../src/sim/prediction";
import { PipelineCPU } from "../src/top/pipeline_cpu";

afterEach(cleanup);

function state(mode: PredictionMode, entries: PredictorEntry[], cycle = 1)
{
    const snapshot = new PipelineCPU([], [], { mode }).snapshot();
    snapshot.cycle = cycle;
    snapshot.predictor.entries = entries;
    return snapshot;
}

function entry(counter?: DirectionCounter, pc = 8n): PredictorEntry
{
    return { index: 2, pc, target: 4n, conditional: true, counter };
}

describe("predictor state readout", () =>
{
    it.each([
        ["one-bit", 0, "0", "Last not taken"],
        ["one-bit", 1, "1", "Last taken"],
        ["two-bit", 0, "00", "Strong not taken"],
        ["two-bit", 1, "01", "Weak not taken"],
        ["two-bit", 2, "10", "Weak taken"],
        ["two-bit", 3, "11", "Strong taken"]
    ] as const)("shows %s value %i as %s", (mode, counter, bits, label) =>
    {
        render(<PredictorPanel snapshot={state(mode, [entry(counter)])} />);
        const row = screen.getByRole("row", { name: "Branch 0x0008" });
        expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(new RegExp(`^${bits}$`));
        expect(within(row).getByText(`${counter} / ${label}`)).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(mode === "one-bit" ? 2 : 4);
    });

    it("distinguishes a new entry from a zero-valued previous state", () =>
    {
        render(<PredictorPanel snapshot={state("two-bit", [entry(0)])} previous={state("two-bit", [], 0)} />);
        const row = screen.getByRole("row", { name: "Branch 0x0008" });
        expect(row).toHaveClass("predictor-changed");
        expect(within(row).getByText("Allocated")).toBeInTheDocument();
        expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(/^00$/);
    });

    it.each([
        ["one-bit", 1, 0, "1 to 0"],
        ["two-bit", 2, 3, "10 to 11"],
        ["two-bit", 1, 0, "01 to 00"]
    ] as const)("shows the actual %s change from %i to %i", (mode, before, after, label) =>
    {
        render(<PredictorPanel snapshot={state(mode, [entry(after)])} previous={state(mode, [entry(before)], 0)} />);
        expect(screen.getByLabelText(label)).toBeInTheDocument();
        expect(screen.getByRole("row", { name: "Branch 0x0008" })).toHaveClass("predictor-changed");
    });

    it("marks a colliding replacement as allocated, not as the old branch's counter change", () =>
    {
        render(<PredictorPanel snapshot={state("two-bit", [entry(2, 264n)])}
            previous={state("two-bit", [entry(0)], 0)} />);
        expect(screen.getByText("Allocated")).toBeInTheDocument();
        expect(screen.queryByLabelText("00 to 10")).not.toBeInTheDocument();
    });

    it("highlights only entries whose direction bits changed", () =>
    {
        const unchanged = { ...entry(0), index: 3, pc: 12n };
        render(<PredictorPanel snapshot={state("one-bit", [entry(1), unchanged])}
            previous={state("one-bit", [entry(0), unchanged], 0)} />);
        expect(screen.getByRole("row", { name: "Branch 0x0008" })).toHaveClass("predictor-changed");
        expect(screen.getByRole("row", { name: "Branch 0x000C" })).not.toHaveClass("predictor-changed");
    });

    it.each(["missing", "gap", "mode", "unchanged"])("does not invent a change when previous state is %s", (scenario) =>
    {
        const previous = scenario === "missing" ? undefined : state(scenario === "mode" ? "one-bit" : "two-bit",
            [entry(scenario === "unchanged" ? 2 : 1)], scenario === "gap" ? 0 : 1);
        render(<PredictorPanel snapshot={state("two-bit", [entry(2)], 2)} previous={previous} />);
        expect(screen.getByRole("row", { name: "Branch 0x0008" })).not.toHaveClass("predictor-changed");
        expect(screen.queryByText("Allocated")).not.toBeInTheDocument();
    });

    it.each(["one-bit", "two-bit", "taken"] as const)("does not display fabricated bits for an unconditional branch in %s mode", (mode) =>
    {
        render(<PredictorPanel snapshot={state(mode, [{ ...entry(), conditional: false }])} />);
        const row = screen.getByRole("row", { name: "Branch 0x0008" });
        expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(/^--$/);
        expect(within(row).getByText("Always taken")).toBeInTheDocument();
    });

    it("shows a static policy without a history bit or state legend", () =>
    {
        render(<PredictorPanel snapshot={state("taken", [entry()])} />);
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
        expect(within(screen.getByRole("row", { name: "Branch 0x0008" })).getAllByRole("cell")[1]).toHaveTextContent(/^--$/);
    });
});
