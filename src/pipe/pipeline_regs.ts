import type { LatchName, PipelineLatch, PipelineStage, PipelineToken, StageName } from "../sim/pipeline";

export function latch(token?: PipelineToken): PipelineLatch
{
    return token ? { valid: true, token } : { valid: false };
}

export function emptyLatches(): Record<LatchName, PipelineLatch>
{
    return { "IF/ID": latch(), "ID/EX": latch(), "EX/MEM": latch(), "MEM/WB": latch() };
}

export function stage(name: StageName, token?: PipelineToken, note?: string): PipelineStage
{
    return {
        name, token, instructionId: token?.instruction?.id,
        valid: !!token, bubble: !token, stalled: false, flushed: false, note
    };
}

export function emptyStages(): PipelineStage[]
{
    return [stage("IF"), stage("ID"), stage("EX"), stage("MEM"), stage("WB")];
}
