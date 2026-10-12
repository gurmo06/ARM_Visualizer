import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App";

afterEach(() =>
{
    cleanup();
    vi.useRealTimers();
});

function step(count = 1): void
{
    for (let i = 0; i < count; i += 1) fireEvent.click(screen.getByRole("button", { name: "Step one clock cycle" }));
}

function load(source: string): void
{
    fireEvent.change(screen.getByRole("textbox", { name: "Assembly program" }), { target: { value: source } });
    fireEvent.click(screen.getByRole("button", { name: "Load program" }));
}

describe("pipeline workspace", () =>
{
    it.each([
        { mode: "one-bit", trained: "1 / Last taken", exited: "0 / Last not taken" },
        { mode: "taken", trained: "Always taken", exited: "Always taken" }
    ])("inspects $mode state across resolution, history, and reset", ({ mode, trained, exited }) =>
    {
        render(<App />);
        load("MOVZ X0, #10\nSUBS X0, X0, #1\nCBNZ X0, #-4\nHLT");
        const selector = screen.getByRole("combobox", { name: "Branch prediction" });
        expect(within(selector).getAllByRole("option")).toHaveLength(4);
        fireEvent.change(selector, { target: { value: mode } });
        step(9);
        fireEvent.click(screen.getByRole("button", { name: "EX: CBNZ X0, #-4" }));
        const inspector = screen.getByRole("region", { name: "Instruction inspector" });
        const predictor = screen.getByRole("region", { name: "Branch predictor" });
        expect(within(inspector).getByText(trained)).toBeInTheDocument();
        expect(within(predictor).getByText(trained)).toBeInTheDocument();
        expect(within(inspector).getByText("Correct", { exact: true })).toBeInTheDocument();
        step(21);
        expect(within(predictor).getByText(exited)).toBeInTheDocument();
        expect(within(inspector).getByText(trained)).toBeInTheDocument();
        fireEvent.change(screen.getByRole("slider", { name: "Recorded cycle" }), { target: { value: "9" } });
        expect(within(predictor).getByText(trained)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Live" }));
        expect(within(predictor).getByText(exited)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Reset and load program" }));
        expect(selector).toHaveValue(mode);
        expect(screen.getByText("No trained entries")).toBeInTheDocument();
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("0");
    });

    it("shows at-fetch predictions, resolved results, and historical predictor state", () =>
    {
        render(<App />);
        load("MOVZ X0, #10\nSUBS X0, X0, #1\nCBNZ X0, #-4\nHLT");
        step(9);
        fireEvent.click(screen.getByRole("button", { name: "EX: CBNZ X0, #-4" }));
        const inspector = screen.getByRole("region", { name: "Instruction inspector" });
        const predictor = screen.getByRole("region", { name: "Branch predictor" });
        expect(within(inspector).getByText("Correct", { exact: true })).toBeInTheDocument();
        expect(within(inspector).getByText("2 / Weak taken")).toBeInTheDocument();
        expect(within(predictor).getByText("3 / Strong taken")).toBeInTheDocument();
        expect(within(predictor).getByText("50.0%")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Inspect cycle 7, IF" }));
        expect(within(inspector).queryByText("Correct", { exact: true })).not.toBeInTheDocument();
        expect(within(predictor).getByText("2 / Weak taken")).toBeInTheDocument();
        expect(within(predictor).getByText("0.0%")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Live" }));
        expect(within(predictor).getByText("3 / Strong taken")).toBeInTheDocument();
    });

    it("resets execution and learning when switching predictors and preserves the mode on reload", () =>
    {
        vi.useFakeTimers();
        render(<App />);
        load("B #0");
        step(8);
        fireEvent.click(screen.getByRole("button", { name: "Pipeline" }));
        fireEvent.click(screen.getByRole("button", { name: "Run" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Branch prediction" }), { target: { value: "not-taken" } });
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("0");
        expect(screen.queryByRole("table", { name: "Branch target buffer" })).not.toBeInTheDocument();
        step(5);
        fireEvent.click(screen.getByRole("button", { name: "Reset and load program" }));
        expect(screen.getByRole("combobox", { name: "Branch prediction" })).toHaveValue("not-taken");
        fireEvent.change(screen.getByRole("combobox", { name: "Branch prediction" }), { target: { value: "two-bit" } });
        expect(screen.getByText("No trained entries")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Machine" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Assembly program" }), { target: { value: "NOP\nHLT" } });
        expect(screen.getByRole("combobox", { name: "Branch prediction" })).toBeDisabled();
    });

    it("opens an instruction from a stage and shows actual forwarding values", () =>
    {
        render(<App />);
        step(5);
        fireEvent.click(screen.getByRole("button", { name: "EX: ADD X2, X0, X1" }));
        const inspector = screen.getByRole("region", { name: "Instruction inspector" });
        expect(within(inspector).getByText("#3 / In EX")).toBeInTheDocument();
        expect(within(inspector).getByText("MEM/WB / #1")).toBeInTheDocument();
        expect(within(inspector).getByText("EX/MEM / #2")).toBeInTheDocument();
        expect(within(inspector).getByText("0x0000000000000005")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Inspect cycle 4, ID" }));
        expect(within(inspector).getByText("#3 / In ID")).toBeInTheDocument();
        expect(within(inspector).queryByText("EX/MEM / #2")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Live" }));
        expect(within(inspector).getByText("#3 / In EX")).toBeInTheDocument();
    });

    it("runs visibly, pauses without extra cycles, and resumes from live state after inspection", () =>
    {
        vi.useFakeTimers();
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Run" }));
        act(() => vi.advanceTimersByTime(1500));
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("3");
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        act(() => vi.advanceTimersByTime(2000));
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("3");
        fireEvent.click(screen.getByRole("button", { name: "Previous recorded cycle" }));
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("2");
        step();
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("4");
        fireEvent.click(screen.getByRole("button", { name: "Reset and load program" }));
        expect(screen.getByRole("slider", { name: "Recorded cycle" })).toHaveValue("0");
    });

    it("requires edited source to be loaded and reports errors without losing the loaded program", () =>
    {
        render(<App />);
        fireEvent.change(screen.getByRole("textbox", { name: "Assembly program" }), { target: { value: "INVALID" } });
        expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Load program" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Unsupported instruction");
        load("; comment\n\nMOVZ X0, #7\nHLT");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        const listing = screen.getByLabelText("Program listing");
        expect(within(listing).getAllByRole("button")).toHaveLength(2);
        expect(within(listing).getByText("0x0000")).toBeInTheDocument();
        step(6);
        expect(screen.getByText("Halted", { exact: true })).toBeInTheDocument();
    });

    it("keeps one instruction selected through a load-use stall and retirement", () =>
    {
        render(<App />);
        load("LDR X0, [SP]\nADD X1, X0, #1\nHLT");
        step(3);
        fireEvent.click(screen.getByRole("button", { name: "ID: ADD X1, X0, #1" }));
        expect(screen.getByText("#2 / Stalled in ID")).toBeInTheDocument();
        step(4);
        expect(screen.getByText("#2 / Retired")).toBeInTheDocument();
        const journey = screen.getByLabelText("Selected instruction journey");
        expect(within(journey).getAllByRole("button")).toHaveLength(6);
        expect(within(journey).getByText("Stalled")).toBeInTheDocument();
    });

    it("bounds history for loops and pauses when scrubbing", () =>
    {
        vi.useFakeTimers();
        render(<App />);
        load("B #0");
        fireEvent.change(screen.getByRole("slider", { name: "Clock speed" }), { target: { value: "16" } });
        fireEvent.click(screen.getByRole("button", { name: "Run" }));
        act(() => vi.advanceTimersByTime(17000));
        const slider = screen.getByRole("slider", { name: "Recorded cycle" });
        const recordedCycle = Number((slider as HTMLInputElement).value);
        expect(recordedCycle).toBeGreaterThan(256);
        expect(slider).toHaveAttribute("min", String(recordedCycle - 255));
        fireEvent.change(slider, { target: { value: "30" } });
        act(() => vi.advanceTimersByTime(1000));
        expect(slider).toHaveValue("30");
        expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    });

    it("navigates RAM pages and follows SP without rendering the whole address space", () =>
    {
        render(<App />);
        fireEvent.change(screen.getByRole("textbox", { name: "Memory address" }), { target: { value: "0010" } });
        expect(screen.getByRole("button", { name: "Follow stack pointer" })).toHaveAttribute("aria-pressed", "false");
        expect(document.querySelectorAll(".memory-table tbody tr")).toHaveLength(8);
        expect(document.querySelector(".memory-table tbody th")).toHaveTextContent("0x0010");
        fireEvent.click(screen.getByRole("button", { name: "Follow stack pointer" }));
        expect(document.querySelector(".memory-table tbody th")).toHaveTextContent("0xFF80");
    });
});
