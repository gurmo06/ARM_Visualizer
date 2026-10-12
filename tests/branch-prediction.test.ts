import { describe, expect, it } from "vitest";
import type { PredictorOptions } from "../src/sim/prediction";
import { CPU } from "../src/top/cpu";
import { PipelineCPU } from "../src/top/pipeline_cpu";

const loop = "MOVZ X0, #10\nSUBS X0, X0, #1\nCBNZ X0, #-4\nHLT";
const btbModes = ["two-bit", "one-bit", "taken"] as const;

function trace(source: string, options: PredictorOptions = {}, initRegs: bigint[] = [], limit = 1000)
{
    const cpu = new PipelineCPU(source, initRegs, options);
    const history = [cpu.snapshot()];
    while (!history.at(-1)!.halted && history.length <= limit) history.push(cpu.step());
    return history;
}

function matchesReference(source: string, options: PredictorOptions = {}, initRegs: bigint[] = [])
{
    const reference = new CPU(source, initRegs).run(2000);
    const actual = new PipelineCPU(source, initRegs, options).run(4000);
    expect(actual.halted).toBe(true);
    expect(actual.fault).toBeUndefined();
    expect(reference.fault).toBeUndefined();
    for (const key of ["registers", "sp", "pc", "pstate", "memory", "halted"] as const)
    {
        expect(actual[key]).toEqual(reference[key]);
    }
    return actual;
}

describe("speculative branch execution", () =>
{
    it.each(btbModes)("warms up a loop and recovers both taken and not-taken mispredictions: %s", (mode) =>
    {
        const history = trace(loop, { mode });
        const resolutions = history.filter((s) => s.pipeline[2].token?.branchResolution);
        const misses = resolutions.filter((s) => s.pipeline[2].token!.branchResolution!.mispredicted);
        expect(misses).toHaveLength(2);
        expect(misses.map((s) => s.pipeline[2].token!.branchTaken)).toEqual([true, false]);
        for (const state of resolutions)
        {
            const token = state.pipeline[2].token!;
            if (token.branchResolution!.mispredicted)
            {
                expect(state.fetchPc).toBe(token.branchResolution!.nextPc);
                expect(state.latches["IF/ID"].valid).toBe(false);
                expect(state.latches["ID/EX"].valid).toBe(false);
                expect(history[state.cycle + 1].pipeline[0].token!.address).toBe(token.branchResolution!.nextPc);
            }
            else expect(state.pipeline.some((stage) => stage.flushed)).toBe(false);
        }
        const predicted = matchesReference(loop, { mode });
        const baseline = matchesReference(loop, { mode: "not-taken" });
        expect(predicted).toMatchObject({ retired: 22, cycle: 30, predictor: { resolved: 10, correct: 8, mispredictions: 2, btbHits: 9, btbMisses: 1 } });
        expect(baseline).toMatchObject({ retired: 22, cycle: 44, predictor: { mispredictions: 9 } });
    });

    it.each(btbModes)("compares loop re-entry after an exit changes predictor state: %s", (mode) =>
    {
        const source = "MOVZ X0, #3\nMOVZ X1, #4\nSUBS X1, X1, #1\nCBNZ X1, #-4\nSUB X0, X0, #1\nCBNZ X0, #-16\nHLT";
        const state = matchesReference(source, { mode });
        expect(state.predictor.mispredictions).toBe(mode === "one-bit" ? 8 : 6);
        expect(state.cycle).toBe(mode === "one-bit" ? 55 : 51);
        expect(state.predictor.entries.find((entry) => entry.pc === 12n)!.counter)
            .toBe(mode === "one-bit" ? 0 : mode === "two-bit" ? 2 : undefined);
    });

    it.each(btbModes)("recovers repeatedly from incorrect taken predictions without skipping work: %s", (mode) =>
    {
        const source = "MOVZ X0, #6\nCBNZ XZR, #8\nADD X2, X2, #1\nSUB X0, X0, #1\nCBNZ X0, #-12\nHLT";
        const state = matchesReference(source, { mode });
        expect(state.registers[2]).toBe(6n);
        expect(state.predictor.mispredictions).toBe(mode === "taken" ? 7 : 2);
    });

    it("queries the pre-edge table in IF and retains the at-fetch counter", () =>
    {
        const history = trace("CBNZ X0, #0", {}, [1n], 9);
        expect(history[6].pipeline[0].token!.prediction!.counter).toBe(2);
        expect(history[6].predictor.entries[0].counter).toBe(3);
        expect(history[8].pipeline[2].token!.prediction!.counter).toBe(2);
        expect(history[6].predictor.resolved).toBe(2);
    });

    it("does not flush a taken branch whose target is the predicted fallthrough", () =>
    {
        const history = trace("CBZ XZR, #4\nMOVZ X0, #7\nHLT");
        expect(history[3].pipeline.some((s) => s.flushed)).toBe(false);
        expect(history.at(-1)).toMatchObject({ cycle: 7, predictor: { correct: 1, mispredictions: 0 } });
    });

    it.each(btbModes)("holds the predicted PC and branch identity across load-use stalls: %s", (mode) =>
    {
        const source = "MOVZ X0, #5\nSUB X0, X0, #1\nSTR X0, [SP]\nLDR X1, [SP]\nCBNZ X1, #-12\nHLT";
        const history = trace(source, { mode });
        const stalls = history.filter((s) => s.events.some((e) => e.kind === "stall"));
        expect(stalls).toHaveLength(5);
        for (const stalled of stalls)
        {
            const previous = history[stalled.cycle - 1];
            expect(stalled.fetchPc).toBe(previous.fetchPc);
            expect(stalled.predictor).toEqual(previous.predictor);
            expect(stalled.latches["IF/ID"].token!.instanceId).toBe(previous.latches["IF/ID"].token!.instanceId);
            expect(stalled.latches["IF/ID"].token!.prediction).toEqual(previous.latches["IF/ID"].token!.prediction);
        }
        expect(matchesReference(source, { mode })).toMatchObject({ stalls: 5, predictor: { resolved: 5, mispredictions: 2 } });
    });

    it.each(btbModes)("squashes wrong-path stores and flag writes when a taken prediction exits: %s", (mode) =>
    {
        const source = "MOVZ X0, #3\nSTR X0, [SP]\nSUBS X0, X0, #1\nCBNZ X0, #-8\nMOVZ X1, #7\nHLT";
        const history = trace(source, { mode });
        const exit = history.find((s) => s.pipeline[2].token?.branchResolution?.mispredicted && s.pipeline[2].token?.branchTaken === false)!;
        expect(exit.pipeline.slice(0, 2).map((s) => s.token?.instruction?.opcode)).toEqual(["SUBS", "STR"]);
        expect(exit.pipeline.slice(0, 2).every((s) => s.flushed)).toBe(true);
        const state = matchesReference(source, { mode });
        expect(state.memory[0].value).toBe(1);
        expect(state.registers.slice(0, 2)).toEqual([0n, 7n]);
        expect(state.pstate.zero).toBe(true);
    });

    it.each(btbModes)("discards wrong-path branches without training them and tolerates speculative HLT/fetch faults: %s", (mode) =>
    {
        const cpu = new PipelineCPU("B #12\nB #0\nHLT\nB #-12", [], { mode });
        const state = cpu.run(40);
        expect(state.halted).toBe(false);
        expect(state.fault).toBeUndefined();
        expect(state.predictor.entries.map((e) => e.pc)).toEqual([0n, 12n]);
        expect(state.predictor.mispredictions).toBe(2);
        expect(state.predictor.resolved).toBeGreaterThan(25);
    });

    it.each(btbModes)("does not train a branch squashed by an older memory fault: %s", (mode) =>
    {
        const state = new PipelineCPU("LDR X0, [SP, #16]\nB #0\nHLT", [], { mode }).run();
        expect(state.fault).toContain("out of range");
        expect(state.predictor).toMatchObject({ resolved: 0, entries: [] });
    });

    it.each(["B #2", "B #100"])("preserves real target fetch faults: %s", (source) =>
    {
        const state = new PipelineCPU(source).run();
        expect(state.fault).toBeDefined();
        expect(state.retired).toBe(1);
        expect(state.predictor).toMatchObject({ resolved: 1, mispredictions: 1 });
    });

    it("masks W branch operands and never reads XZR as SP", () =>
    {
        matchesReference("MOVZ X0, #1, LSL #32\nCBZ W0, #8\nMOVZ X1, #99\nCBNZ XZR, #-4\nHLT");
    });

    it.each(btbModes)("resumes bounded execution and resets predictor state on program reload: %s", (mode) =>
    {
        const cpu = new PipelineCPU("B #0", [], { mode });
        const first = cpu.run(20);
        const second = cpu.run(20);
        expect(second.retired - first.retired).toBe(20);
        expect(second).toEqual(new PipelineCPU("B #0", [], { mode }).run(40));
        first.predictor.entries[0].target = 100n;
        expect(cpu.snapshot().predictor.entries[0].target).toBe(0n);
        cpu.reset_state("HLT");
        expect(cpu.snapshot()).toEqual(new PipelineCPU("HLT", [], { mode }).snapshot());
        expect(cpu.run().fault).toBeUndefined();
    });

    it.each([1, 2, 4, 64])("matches sequential execution across branch-heavy programs with %i BTB entries", (entries) =>
    {
        for (let seed = 1; seed <= 24; seed += 1)
        {
            const source = `MOVZ X0, #${seed + 2}\nMOVZ X1, #${seed}\nAND X2, X0, X1\nCBZ X2, #12\nADD X3, X3, #${seed * 3}\nB #8\nEOR X3, X3, X1\nSTR X3, [SP]\nLDR X4, [SP]\nSUBS X0, X0, #1\nCBNZ X0, #-32\nHLT`;
            const baseline = matchesReference(source, { mode: "not-taken", entries });
            for (const mode of btbModes)
            {
                const predicted = matchesReference(source, { mode, entries });
                expect(predicted.retired).toBe(baseline.retired);
            }
        }
    });
});
