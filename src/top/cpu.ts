import type {
    ALUOpcode,
    CpuEvent,
    CpuSnapshot,
    CpuState,
    Instruction,
    RegisterOperand,
    ShiftKind,
    Word
} from "../sim/types";
import { ALU } from "../core/alu";
import { PStateRegister } from "../core/pstate";
import { applyWidth, shift } from "../core/shifter";
import { decodeAssembly } from "../decode/decoder";
import { materializeImmediate } from "../decode/immgen";
import { FetchUnit } from "../mem/fetch";
import { LoadStoreUnit } from "../mem/lsu";
import { Memory } from "../mem/memory";
import { INITIAL_STACK_POINTER } from "../sim/memory_layout";

export class CPU
{
    private program: Instruction[];
    private registers: Word[] = Array(31).fill(0n);
    private sp: Word = 0n;
    private pc: Word = 0n;
    private halted = false;
    private faultMessage?: string;
    private cycle = 0;
    private events: CpuEvent[] = [];
    private alu = new ALU();
    private pstate = new PStateRegister();
    private fetchUnit = new FetchUnit();
    private lsu = new LoadStoreUnit();
    private memory = new Memory();

    constructor(program: Instruction[] | string = [], initRegs: Word[] = Array(31).fill(0n))
    {
        this.program = typeof program === "string" ? decodeAssembly(program) : program;
        this.reset_state(this.program, initRegs);
    }

    public current_state(): Readonly<CpuState>
    {
        return {
            registers: [...this.registers],
            sp: this.sp,
            pc: this.pc,
            memorySizeBytes: this.memory.sizeBytes,
            pstate: this.pstate.read(),
            halted: this.halted,
            fault: this.faultMessage
        };
    }

    public snapshot(): CpuSnapshot
    {
        return {
            ...this.current_state(),
            cycle: this.cycle,
            memory: this.memory.snapshot(),
            pipeline: [],
            events: [...this.events]
        };
    }

    public reset_state(program?: Instruction[] | string, initRegs: Word[] = Array(31).fill(0n)): void
    {
        if (program !== undefined)
        {
            this.program = typeof program === "string" ? decodeAssembly(program) : program;
        }

        this.registers = Array(31).fill(0n);

        for (let i = 0; i < Math.min(initRegs.length, 31); i += 1)
        {
            this.registers[i] = applyWidth(initRegs[i], 64);
        }

        this.sp = INITIAL_STACK_POINTER;
        this.pc = 0n;
        this.halted = this.program.length === 0;
        this.faultMessage = undefined;
        this.cycle = 0;
        this.events = [];
        this.pstate.reset();
        this.memory.reset();
    }

    public step(): CpuSnapshot
    {
        this.events = [];

        if (this.halted)
        {
            this.record("halt", "CPU is halted.");
            return this.snapshot();
        }

        try
        {
            const { instruction, nextPc } = this.fetchUnit.fetch(this.program, this.pc);
            this.record("fetch", `Fetched ${instruction.sourceText} at 0x${this.pc.toString(16)}.`);
            this.execute(instruction, nextPc);
        }
        catch (error)
        {
            this.fault(error instanceof Error ? error.message : String(error));
        }

        this.cycle += 1;
        return this.snapshot();
    }

    public run(maxCycles = 1000): CpuSnapshot
    {
        while (!this.halted && this.cycle < maxCycles)
        {
            this.step();
        }

        if (!this.halted)
        {
            this.fault(`Run stopped after ${maxCycles} cycles.`);
        }

        return this.snapshot();
    }

    private execute(instr: Instruction, nextPc: Word): void
    {
        switch (instr.opcode)
        {
            case "ADD":
            case "SUB":
            case "ADDS":
            case "SUBS":
            case "CMP":
                this.executeAddSub(instr, nextPc);
                break;
            case "AND":
            case "ORR":
            case "EOR":
                this.executeLogical(instr, nextPc);
                break;
            case "MOVZ":
            case "MOVK":
                this.executeMoveWide(instr, nextPc);
                break;
            case "LSL":
            case "LSR":
            case "ASR":
                this.executeShift(instr, nextPc);
                break;
            case "LDR":
                this.executeLoad(instr, nextPc);
                break;
            case "STR":
                this.executeStore(instr, nextPc);
                break;
            case "B":
                this.pc = this.requireBranch(instr).target;
                this.record("execute", `Branch target set to 0x${this.pc.toString(16)}.`);
                break;
            case "CBZ":
            case "CBNZ":
                this.executeCompareBranch(instr, nextPc);
                break;
            case "NOP":
                this.pc = nextPc;
                this.record("execute", "No operation.");
                break;
            case "HLT":
                this.halted = true;
                this.record("halt", "HLT executed.");
                break;
        }
    }

    private executeAddSub(instr: Instruction, nextPc: Word): void
    {
        const rn = this.read(this.requireRn(instr));
        const rm = instr.rm ? this.read(instr.rm) : undefined;
        const b = instr.immediate
            ? materializeImmediate(instr.immediate)
            : this.applyInstructionShift(rm ?? this.read(this.requireRm(instr)), instr);
        const op = instr.opcode === "SUB" || instr.opcode === "SUBS" || instr.opcode === "CMP"
            ? "SUB"
            : "ADD";
        const result = this.alu.alu_exec({ op, a: rn, b, width: instr.width });

        if (instr.writesFlags)
        {
            this.pstate.updateFromALU(result);
        }

        if (instr.opcode !== "CMP")
        {
            this.write(this.requireRd(instr), result.value);
            this.record("writeback", `${instr.rd?.role === "stack-pointer" ? "SP" : "Rd"} = 0x${result.value.toString(16)}.`);
        }

        this.pc = nextPc;
    }

    private executeLogical(instr: Instruction, nextPc: Word): void
    {
        const result = this.alu.alu_exec({
            op: instr.opcode as ALUOpcode,
            a: this.read(this.requireRn(instr)),
            b: this.applyInstructionShift(this.read(this.requireRm(instr)), instr),
            width: instr.width
        });

        this.write(this.requireRd(instr), result.value);
        this.pc = nextPc;
        this.record("writeback", `Logical result = 0x${result.value.toString(16)}.`);
    }

    private executeMoveWide(instr: Instruction, nextPc: Word): void
    {
        const rd = this.requireRd(instr);
        const immediate = materializeImmediate(this.requireImmediate(instr));
        const value = instr.opcode === "MOVZ"
            ? immediate
            : (this.read(rd) & ~(0xFFFFn << BigInt(instr.immediate?.shift ?? 0))) | immediate;

        this.write(rd, applyWidth(value, instr.width));
        this.pc = nextPc;
        this.record("writeback", `${instr.opcode} wrote 0x${applyWidth(value, instr.width).toString(16)}.`);
    }

    private executeShift(instr: Instruction, nextPc: Word): void
    {
        const amount = Number(this.requireImmediate(instr).value);
        const value = shift(this.read(this.requireRn(instr)), instr.opcode as ShiftKind, amount, instr.width);

        this.write(this.requireRd(instr), value);
        this.pc = nextPc;
        this.record("execute", `${instr.opcode} by ${amount}.`);
    }

    private executeLoad(instr: Instruction, nextPc: Word): void
    {
        const memory = this.requireMemory(instr);
        const base = this.read(memory.base);
        const value = this.lsu.load(this.memory, memory, base);

        this.write(this.requireRd(instr), applyWidth(value, instr.width));
        this.writebackBase(memory.base, this.lsu.writebackAddress(memory, base));
        this.pc = nextPc;
        this.record("memory", `Loaded 0x${value.toString(16)}.`);
    }

    private executeStore(instr: Instruction, nextPc: Word): void
    {
        const memory = this.requireMemory(instr);
        const base = this.read(memory.base);
        const value = this.read(this.requireRd(instr));

        this.lsu.store(this.memory, memory, base, value);
        this.writebackBase(memory.base, this.lsu.writebackAddress(memory, base));
        this.pc = nextPc;
        this.record("memory", `Stored 0x${value.toString(16)}.`);
    }

    private executeCompareBranch(instr: Instruction, nextPc: Word): void
    {
        const value = this.read(this.requireRn(instr));
        const shouldBranch = instr.opcode === "CBZ" ? value === 0n : value !== 0n;

        this.pc = shouldBranch ? this.requireBranch(instr).target : nextPc;
        this.record("execute", shouldBranch ? "Compare branch taken." : "Compare branch not taken.");
    }

    private applyInstructionShift(value: Word, instr: Instruction): Word
    {
        if (!instr.shift)
        {
            return value;
        }

        return shift(value, instr.shift.shiftKind, instr.shift.amount, instr.width);
    }

    private read(operand: RegisterOperand): Word
    {
        if (operand.encoded === 31)
        {
            return applyWidth(operand.role === "stack-pointer" ? this.sp : 0n, operand.width);
        }

        return applyWidth(this.registers[operand.encoded], operand.width);
    }

    private write(operand: RegisterOperand, value: Word): void
    {
        const masked = applyWidth(value, operand.width);

        if (operand.encoded === 31)
        {
            if (operand.role === "stack-pointer")
            {
                this.sp = masked;
            }

            return;
        }

        this.registers[operand.encoded] = masked;
    }

    private writebackBase(base: RegisterOperand, value: Word | undefined): void
    {
        if (value !== undefined)
        {
            this.write(base, value);
        }
    }

    private requireRd(instr: Instruction): RegisterOperand
    {
        if (!instr.rd)
        {
            throw new Error(`${instr.opcode} requires Rd.`);
        }

        return instr.rd;
    }

    private requireRn(instr: Instruction): RegisterOperand
    {
        if (!instr.rn)
        {
            throw new Error(`${instr.opcode} requires Rn.`);
        }

        return instr.rn;
    }

    private requireRm(instr: Instruction): RegisterOperand
    {
        if (!instr.rm)
        {
            throw new Error(`${instr.opcode} requires Rm.`);
        }

        return instr.rm;
    }

    private requireImmediate(instr: Instruction)
    {
        if (!instr.immediate)
        {
            throw new Error(`${instr.opcode} requires an immediate.`);
        }

        return instr.immediate;
    }

    private requireMemory(instr: Instruction)
    {
        if (!instr.memory)
        {
            throw new Error(`${instr.opcode} requires a memory operand.`);
        }

        return instr.memory;
    }

    private requireBranch(instr: Instruction)
    {
        if (!instr.branch)
        {
            throw new Error(`${instr.opcode} requires branch metadata.`);
        }

        return instr.branch;
    }

    private record(kind: CpuEvent["kind"], message: string): void
    {
        this.events.push({ cycle: this.cycle, kind, message });
    }

    private fault(message: string): void
    {
        this.faultMessage = message;
        this.halted = true;
        this.record("fault", message);
    }
}
