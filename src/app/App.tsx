import type { CpuSnapshot, Instruction } from "../sim/types";

const sampleProgram: Instruction[] = [
    {
        id: "0",
        address: 0n,
        opcode: "MOVZ",
        destination: { kind: "register", index: 0, width: 64 },
        immediate: 2n,
        shiftAmount: 0,
        width: 64,
        sourceText: "MOVZ X0, #2"
    },
    {
        id: "1",
        address: 4n,
        opcode: "ADD",
        destination: { kind: "register", index: 2, width: 64 },
        sources: [
            { kind: "register", index: 0, width: 64 },
            { kind: "register", index: 1, width: 64 }
        ],
        width: 64,
        updatesFlags: false,
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
