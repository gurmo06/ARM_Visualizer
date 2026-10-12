import { describe, expect, it } from "vitest";
import { BranchPredictor } from "../src/perf/predictor";
import { CPU } from "../src/top/cpu";
import { PipelineCPU } from "../src/top/pipeline_cpu";

const options = { mode: "taken-no-btb" } as const;

function trace(source: string, registers: bigint[] = [], limit = 200)
{
    const cpu = new PipelineCPU(source, registers, options);
    const history = [cpu.snapshot()];
    while (!history.at(-1)!.halted && history.length <= limit) history.push(cpu.step());
    return history;
}

function matchesReference(source: string, registers: bigint[] = [])
{
    const actual = new PipelineCPU(source, registers, options).run(2000);
    const expected = new CPU(source, registers).run(2000);
    expect(actual.halted).toBe(true);
    for (const key of ["registers", "sp", "pc", "pstate", "memory", "fault", "halted"] as const)
        expect(actual[key]).toEqual(expected[key]);
    expect(actual.predictor).toMatchObject({ entries: [], btbHits: 0, btbMisses: 0 });
    return actual;
}

describe("always taken without a BTB", () =>
{
    it("is the default for both the predictor and CPU, including after reset", () =>
    {
        expect(new BranchPredictor().snapshot().mode).toBe("taken-no-btb");
        const source = "B #8\nMOVZ X0, #99\nHLT";
        const cpu = new PipelineCPU(source);
        expect(cpu.run()).toEqual(new PipelineCPU(source, [], options).run());
        cpu.reset_state();
        expect(cpu.snapshot().predictor.mode).toBe("taken-no-btb");
    });

    it("fetches sequentially, predicts decoded targets, and never learns a table", () =>
    {
        const predictor = new BranchPredictor(options);
        const initial = predictor.snapshot();
        for (const taken of [true, false, true])
        {
            expect(predictor.predict(0n)).toMatchObject({ taken: false, nextPc: 4n, btbHit: false });
            const decoded = predictor.predictDecoded(0n, 32n)!;
            expect(decoded).toMatchObject({ taken: true, nextPc: 32n, btbHit: false });
            expect(decoded.counter).toBeUndefined();
            expect(predictor.resolve(0n, 32n, true, taken, decoded).mispredicted).toBe(!taken);
        }
        expect(predictor.snapshot()).toMatchObject({ entries: [], resolved: 3, correct: 2, mispredictions: 1, btbHits: 0, btbMisses: 0 });
        predictor.reset();
        expect(predictor.snapshot()).toEqual(initial);
        for (const mode of ["two-bit", "one-bit", "taken", "not-taken"] as const)
            expect(new BranchPredictor({ mode }).predictDecoded(0n, 32n)).toBeUndefined();
    });

    it("redirects a cold branch in ID, flushing only IF and preserving its at-fetch decision", () =>
    {
        const history = trace("B #8\nMOVZ X0, #99\nHLT");
        expect(history[1].pipeline[0].token).toMatchObject({ prediction: { taken: false, nextPc: 4n } });
        expect(history[1].pipeline[0].token?.decodePrediction).toBeUndefined();
        const id = history[2];
        expect(id.pipeline[0]).toMatchObject({ flushed: true, token: { address: 4n } });
        expect(id.pipeline[1]).toMatchObject({ valid: true, flushed: false, token: {
            prediction: { taken: false, nextPc: 4n }, decodePrediction: { taken: true, nextPc: 8n }
        } });
        expect(id.latches["IF/ID"].valid).toBe(false);
        expect(id.latches["ID/EX"].valid).toBe(true);
        expect(history[3].pipeline[0].token?.address).toBe(8n);
        expect(history[3].pipeline[2].token?.branchResolution?.mispredicted).toBe(false);
        expect(history[3].pipeline.some((stage) => stage.flushed)).toBe(false);
        expect(matchesReference("B #8\nMOVZ X0, #99\nHLT")).toMatchObject({ cycle: 7, retired: 2 });
    });

    it("pays the ID redirect delay on every iteration, with no cold BTB miss", () =>
    {
        const source = "MOVZ X0, #10\nSUBS X0, X0, #1\nCBNZ X0, #-4\nHLT";
        const state = matchesReference(source);
        // Nine taken branches cost one cycle each; the final not-taken branch costs two total.
        expect(state).toMatchObject({ cycle: 37, retired: 22, predictor: { resolved: 10, correct: 9, mispredictions: 1 } });
        expect(trace(source).filter((s) => s.events.some((e) => e.message.startsWith("ID predicts")))).toHaveLength(10);
    });

    it.each(["CBZ XZR, #4", "CBNZ XZR, #4"])("avoids a redundant redirect when target equals fallthrough: %s", (branch) =>
    {
        const source = `${branch}\nMOVZ X0, #7\nHLT`;
        const history = trace(source);
        expect(history[2].pipeline[0].flushed).toBe(false);
        expect(matchesReference(source)).toMatchObject({ cycle: 7, predictor: { correct: 1, mispredictions: 0 } });
    });

    it("defers ID prediction until a load-use stall clears, then resolves with forwarded data", () =>
    {
        const source = "MOVZ X0, #5\nSUB X0, X0, #1\nSTR X0, [SP]\nLDR X1, [SP]\nCBNZ X1, #-12\nHLT";
        const history = trace(source);
        const stalls = history.filter((s) => s.events.some((e) => e.kind === "stall"));
        expect(stalls).toHaveLength(5);
        for (const stalled of stalls)
        {
            expect(stalled.fetchPc).toBe(history[stalled.cycle - 1].fetchPc);
            expect(stalled.latches["IF/ID"].token?.decodePrediction).toBeUndefined();
            expect(stalled.events.some((e) => e.message.startsWith("ID predicts"))).toBe(false);
            expect(history[stalled.cycle + 1].pipeline[1].token?.decodePrediction?.taken).toBe(true);
        }
        expect(matchesReference(source)).toMatchObject({ stalls: 5, predictor: { resolved: 5, mispredictions: 1 } });
    });

    it.each(["CBNZ XZR, #2", "CBNZ XZR, #100", "CBNZ XZR, #-4"])("discards a wrong-path target fetch fault: %s", (branch) =>
    {
        const source = `${branch}\nMOVZ X0, #7\nHLT`;
        const history = trace(source);
        expect(history[3].pipeline[0]).toMatchObject({ flushed: true, token: { fault: expect.any(String) } });
        expect(matchesReference(source).registers[0]).toBe(7n);
    });

    it.each(["B #2", "B #100"])("preserves real target faults after a correct ID prediction: %s", (source) =>
    {
        const state = new PipelineCPU(source, [], options).run();
        expect(state.fault).toBeDefined();
        expect(state).toMatchObject({ retired: 1, predictor: { resolved: 1, correct: 1, mispredictions: 0 } });
    });

    it("lets an older memory fault suppress a younger ID prediction", () =>
    {
        const faults = trace("LDR X0, [SP, #16]\nMOVZ X1, #1\nB #0\nHLT");
        const faultCycle = faults.find((s) => s.pipeline[3].token?.fault)!;
        expect(faultCycle.pipeline[1].flushed).toBe(true);
        expect(faultCycle.pipeline[1].token?.decodePrediction).toBeUndefined();
        expect(faultCycle.events.some((e) => e.message.startsWith("ID predicts"))).toBe(false);
        expect(faults.at(-1)).toMatchObject({ halted: true, retired: 0, predictor: { resolved: 0 } });
    });

    it("suppresses ID prediction on an older EX fault and branch resolution on an older MEM fault", () =>
    {
        const exFault = trace("SUB SP, SP, #1\nLDR X0, [SP]\nB #0\nHLT");
        const state = exFault.find((s) => s.pipeline[2].token?.fault)!;
        expect(state.pipeline[1].token?.decodePrediction).toBeUndefined();
        expect(state.pipeline[1].flushed).toBe(true);
        const memFault = new PipelineCPU("LDR X0, [SP, #16]\nB #0\nHLT", [], options).run();
        expect(memFault.fault).toContain("out of range");
        expect(memFault.predictor.resolved).toBe(0);
    });

    it("prevents younger ID redirects when HLT is in EX", () =>
    {
        const history = trace("HLT\nB #0");
        expect(history[3].pipeline[1]).toMatchObject({ flushed: true, token: { address: 4n } });
        expect(history[3].pipeline[1].token?.decodePrediction).toBeUndefined();
        expect(history.at(-1)).toMatchObject({ halted: true, retired: 1, predictor: { resolved: 0 } });
    });

    it("recovers from speculative end-of-program fetch faults in a self-loop and resets cleanly", () =>
    {
        const cpu = new PipelineCPU("B #0", [], options);
        const first = cpu.run(20);
        expect(first.halted).toBe(false);
        expect(first.fault).toBeUndefined();
        expect(first.predictor).toMatchObject({ mispredictions: 0, entries: [] });
        expect(cpu.run(20)).toEqual(new PipelineCPU("B #0", [], options).run(40));
        cpu.reset_state("HLT");
        expect(cpu.snapshot()).toEqual(new PipelineCPU("HLT", [], options).snapshot());
        expect(cpu.run().fault).toBeUndefined();
    });

    it("discards wrong-path writes and respects W-register width and XZR", () =>
    {
        const state = matchesReference("MOVZ X0, #3\nSTR X0, [SP]\nSUBS X0, X0, #1\nCBNZ X0, #-8\nMOVZ X1, #7\nHLT");
        expect(state.memory[0].value).toBe(1);
        expect(state.registers.slice(0, 2)).toEqual([0n, 7n]);
        expect(state.pstate.zero).toBe(true);
        matchesReference("MOVZ X0, #1, LSL #32\nCBZ W0, #8\nMOVZ X1, #99\nCBNZ XZR, #-4\nHLT");
    });
});
