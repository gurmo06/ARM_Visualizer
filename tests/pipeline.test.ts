import { describe, expect, it } from "vitest";
import type { PipelineSnapshot } from "../src/sim/pipeline";
import { CPU } from "../src/top/cpu";
import { PipelineCPU } from "../src/top/pipeline_cpu";

function trace(source: string, initRegs: bigint[] = [], limit = 200): PipelineSnapshot[]
{
    const cpu = new PipelineCPU(source, initRegs);
    const history = [cpu.snapshot()];
    while (!history.at(-1)!.halted && history.length <= limit) history.push(cpu.step());
    return history;
}

function final(source: string, initRegs: bigint[] = []): PipelineSnapshot
{
    return trace(source, initRegs).at(-1)!;
}

describe("five-stage pipeline", () =>
{
    it("fills the stages one cycle at a time and commits only at WB", () =>
    {
        const history = trace("MOVZ X0, #7\nNOP\nHLT");
        for (let cycle = 1; cycle <= 5; cycle += 1)
        {
            expect(history[cycle].pipeline[cycle - 1].token?.instanceId).toBe(1);
            expect(history[cycle].registers[0]).toBe(cycle === 5 ? 7n : 0n);
        }
        expect(history[1].latches["IF/ID"].valid).toBe(true);
        expect(history[1].latches["ID/EX"].valid).toBe(false);
        expect(history.at(-1)!.cycle).toBe(7);
        expect(history.at(-1)!.retired).toBe(3);
        expect(history.at(-1)!.fault).toBeUndefined();
    });

    it("forwards both EX/MEM and MEM/WB operands", () =>
    {
        const history = trace("MOVZ X0, #2\nMOVZ X1, #3\nADD X2, X0, X1\nHLT");
        const ex = history[5].pipeline[2].token!;
        expect(ex.operands.map(({ value, source }) => ({ value, source }))).toEqual([
            { value: 2n, source: "MEM/WB" }, { value: 3n, source: "EX/MEM" }
        ]);
        expect(history.at(-1)!.registers[2]).toBe(5n);
        expect(history.at(-1)!.stalls).toBe(0);
    });

    it("prioritizes the newest writer and reads WB in the same cycle as ID", () =>
    {
        const state = final("MOVZ X0, #1\nADD X0, X0, #2\nADD X1, X0, #4\nNOP\nADD X2, X0, #5\nHLT");
        expect(state.registers.slice(0, 3)).toEqual([3n, 7n, 8n]);
    });

    it("stalls one cycle for a load-use dependency, holds PC, and inserts a bubble", () =>
    {
        const history = trace("MOVZ X0, #9\nSTR X0, [SP]\nLDR X1, [SP]\nADD X2, X1, #1\nHLT");
        const index = history.findIndex((state) => state.events.some((event) => event.kind === "stall"));
        expect(history[index].fetchPc).toBe(history[index - 1].fetchPc);
        expect(history[index].latches["ID/EX"].valid).toBe(false);
        expect(history[index].latches["IF/ID"].token?.instruction?.opcode).toBe("ADD");
        expect(history[index + 1].pipeline[2].bubble).toBe(true);
        expect(history[index + 2].pipeline[2].token?.operands[0].source).toBe("MEM/WB");
        expect(history.at(-1)!.stalls).toBe(1);
        expect(history.at(-1)!.registers[2]).toBe(10n);
        expect(history.at(-1)!.cycle).toBe(10);
    });

    it("forwards SP and store data, stores at MEM, and loads at WB", () =>
    {
        const history = trace("MOVZ X0, #4660\nSUB SP, SP, #16\nSTR X0, [SP]\nLDR X1, [SP]\nHLT");
        expect(history[5].memory).toHaveLength(0);
        expect(history[6].memory.slice(0, 2)).toEqual([
            { address: 0xFFE0n, value: 0x34 }, { address: 0xFFE1n, value: 0x12 }
        ]);
        expect(history[7].registers[1]).toBe(0n);
        expect(history[8].registers[1]).toBe(0x1234n);
    });

    it.each([
        ["LDR X1, [SP]\nSTR X1, [SP, #8]", 0],
        ["LDR X1, [SP]\nLDR X2, [X1]", 1],
        ["LDR X1, [SP]\nCBZ X1, #8\nMOVZ X2, #99", 2],
        ["LDR X1, [SP]\nMOVK X1, #1, LSL #16", 3]
    ])("detects load dependencies for store, base, branch, and MOVK: %s", (body) =>
    {
        const state = final(`${body}\nHLT`);
        expect(state.fault).toBeUndefined();
        expect(state.stalls).toBe(1);
    });

    it("does not treat load destinations or XZR as source dependencies", () =>
    {
        const state = final("LDR X0, [SP]\nMOVZ X0, #2\nLDR XZR, [SP]\nADD X1, XZR, #1\nHLT");
        expect(state.stalls).toBe(0);
        expect(state.registers.slice(0, 2)).toEqual([2n, 1n]);
    });

    it("discards XZR results without forwarding them to SP or XZR", () =>
    {
        const state = final("MOVZ XZR, #10\nADD X0, XZR, #3\nSTR X0, [SP]\nHLT");
        expect(state.sp).toBe(0xFFF0n);
        expect(state.registers[0]).toBe(3n);
        expect(state.memory[0].value).toBe(3);
    });

    it("masks W reads, zero-extends W writes, and forwards across W/X aliases", () =>
    {
        const state = final("MOVZ X0, #1, LSL #32\nCBZ W0, #8\nMOVZ X3, #99\nADD W1, W0, #1\nADD X2, X1, #1\nHLT");
        expect(state.registers.slice(0, 4)).toEqual([0x1_0000_0000n, 1n, 2n, 0n]);
        const loaded = final("LDR W0, [SP]\nADD X1, X0, #1\nHLT");
        expect(loaded.stalls).toBe(1);
        expect(loaded.registers[1]).toBe(1n);
    });

    it("commits flags in WB and preserves them through non-flag writers", () =>
    {
        const history = trace("SUBS X0, XZR, #1\nMOVZ X1, #2\nHLT");
        expect(history[3].pipeline[2].token?.flags?.negative).toBe(true);
        expect(history[4].pstate.negative).toBe(false);
        expect(history[5].pstate.negative).toBe(true);
        expect(history.at(-1)!.pstate).toEqual({ negative: true, zero: false, carry: false, overflow: false });
    });

    it("flushes both younger slots on a taken branch and fetches the target next cycle", () =>
    {
        const history = trace("B #12\nSTR X0, [SP]\nSUBS X0, X0, #1\nHLT", [42n]);
        expect(history[3].pipeline.slice(0, 2).every((entry) => entry.flushed && !entry.valid)).toBe(true);
        expect(history[3].fetchPc).toBe(12n);
        expect(history[4].pipeline[0].token?.address).toBe(12n);
        expect(history.at(-1)!.memory).toHaveLength(0);
        expect(history.at(-1)!.registers[0]).toBe(42n);
        expect(history.at(-1)!.pstate.negative).toBe(false);
        expect(history.at(-1)!.cycle).toBe(8);
    });

    it("continues sequential fetch after a not-taken branch", () =>
    {
        const state = final("MOVZ X0, #1\nCBZ X0, #8\nMOVZ X1, #5\nHLT");
        expect(state.registers[1]).toBe(5n);
        expect(state.cycle).toBe(8);
    });

    it("gives each loop iteration a distinct dynamic identity", () =>
    {
        const history = trace("MOVZ X0, #3\nSUB X0, X0, #1\nCBNZ X0, #-4\nHLT");
        const subtracts = history.flatMap((state) => state.pipeline
            .filter((entry) => entry.name === "WB" && entry.token?.instruction?.opcode === "SUB")
            .map((entry) => entry.token!));
        expect(new Set(subtracts.map((token) => token.instanceId)).size).toBe(3);
        expect(new Set(subtracts.map((token) => token.instruction!.id)).size).toBe(1);
        expect(history.at(-1)!.registers[0]).toBe(0n);
        expect(history.at(-1)!.retired).toBe(8);
    });

    it("squashes speculative fetch faults and wrong-path HLT", () =>
    {
        const state = new PipelineCPU("B #8\nHLT\nB #-8").run(40);
        expect(state.fault).toBeUndefined();
        expect(state.halted).toBe(false);
        expect(state.retired).toBeGreaterThan(5);
    });

    it("drains older instructions before HLT and never executes younger stores", () =>
    {
        const state = final("MOVZ X0, #1\nHLT\nSTR X0, [SP]\nMOVZ X1, #5");
        expect(state.registers.slice(0, 2)).toEqual([1n, 0n]);
        expect(state.memory).toHaveLength(0);
        expect(state.retired).toBe(2);
        expect(state.pc).toBe(4n);
        expect(Object.values(state.latches).every((entry) => !entry.valid)).toBe(true);
    });

    it.each(["LDR X1, [SP, #16]", "LDR X1, [SP, #1]"])("raises precise memory faults: %s", (faulting) =>
    {
        const state = final(`MOVZ X0, #7\n${faulting}\nSUBS X2, X0, #8\nSTR X0, [SP]\nHLT`);
        expect(state.halted).toBe(true);
        expect(state.fault).toBeDefined();
        expect(state.pc).toBe(4n);
        expect(state.registers.slice(0, 3)).toEqual([7n, 0n, 0n]);
        expect(state.pstate.negative).toBe(false);
        expect(state.memory).toHaveLength(0);
        expect(state.retired).toBe(1);
    });

    it("gives an older memory fault priority over a younger branch", () =>
    {
        const state = final("LDR X0, [SP, #16]\nB #8\nNOP\nMOVZ X1, #99\nHLT");
        expect(state.fault).toContain("out of range");
        expect(state.pc).toBe(0n);
        expect(state.registers[1]).toBe(0n);
    });

    it("faults on a real fetch failure after retiring older work", () =>
    {
        expect(final("MOVZ X0, #7")).toMatchObject({ registers: [7n, ...Array(30).fill(0n)], pc: 4n, retired: 1 });
        expect(final("B #2").fault).toContain("4-byte aligned");
        expect(final("B #100").fault).toContain("PC out of program range");
    });

    it("checks SP alignment on access, including a forwarded SP", () =>
    {
        expect(final("SUB SP, SP, #1\nADD SP, SP, #1\nHLT").fault).toBeUndefined();
        const state = final("SUB SP, SP, #8\nSTR X0, [SP]\nHLT");
        expect(state.fault).toContain("SP not 16-byte aligned");
        expect(state.memory).toHaveLength(0);
        expect(state.sp).toBe(0xFFE8n);
    });

    it("keeps snapshots isolated and resets all pipeline state", () =>
    {
        const cpu = new PipelineCPU("MOVZ X0, #1\nHLT");
        const first = cpu.step();
        first.latches["IF/ID"].token!.instruction!.opcode = "NOP";
        first.registers[0] = 99n;
        expect(cpu.run().registers[0]).toBe(1n);
        cpu.reset_state();
        expect(cpu.snapshot()).toEqual(new PipelineCPU("MOVZ X0, #1\nHLT").snapshot());
        expect(new PipelineCPU().snapshot().halted).toBe(true);
        expect(() => new PipelineCPU("INVALID")).toThrow("Unsupported instruction");
    });

    it("pauses at a run budget and can resume", () =>
    {
        const cpu = new PipelineCPU("B #0");
        expect(cpu.run(10)).toMatchObject({ cycle: 10, halted: false, fault: undefined });
        expect(cpu.run(5).cycle).toBe(15);
    });

    it.each([
        "MOVZ X0, #4660\nMOVK X0, #43981, LSL #16\nLSL X1, X0, #1\nLSR X2, X1, #2\nASR X3, X2, #4",
        "MOVZ X0, #65535\nMOVK X0, #65535, LSL #16\nADDS W1, W0, #1\nCMP X0, #1",
        "MOVZ X0, #2\nMOVZ X1, #3\nADD X2, X0, X1, LSL #4\nSUB X3, X2, #1, LSL #12",
        "MOVZ X0, #10\nMOVZ X1, #12\nAND X2, X0, X1\nORR X3, X2, X1\nEOR X4, X3, X0",
        "MOVZ X0, #3\nSUB SP, SP, #16\nSTR W0, [SP]\nLDR W1, [SP]\nADDS W2, W1, #2\nADD SP, SP, #16",
        "MOVZ X0, #4\nSUBS X0, X0, #1\nCBNZ X0, #-4"
    ])("matches the sequential reference for %s", (source) =>
    {
        const program = `${source}\nHLT`;
        const sequential = new CPU(program).run();
        const pipelined = final(program);
        expect(pipelined.fault).toBeUndefined();
        for (const key of ["registers", "sp", "pc", "pstate", "memory", "halted"] as const)
        {
            expect(pipelined[key]).toEqual(sequential[key]);
        }
    });
});
