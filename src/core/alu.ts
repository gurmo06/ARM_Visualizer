import type { ALUInstruction, ALUResult, Word } from "./types";

export class ALU
{
    constructor() { }

    public alu_exec(instr: ALUInstruction): ALUResult
    {
        const mask = instr.width === 64 ? 0xFFFF_FFFF_FFFF_FFFFn : 0xFFFF_FFFFn;
        const signBit = instr.width === 64 ? 1n << 63n : 1n << 31n;
        let value: Word;

        switch (instr.op)
        {
            case "ADD":
                { value = instr.a + instr.b; break; }
            default:
                { value = 0n; break; }
        }

        value &= mask;

        return {
            value,
            negative: (value & signBit) !== 0n,
            zero: value === 0n,
            carry: false,
            overflow: false
        };
    }

}
