import type { ImmediateOperand, Word } from "../sim/types";

export function materializeImmediate(operand: ImmediateOperand): Word
{
    return operand.value << BigInt(operand.shift ?? 0);
}
