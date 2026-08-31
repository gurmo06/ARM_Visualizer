import type { Instruction, Word } from "../sim/types";

export interface FetchResult
{
    instruction: Instruction;
    nextPc: Word;
}

export class FetchUnit
{
    fetch(program: readonly Instruction[], pc: Word): FetchResult
    {
        if ((pc & 0x3n) !== 0n)
        {
            throw new Error(`Instruction fetch address is not 4-byte aligned: 0x${pc.toString(16)}.`);
        }

        const index = Number(pc / 4n);

        if (index < 0 || index >= program.length)
        {
            throw new Error(`PC out of program range: 0x${pc.toString(16)}.`);
        }

        return {
            instruction: program[index],
            nextPc: pc + 4n
        };
    }
}
