export type Word = bigint;
export type RegisterIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
    | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
    | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30;

export type RegisterWidth = 32 | 64;

export type Opcode =
    | "ADD"
    | "SUB"
    | "ADDS"
    | "SUBS"
    | "AND"
    | "ORR"
    | "EOR"
    | "MOVZ"
    | "MOVK"
    | "LSL"
    | "LSR"
    | "ASR"
    | "LDR"
    | "STR"
    | "B"
    | "CBZ"
    | "CBNZ"
    | "NOP"
    | "HLT";

export type Operand =
    | {
        kind: "register";
        index: RegisterIndex;
        width: RegisterWidth;
    }
    | {
        kind: "zero-register";
        width: RegisterWidth;
    }
    | {
        kind: "stack-pointer";
        width: 64;
    };

export interface MemoryOperand
{
    base: Operand;
    offset: Word;
    width: RegisterWidth;
}

export interface BranchMetadata
{
    kind: "unconditional" | "compare-zero";
    target: Word;
    conditionRegister?: Operand;
}

export interface Instruction
{
    id: string;
    address: Word;
    opcode: Opcode;
    width: RegisterWidth;
    destination?: Operand;
    sources?: Operand[];
    immediate?: Word;
    shiftAmount?: number;
    memory?: MemoryOperand;
    branch?: BranchMetadata;
    updatesFlags?: boolean;
    sourceText?: string;
    encoded?: number;
}

export interface PState
{
    negative: boolean;
    zero: boolean;
    carry: boolean;
    overflow: boolean;
}

export interface MemoryCell
{
    address: Word;
    value: number;
}

export interface PipelineStageSnapshot
{
    name: "IF" | "ID" | "EX" | "MEM" | "WB";
    instructionId?: string;
    valid: boolean;
    bubble: boolean;
}

export interface CpuEvent
{
    cycle: number;
    kind: "fetch" | "decode" | "execute" | "memory" | "writeback" | "halt" | "fault";
    message: string;
}

export interface CpuSnapshot
{
    cycle: number;
    pc: Word;
    halted: boolean;
    registers: readonly Word[];
    sp: Word;
    pstate: PState;
    memory: readonly MemoryCell[];
    pipeline: readonly PipelineStageSnapshot[];
    events: readonly CpuEvent[];
}
