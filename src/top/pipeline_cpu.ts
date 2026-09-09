import { INITIAL_PSTATE } from "../core/pstate";
import { applyWidth } from "../core/shifter";
import { decodeAssembly } from "../decode/decoder";
import { FetchUnit } from "../mem/fetch";
import { Memory } from "../mem/memory";
import { executeToken } from "../pipe/execute";
import { forwardOperands } from "../pipe/forwarding";
import { loadUseHazard } from "../pipe/hazards";
import { readOperands, registerName } from "../pipe/operands";
import { emptyLatches, emptyStages, latch, stage } from "../pipe/pipeline_regs";
import { INITIAL_STACK_POINTER } from "../sim/memory_layout";
import type { PipelineSnapshot, PipelineStage, PipelineToken } from "../sim/pipeline";
import type { CpuEvent, Instruction, PState, Word } from "../sim/types";

export class PipelineCPU
{
    private program: Instruction[] = [];
    private registers: Word[] = [];
    private sp = INITIAL_STACK_POINTER;
    private pc = 0n;
    private fetchPc = 0n;
    private flags: PState = { ...INITIAL_PSTATE };
    private memory = new Memory();
    private fetchUnit = new FetchUnit();
    private latches = emptyLatches();
    private stages = emptyStages();
    private events: CpuEvent[] = [];
    private cycle = 0;
    private nextId = 1;
    private retired = 0;
    private stalls = 0;
    private flushed = 0;
    private halted = false;
    private fetchStopped = false;
    private fault?: string;

    constructor(program: Instruction[] | string = [], initRegs: Word[] = [])
    {
        this.reset_state(program, initRegs);
    }

    public reset_state(program: Instruction[] | string = this.program, initRegs: Word[] = []): void
    {
        this.program = structuredClone(typeof program === "string" ? decodeAssembly(program) : program);
        this.registers = Array.from({ length: 31 }, (_, i) => applyWidth(initRegs[i] ?? 0n, 64));
        this.sp = INITIAL_STACK_POINTER;
        this.pc = this.fetchPc = 0n;
        this.flags = { ...INITIAL_PSTATE };
        this.memory.reset();
        this.latches = emptyLatches();
        this.stages = emptyStages();
        this.events = [];
        this.cycle = this.retired = this.stalls = this.flushed = 0;
        this.nextId = 1;
        this.halted = this.program.length === 0;
        this.fetchStopped = false;
        this.fault = undefined;
    }

    public snapshot(): PipelineSnapshot
    {
        return structuredClone({
            cycle: this.cycle, registers: this.registers, sp: this.sp, pc: this.pc,
            memorySizeBytes: this.memory.sizeBytes, memory: this.memory.snapshot(),
            pstate: this.flags, halted: this.halted, fault: this.fault,
            fetchPc: this.fetchPc, retired: this.retired, stalls: this.stalls,
            flushed: this.flushed, pipeline: this.stages, latches: this.latches, events: this.events
        });
    }

    public step(): PipelineSnapshot
    {
        if (this.halted) return this.snapshot();
        this.cycle += 1;
        this.events = [];

        // All stage inputs come from the previous edge. WB is visible to ID in this cycle.
        const old = structuredClone(this.latches);
        const wb = old["MEM/WB"].token;
        const mem = old["EX/MEM"].token;
        const ex = old["ID/EX"].token;
        const id = old["IF/ID"].token;
        this.stages = [stage("IF"), stage("ID", id), stage("EX", ex), stage("MEM", mem), stage("WB", wb)];

        if (wb)
        {
            this.retire(wb);
            if (this.halted)
            {
                this.squash(this.stages.slice(0, 4), wb.fault ? "Older instruction faulted" : "HLT retired");
                this.latches = emptyLatches();
                return this.snapshot();
            }
        }

        if (mem && !mem.fault) this.attempt(mem, () => this.accessMemory(mem));
        if (ex && !mem?.fault && !ex.fault)
        {
            this.attempt(ex, () =>
            {
                ex.operands = forwardOperands(ex.operands, old["EX/MEM"].token, old["MEM/WB"].token);
                for (const operand of ex.operands)
                {
                    if (operand.producerId !== undefined)
                    {
                        this.record("forward", `${registerName(operand.register)} from ${operand.source} (#${operand.producerId}).`, ex);
                    }
                }
                executeToken(ex);
                this.record("execute", ex.instruction?.sourceText ?? "Fetch fault", ex);
                if (ex.branchTaken !== undefined)
                {
                    this.record("branch", ex.branchTaken
                        ? `Taken to 0x${ex.branchTarget!.toString(16)}.` : "Not taken.", ex);
                }
            });
        }

        if (id?.instruction && !id.fault)
        {
            id.operands = readOperands(id.instruction, this.registers, this.sp);
            this.record("decode", id.instruction.sourceText, id);
        }

        const stalled = !mem?.fault && !ex?.fault && loadUseHazard(ex, id);
        const fetched = !stalled && !this.fetchStopped ? this.fetch() : undefined;
        this.stages[0] = stage("IF", fetched, this.fetchStopped && !fetched ? "Fetch stopped" : undefined);
        this.latches = {
            "IF/ID": latch(fetched), "ID/EX": latch(id), "EX/MEM": latch(ex), "MEM/WB": latch(mem)
        };

        // Older faults take priority over younger branches and halt instructions.
        if (mem?.fault)
        {
            this.squash(this.stages.slice(0, 3), "Older memory/fetch fault");
            this.latches["IF/ID"] = latch();
            this.latches["ID/EX"] = latch();
            this.latches["EX/MEM"] = latch();
            this.fetchStopped = true;
        }
        else if (ex && (ex.fault || ex.branchTaken || ex.instruction?.opcode === "HLT"))
        {
            const reason = ex.fault ? "Older instruction fault" : ex.branchTaken ? "Taken branch" : "HLT in EX";
            this.squash(this.stages.slice(0, 2), reason);
            this.latches["IF/ID"] = latch();
            this.latches["ID/EX"] = latch();
            this.fetchStopped = !ex.branchTaken;
            if (ex.branchTaken) this.fetchPc = applyWidth(ex.branchTarget!, 64);
        }
        else if (stalled)
        {
            this.stalls += 1;
            this.stages[0].stalled = this.stages[1].stalled = true;
            this.stages[0].note = "PC held";
            this.stages[1].note = `Waiting for load #${ex!.instanceId}`;
            this.latches["IF/ID"] = latch(id);
            this.latches["ID/EX"] = latch();
            this.record("stall", "Load-use dependency: hold PC and IF/ID; insert an ID/EX bubble.", id);
        }
        return this.snapshot();
    }

    public run(maxCycles = 1000): PipelineSnapshot
    {
        if (!Number.isSafeInteger(maxCycles) || maxCycles < 0) throw new Error("Invalid cycle budget.");
        for (let i = 0; i < maxCycles && !this.halted; i += 1) this.step();
        return this.snapshot();
    }

    private fetch(): PipelineToken
    {
        const token: PipelineToken = { instanceId: this.nextId++, address: this.fetchPc, operands: [] };
        this.attempt(token, () =>
        {
            const fetched = this.fetchUnit.fetch(this.program, this.fetchPc);
            token.instruction = fetched.instruction;
            this.fetchPc = fetched.nextPc;
            this.record("fetch", `0x${token.address.toString(16)}: ${token.instruction.sourceText}`, token);
        });
        // A speculative fetch fault is a token. An older branch can still discard it.
        if (token.fault) this.fetchStopped = true;
        return token;
    }

    private accessMemory(token: PipelineToken): void
    {
        const instruction = token.instruction;
        if (!instruction?.memory || token.memoryAddress === undefined) return;
        const { accessSize, signed } = instruction.memory;
        if (instruction.opcode === "LDR")
        {
            token.result = applyWidth(this.memory.load(token.memoryAddress, accessSize, signed), instruction.width);
        }
        else
        {
            this.memory.store(token.memoryAddress, accessSize, token.storeValue!);
        }
        this.record("memory", `${instruction.opcode} ${accessSize} bits at 0x${token.memoryAddress.toString(16)}.`, token);
    }

    private retire(token: PipelineToken): void
    {
        if (token.fault)
        {
            this.fault = token.fault;
            this.pc = token.address;
            this.halted = true;
            this.record("fault", token.fault, token);
            return;
        }
        const instruction = token.instruction!;
        if (token.destination && token.result !== undefined)
        {
            const value = applyWidth(token.result, token.destination.width);
            if (token.destination.role === "stack-pointer") this.sp = value;
            else this.registers[token.destination.encoded] = value;
            this.record("writeback", `${registerName(token.destination)} = 0x${value.toString(16)}.`, token);
        }
        if (token.flags) this.flags = { ...token.flags };
        this.retired += 1;
        this.pc = instruction.opcode === "HLT" ? token.address
            : token.branchTaken ? applyWidth(token.branchTarget!, 64) : token.address + 4n;
        if (instruction.opcode === "HLT")
        {
            this.halted = true;
            this.record("halt", "HLT retired; pipeline drained.", token);
        }
    }

    private squash(stages: PipelineStage[], reason: string): void
    {
        for (const current of stages)
        {
            if (!current.token) continue;
            current.valid = false;
            current.bubble = true;
            current.flushed = true;
            current.note = reason;
            this.flushed += 1;
            this.record("flush", `${current.name}: ${reason}.`, current.token);
        }
    }

    private attempt(token: PipelineToken, action: () => void): void
    {
        try { action(); }
        catch (error) { token.fault = error instanceof Error ? error.message : String(error); }
    }

    private record(kind: CpuEvent["kind"], message: string, token?: PipelineToken): void
    {
        this.events.push({ cycle: this.cycle, kind, message, instanceId: token?.instanceId });
    }
}
