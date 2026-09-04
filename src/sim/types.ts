export type Word = bigint;
export type Byte = number;

export type RegisterNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
    | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
    | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30;

export type EncodedRegister = RegisterNumber | 31;
export type RegisterWidth = 32 | 64;
export type DataSize = 8 | 16 | 32 | 64;

export type Opcode =
    | "ADD"
    | "SUB"
    | "ADDS"
    | "SUBS"
    | "CMP"
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

export type InstructionFormat =
    | "data-processing-register"
    | "data-processing-immediate"
    | "move-wide"
    | "load-store-immediate"
    | "branch-immediate"
    | "compare-branch"
    | "system";

export type RegisterRole =
    | "general"
    | "zero-register"
    | "stack-pointer";

export interface RegisterOperand
{
    kind: "register";
    encoded: EncodedRegister;
    role: RegisterRole;
    width: RegisterWidth;
}

export interface ImmediateOperand
{
    kind: "immediate";
    value: Word;
    width?: RegisterWidth;
    shift?: 0 | 12 | 16 | 32 | 48;
    signed: boolean;
}

export type ShiftKind = "LSL" | "LSR" | "ASR";

export interface ShiftOperand
{
    kind: "shift";
    shiftKind: ShiftKind;
    amount: number;
}

export interface MemoryOperand
{
    kind: "memory";
    base: RegisterOperand;
    offset: ImmediateOperand;
    accessSize: DataSize;
    signed: boolean;
    writeback: "none" | "pre-index" | "post-index";
}

export type BranchKind = "unconditional" | "compare-zero";

export interface BranchMetadata
{
    kind: BranchKind;
    target: Word;
    offset: Word;
    conditionRegister?: RegisterOperand;
}

export type InstructionOperand =
    | RegisterOperand
    | ImmediateOperand
    | ShiftOperand
    | MemoryOperand;

export interface Instruction
{
    id: string;
    address: Word;
    opcode: Opcode;
    format: InstructionFormat;
    width: RegisterWidth;
    rd?: RegisterOperand;
    rn?: RegisterOperand;
    rm?: RegisterOperand;
    immediate?: ImmediateOperand;
    shift?: ShiftOperand;
    memory?: MemoryOperand;
    branch?: BranchMetadata;
    operands: readonly InstructionOperand[];
    writesFlags: boolean;
    sourceText: string;
    encoding?: number;
}

export type ALUOpcode =
    | "ADD"
    | "SUB"
    | "AND"
    | "ORR"
    | "EOR"
    | "LSL"
    | "LSR"
    | "ASR";

export interface ALUInstruction
{
    op: ALUOpcode;
    a: Word;
    b: Word;
    width: RegisterWidth;
}

export interface ALUResult
{
    value: Word;
    negative: boolean;
    zero: boolean;
    carry: boolean;
    overflow: boolean;
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
    value: Byte;
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

export interface CpuState
{
    registers: Word[];
    sp: Word;
    pc: Word;
    memorySizeBytes: number;
    pstate: PState;
    halted: boolean;
    fault?: string;
}

export interface CpuSnapshot extends CpuState
{
    cycle: number;
    memory: readonly MemoryCell[];
    pipeline: readonly PipelineStageSnapshot[];
    events: readonly CpuEvent[];
}
