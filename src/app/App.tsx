import type { CpuSnapshot, Instruction } from "../sim/types";

const sampleProgram: Instruction[] = [
    {
        id: "0",
        address: 0n,
        opcode: "MOVZ",
        format: "move-wide",
        rd: { kind: "register", encoded: 0, role: "general", width: 64 },
        immediate: { kind: "immediate", value: 2n, width: 64, shift: 0, signed: false },
        width: 64,
        operands: [
            { kind: "register", encoded: 0, role: "general", width: 64 },
            { kind: "immediate", value: 2n, width: 64, shift: 0, signed: false }
        ],
        writesFlags: false,
        sourceText: "MOVZ X0, #2"
    },
    {
        id: "1",
        address: 4n,
        opcode: "ADD",
        format: "data-processing-register",
        rd: { kind: "register", encoded: 2, role: "general", width: 64 },
        rn: { kind: "register", encoded: 0, role: "general", width: 64 },
        rm: { kind: "register", encoded: 1, role: "general", width: 64 },
        operands: [
            { kind: "register", encoded: 2, role: "general", width: 64 },
            { kind: "register", encoded: 0, role: "general", width: 64 },
            { kind: "register", encoded: 1, role: "general", width: 64 }
        ],
        width: 64,
        writesFlags: false,
        sourceText: "ADD X2, X0, X1"
    }
];

const initialSnapshot: CpuSnapshot = {
    cycle: 0,
    pc: 0n,
    halted: false,
    registers: Array.from({ length: 31 }, () => 0n),
    sp: 0n,
    pstate: {
        negative: false,
        zero: false,
        carry: false,
        overflow: false
    },
    memory: [],
    pipeline: [],
    events: []
};

export function App()
{
    return (
        <main className="shell">
            <section className="workspace">
                <div className="program-pane">
                    <p className="eyebrow">AArch64 Visualizer</p>
                    <h1>System Visualizer</h1>
                    <p>
                        Project shell is ready. The simulator and interface now share a typed
                        instruction/state contract.
                    </p>
                    <pre aria-label="Sample program">
                        {sampleProgram.map((instruction) => instruction.sourceText).join("\n")}
                    </pre>
                </div>

                <div className="machine-pane">
                    <div>
                        <span>Cycle</span>
                        <strong>{initialSnapshot.cycle}</strong>
                    </div>
                    <div>
                        <span>PC</span>
                        <strong>0x{initialSnapshot.pc.toString(16).padStart(16, "0")}</strong>
                    </div>
                    <div>
                        <span>PSTATE</span>
                        <strong>
                            {initialSnapshot.pstate.negative ? "N" : "n"}
                            {initialSnapshot.pstate.zero ? "Z" : "z"}
                            {initialSnapshot.pstate.carry ? "C" : "c"}
                            {initialSnapshot.pstate.overflow ? "V" : "v"}
                        </strong>
                    </div>
                </div>
            </section>
        </main>
    );
}
