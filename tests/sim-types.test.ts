import { describe, expect, it } from "vitest";
import type { CpuSnapshot, Instruction } from "../src/sim/types";

describe("shared simulator types", () =>
{
    it("can describe a basic instruction and CPU snapshot", () =>
    {
        const instruction: Instruction = {
            id: "0",
            address: 0n,
            opcode: "HLT",
            format: "system",
            width: 64,
            operands: [],
            writesFlags: false,
            sourceText: "HLT"
        };

        const snapshot: CpuSnapshot = {
            cycle: 0,
            pc: instruction.address,
            memorySizeBytes: 65536,
            halted: true,
            registers: Array.from({ length: 31 }, () => 0n),
            sp: 0n,
            pstate: {
                negative: false,
                zero: true,
                carry: false,
                overflow: false
            },
            memory: [],
            pipeline: [],
            events: [
                {
                    cycle: 0,
                    kind: "halt",
                    message: "Program halted."
                }
            ]
        };

        expect(snapshot.halted).toBe(true);
        expect(snapshot.events[0].kind).toBe("halt");
    });
});
