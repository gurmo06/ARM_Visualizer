import type { ALUInstruction } from "./types";

export class ALU
{
    constructor() { }

    public alu_exec(instr: ALUInstruction): void
    {
        switch (instr.op)
        {
            case "ADD":
                { instr.dest = instr.a + instr.b; break; }
        }
    }

}