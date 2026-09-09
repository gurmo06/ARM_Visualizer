import type { PipelineToken } from "../sim/pipeline";
import { destination, sameRegister, sources } from "./operands";

export function loadUseHazard(execute?: PipelineToken, decode?: PipelineToken): boolean
{
    if (execute?.instruction?.opcode !== "LDR" || !decode?.instruction) return false;
    const target = destination(execute.instruction);
    return !!target && sources(decode.instruction).some(({ register }) => sameRegister(register, target));
}
