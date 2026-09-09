import type {
    CpuSnapshot, Instruction, PipelineStageSnapshot, PState, RegisterOperand, Word
} from "./types";

export type StageName = PipelineStageSnapshot["name"];
export type OperandSlot = "rn" | "rm" | "rd" | "base";

export interface OperandValue
{
    slot: OperandSlot;
    register: RegisterOperand;
    value: Word;
    source: "register-file" | "zero-register" | "EX/MEM" | "MEM/WB";
    producerId?: number;
}

export interface PipelineToken
{
    instanceId: number;
    address: Word;
    instruction?: Instruction;
    operands: OperandValue[];
    destination?: RegisterOperand;
    result?: Word;
    flags?: PState;
    aluA?: Word;
    aluB?: Word;
    memoryAddress?: Word;
    storeValue?: Word;
    branchTaken?: boolean;
    branchTarget?: Word;
    fault?: string;
}

export interface PipelineStage extends PipelineStageSnapshot
{
    token?: PipelineToken;
    stalled: boolean;
    flushed: boolean;
    note?: string;
}

export type LatchName = "IF/ID" | "ID/EX" | "EX/MEM" | "MEM/WB";

export type PipelineLatch = { valid: false; token?: never }
    | { valid: true; token: PipelineToken };

export interface PipelineSnapshot extends CpuSnapshot
{
    fetchPc: Word;
    retired: number;
    stalls: number;
    flushed: number;
    pipeline: PipelineStage[];
    latches: Record<LatchName, PipelineLatch>;
}
