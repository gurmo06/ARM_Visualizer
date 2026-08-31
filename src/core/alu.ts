import type { ALUInstruction, ALUResult, Word } from "./types";
import { applyWidth, maskForWidth, shift, signBitForWidth } from "./shifter";

export class ALU
{
    constructor() { }

    public alu_exec(instr: ALUInstruction): ALUResult
    {
        const mask = maskForWidth(instr.width);
        const signBit = signBitForWidth(instr.width);
        const a = applyWidth(instr.a, instr.width);
        const b = applyWidth(instr.b, instr.width);
        let value: Word;
        let carry = false;
        let overflow = false;

        switch (instr.op)
        {
            case "ADD":
            {
                const full = a + b;
                value = full & mask;
                carry = full > mask;
                overflow = ((a ^ value) & (b ^ value) & signBit) !== 0n;
                break;
            }
            case "SUB":
            {
                value = (a - b) & mask;
                carry = a >= b;
                overflow = ((a ^ b) & (a ^ value) & signBit) !== 0n;
                break;
            }
            case "AND":
                { value = a & b; break; }
            case "ORR":
                { value = a | b; break; }
            case "EOR":
                { value = a ^ b; break; }
            case "LSL":
            case "LSR":
            case "ASR":
                { value = shift(a, instr.op, Number(b), instr.width); break; }
        }

        return {
            value,
            negative: (value & signBit) !== 0n,
            zero: value === 0n,
            carry,
            overflow
        };
    }

}
