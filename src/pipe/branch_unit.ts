import type { Instruction, Word } from "../sim/types";

export function resolveBranch(instruction: Instruction, value = 0n): { taken: boolean; target: Word }
{
    if (!instruction.branch) throw new Error("Missing branch metadata.");
    const taken = instruction.opcode === "B"
        || (instruction.opcode === "CBZ" ? value === 0n : value !== 0n);
    return { taken, target: instruction.branch.target };
}
