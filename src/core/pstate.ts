import type { ALUResult, PState } from "../sim/types";

export const INITIAL_PSTATE: PState = {
    negative: false,
    zero: false,
    carry: false,
    overflow: false
};

export class PStateRegister
{
    private flags: PState = { ...INITIAL_PSTATE };

    read(): PState
    {
        return { ...this.flags };
    }

    write(next: PState): void
    {
        this.flags = { ...next };
    }

    updateFromALU(result: ALUResult): void
    {
        this.flags = {
            negative: result.negative,
            zero: result.zero,
            carry: result.carry,
            overflow: result.overflow
        };
    }

    reset(): void
    {
        this.flags = { ...INITIAL_PSTATE };
    }
}
