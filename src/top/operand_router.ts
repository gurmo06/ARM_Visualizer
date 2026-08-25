import type { RegisterFile, RegIndex, Word } from "../core/register_file";
import type { StackPointer } from "../core/stack_pointer";

export type OperandRole =
    | "GPR"
    | "GPR/SP_BASE"
    | "GPR/SP_ADD_SUB";

export function readOperand(
    rf: RegisterFile,
    sp: StackPointer,
    role: OperandRole,
    idx: RegIndex | 31
): Word
{
    if (idx === 31)
    {
        if (role === "GPR")
        {
            return 0n;
        }

        return sp.read();
    }

    return rf.readA({ idx });
}

export function writeOperand(
    rf: RegisterFile,
    sp: StackPointer,
    role: OperandRole,
    idx: RegIndex | 31,
    value: Word
): void
{
    if (idx === 31)
    {
        if (role !== "GPR")
        {
            sp.write(value);
        }

        return;
    }

    rf.write({ wr: true, idx, data: value });
}
