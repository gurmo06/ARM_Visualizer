import { applyWidth } from "../core/shifter";
import type { OperandValue, PipelineToken } from "../sim/pipeline";
import { sameRegister } from "./operands";

export function forwardOperands(
    operands: OperandValue[], exMem?: PipelineToken, memWb?: PipelineToken
): OperandValue[]
{
    return operands.map((operand) =>
    {
        // The closest older writer wins, including across W/X aliases.
        for (const [producer, source] of [[exMem, "EX/MEM"], [memWb, "MEM/WB"]] as const)
        {
            if (!producer?.destination || producer.fault
                || !sameRegister(operand.register, producer.destination)) continue;
            if (source === "EX/MEM" && producer.instruction?.opcode === "LDR")
            {
                throw new Error("Load-use hazard reached EX without a stall.");
            }
            if (producer.result !== undefined)
            {
                return {
                    ...operand, source, producerId: producer.instanceId,
                    value: applyWidth(producer.result, operand.register.width)
                };
            }
        }
        return { ...operand };
    });
}
