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

    it("executes logical operations", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #10
            MOVZ X1, #12
            AND X2, X0, X1
            ORR X3, X0, X1
            EOR X4, X0, X1
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[2]).toBe(8n);
        expect(snapshot.registers[3]).toBe(14n);
        expect(snapshot.registers[4]).toBe(6n);
    });

    it("executes move-wide and shift instructions", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #4660
            MOVK X0, #43981, LSL #16
            LSL X1, X0, #1
            LSR X2, X1, #1
            ASR X3, X2, #4
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[0]).toBe(0xABCD_1234n);
        expect(snapshot.registers[1]).toBe(0x1_579A_2468n);
        expect(snapshot.registers[2]).toBe(0xABCD_1234n);
        expect(snapshot.registers[3]).toBe(0xABCD_123n);
    });

    it("executes shifted-register and shifted-immediate add/sub forms", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #1
            MOVZ X1, #2
            ADD X2, X0, X1, LSL #3
            ADD X3, X2, #1, LSL #12
            SUB X4, X3, X1, LSL #2
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[2]).toBe(17n);
        expect(snapshot.registers[3]).toBe(4113n);
        expect(snapshot.registers[4]).toBe(4105n);
    });

    it("stores and loads little-endian 64-bit values", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #4660
            SUB SP, SP, #16
            STR X0, [SP]
            LDR X1, [SP]
            ADD SP, SP, #16
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[1]).toBe(0x1234n);
        expect(snapshot.memory.slice(0, 2)).toEqual([
            { address: 0xFFE0n, value: 0x34 },
            { address: 0xFFE1n, value: 0x12 }
        ]);
        expect(snapshot.sp).toBe(0xFFF0n);
    });

    it("initializes SP near the top of the 64 KiB memory space", () =>
    {
        const cpu = new CPU("HLT");
        const snapshot = cpu.run();

        expect(snapshot.memorySizeBytes).toBe(65536);
        expect(snapshot.sp).toBe(0xFFF0n);
    });

    it("faults on out-of-range memory access", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #1
            STR X0, [SP, #16]
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.halted).toBe(true);
        expect(snapshot.fault).toContain("Memory access out of range");
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

    it("executes unconditional branches and CBNZ", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #1
            CBNZ X0, #12
            MOVZ X1, #99
            B #8
            MOVZ X1, #5
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[1]).toBe(5n);
        expect(snapshot.pc).toBe(20n);
    });

    it("zero-extends 32-bit register writes", () =>
    {
        const cpu = new CPU(`
            MOVZ X0, #65535
            MOVK X0, #65535, LSL #16
            ADD W1, W0, #1
            HLT
        `);

        const snapshot = cpu.run();

        expect(snapshot.registers[0]).toBe(0xFFFF_FFFFn);
        expect(snapshot.registers[1]).toBe(0n);
    });

    it("rejects unsupported assembly during decode", () =>
    {
        expect(() => new CPU("BOGUS X0, X1")).toThrow("Unsupported instruction");
    });
});
