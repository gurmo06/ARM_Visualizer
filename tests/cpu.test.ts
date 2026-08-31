import { describe, expect, it } from "vitest";
import { CPU } from "../src/top/cpu";

describe("non-pipelined CPU", () =>
{
    it("runs a small arithmetic program from assembly source", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #2
            MOVZ X1, #3
            ADD X2, X0, X1
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.halted).toBe(true);
        expect(snapshot.fault).toBeUndefined();
        expect(snapshot.registers[0]).toBe(2n);
        expect(snapshot.registers[1]).toBe(3n);
        expect(snapshot.registers[2]).toBe(5n);
        expect(snapshot.pc).toBe(12n);
    });

    it("updates NZCV flags for flag-writing arithmetic", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #1
            SUBS X1, X0, #1
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[1]).toBe(0n);
        expect(snapshot.pstate.zero).toBe(true);
        expect(snapshot.pstate.negative).toBe(false);
        expect(snapshot.pstate.carry).toBe(true);
        expect(snapshot.pstate.overflow).toBe(false);
    });

    it("stores and loads little-endian 64-bit values", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #4660
            STR X0, [SP]
            LDR X1, [SP]
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[1]).toBe(0x1234n);
        expect(snapshot.memory.slice(0, 2)).toEqual([
            { address: 0n, value: 0x34 },
            { address: 1n, value: 0x12 }
        ]);
    });

    it("honors XZR writes and reads", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #7
            ADD XZR, X0, X0
            ADD X1, XZR, X0
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[0]).toBe(7n);
        expect(snapshot.registers[1]).toBe(7n);
    });

    it("branches using PC-relative byte offsets", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #0
            CBZ X0, #8
            MOVZ X1, #99
            MOVZ X1, #5
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[1]).toBe(5n);
        expect(snapshot.pc).toBe(16n);
    });

    it("rejects unsupported assembly during decode", () =>
    {
        expect(() => new CPU("BOGUS X0, X1")).toThrow("Unsupported instruction");
    });
});
