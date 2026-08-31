import { useMemo } from "react";
import { CPU } from "../top/cpu";

const sampleProgram = `MOVZ X0, #2
MOVZ X1, #3
ADD X2, X0, X1
HLT`;

export function App()
{
    const snapshot = useMemo(() => new CPU(sampleProgram).run(), []);

    return (
        <main className="shell">
            <section className="workspace">
                <div className="program-pane">
                    <p className="eyebrow">AArch64 Visualizer</p>
                    <h1>System Visualizer</h1>
                    <p>
                        The first non-pipelined CPU path is alive. This sample is decoded from
                        assembly, executed, and shown from the simulator snapshot.
                    </p>
                    <pre aria-label="Sample program">{sampleProgram}</pre>
                </div>

                <div className="machine-pane">
                    <div>
                        <span>Cycle</span>
                        <strong>{snapshot.cycle}</strong>
                    </div>
                    <div>
                        <span>PC</span>
                        <strong>0x{snapshot.pc.toString(16).padStart(16, "0")}</strong>
                    </div>
                    <div>
                        <span>PSTATE</span>
                        <strong>
                            {snapshot.pstate.negative ? "N" : "n"}
                            {snapshot.pstate.zero ? "Z" : "z"}
                            {snapshot.pstate.carry ? "C" : "c"}
                            {snapshot.pstate.overflow ? "V" : "v"}
                        </strong>
                    </div>
                    <div>
                        <span>X2</span>
                        <strong>0x{snapshot.registers[2].toString(16)}</strong>
                    </div>
                    <div>
                        <span>Status</span>
                        <strong>{snapshot.halted ? "halted" : "running"}</strong>
                    </div>
                </div>
            </section>
        </main>
    );
}
