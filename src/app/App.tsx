import { useMemo, useRef, useState } from "react";
import type { CpuSnapshot } from "../sim/types";
import { MEMORY_HIGH_ADDRESS, STACK_WINDOW_BYTES } from "../sim/memory_layout";
import { CPU } from "../top/cpu";

const sampleProgram = `MOVZ X0, #2
MOVZ X1, #3
ADD X2, X0, X1
SUB SP, SP, #16
STR X2, [SP]
LDR X3, [SP]
SUBS X4, X3, #5
CBZ X4, #8
MOVZ X5, #99
HLT`;

function createCpu(program: string): { cpu?: CPU; snapshot?: CpuSnapshot; error?: string }
{
    try
    {
        const cpu = new CPU(program);
        return { cpu, snapshot: cpu.snapshot() };
    }
    catch (error)
    {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function formatHex(value: bigint, digits = 16): string
{
    return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

function memoryByte(snapshot: CpuSnapshot | undefined, address: bigint): number
{
    return snapshot?.memory.find((cell) => cell.address === address)?.value ?? 0;
}

function stackRows(snapshot: CpuSnapshot | undefined): bigint[]
{
    if (!snapshot)
    {
        return [];
    }

    const rowSize = 16n;
    const halfWindow = BigInt(STACK_WINDOW_BYTES / 2);
    const start = snapshot.sp > halfWindow ? snapshot.sp - halfWindow : 0n;
    const alignedStart = start - (start % rowSize);
    const rows: bigint[] = [];

    for (let address = alignedStart; address <= MEMORY_HIGH_ADDRESS && rows.length < 8; address += rowSize)
    {
        rows.push(address);
    }

    return rows;
}

function memoryUsagePercent(snapshot: CpuSnapshot | undefined): number
{
    if (!snapshot || snapshot.memorySizeBytes === 0)
    {
        return 0;
    }

    return (snapshot.memory.length / snapshot.memorySizeBytes) * 100;
}

export function App()
{
    const initial = useMemo(() => createCpu(sampleProgram), []);
    const cpuRef = useRef<CPU | undefined>(initial.cpu);
    const [program, setProgram] = useState(sampleProgram);
    const [snapshot, setSnapshot] = useState<CpuSnapshot | undefined>(initial.snapshot);
    const [error, setError] = useState(initial.error);

    function loadProgram(nextProgram = program): void
    {
        const loaded = createCpu(nextProgram);
        cpuRef.current = loaded.cpu;
        setSnapshot(loaded.snapshot);
        setError(loaded.error);
    }

    function step(): void
    {
        if (!cpuRef.current)
        {
            loadProgram();
            return;
        }

        setSnapshot(cpuRef.current.step());
        setError(cpuRef.current.snapshot().fault);
    }

    function run(): void
    {
        if (!cpuRef.current)
        {
            loadProgram();
            return;
        }

        const nextSnapshot = cpuRef.current.run();
        setSnapshot(nextSnapshot);
        setError(nextSnapshot.fault);
    }

    const currentLine = snapshot ? Number(snapshot.pc / 4n) : 0;

    return (
        <main className="shell">
            <section className="workspace">
                <div className="program-pane">
                    <p className="eyebrow">AArch64 Visualizer</p>
                    <h1>System Visualizer</h1>
                    <textarea
                        aria-label="Assembly program"
                        spellCheck={false}
                        value={program}
                        onChange={(event) => setProgram(event.target.value)}
                    />

                    <div className="controls">
                        <button type="button" onClick={() => loadProgram()}>
                            Reset
                        </button>
                        <button type="button" onClick={step} disabled={snapshot?.halted}>
                            Step
                        </button>
                        <button type="button" onClick={run} disabled={snapshot?.halted}>
                            Run
                        </button>
                    </div>

                    <div className="program-lines" aria-label="Program listing">
                        {program.split(/\r?\n/).map((line, index) => (
                            <div
                                className={index === currentLine && !snapshot?.halted ? "active-line" : ""}
                                key={`${index}-${line}`}
                            >
                                <span>{formatHex(BigInt(index * 4), 4)}</span>
                                <code>{line || " "}</code>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="machine-pane">
                    <div>
                        <span>Cycle</span>
                        <strong>{snapshot?.cycle ?? 0}</strong>
                    </div>
                    <div>
                        <span>PC</span>
                        <strong>{formatHex(snapshot?.pc ?? 0n)}</strong>
                    </div>
                    <div>
                        <span>SP</span>
                        <strong>{formatHex(snapshot?.sp ?? 0n)}</strong>
                    </div>
                    <div>
                        <span>Memory</span>
                        <strong>{snapshot?.memorySizeBytes ? `${snapshot.memorySizeBytes / 1024} KiB` : "0 KiB"}</strong>
                    </div>
                    <div>
                        <span>PSTATE</span>
                        <strong>
                            {snapshot?.pstate.negative ? "N" : "n"}
                            {snapshot?.pstate.zero ? "Z" : "z"}
                            {snapshot?.pstate.carry ? "C" : "c"}
                            {snapshot?.pstate.overflow ? "V" : "v"}
                        </strong>
                    </div>
                    <div>
                        <span>Status</span>
                        <strong>{snapshot?.halted ? "halted" : "running"}</strong>
                    </div>
                    {error && (
                        <div className="fault">
                            <span>Fault</span>
                            <strong>{error}</strong>
                        </div>
                    )}
                </div>
            </section>

            <section className="state-grid">
                <div className="register-panel">
                    <h2>Registers</h2>
                    <div className="register-grid">
                        {(snapshot?.registers ?? []).map((value, index) => (
                            <div key={index}>
                                <span>X{index}</span>
                                <strong>{formatHex(value)}</strong>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="side-panels">
                    <section>
                        <h2>Memory</h2>
                        <div className="memory-map">
                            <div className="memory-band stack-band">
                                <span>Stack</span>
                                <strong>SP {formatHex(snapshot?.sp ?? 0n, 4)}</strong>
                            </div>
                            <div className="memory-band free-band">
                                <span>Free / Heap</span>
                                <strong>{snapshot?.memory.length ?? 0} touched bytes</strong>
                            </div>
                            <div className="memory-band program-band">
                                <span>Program</span>
                                <strong>0x0000</strong>
                            </div>
                        </div>
                        <div className="usage-row">
                            <span>Used</span>
                            <strong>{memoryUsagePercent(snapshot).toFixed(2)}%</strong>
                        </div>
                        <div className="memory-window">
                            {stackRows(snapshot).map((address) => (
                                <div className={address === snapshot?.sp ? "sp-row" : ""} key={address.toString()}>
                                    <span>{address === snapshot?.sp ? "SP" : formatHex(address, 4)}</span>
                                    <code>
                                        {Array.from({ length: 16 }, (_, index) => (
                                            memoryByte(snapshot, address + BigInt(index))
                                                .toString(16)
                                                .toUpperCase()
                                                .padStart(2, "0")
                                        )).join(" ")}
                                    </code>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2>Events</h2>
                        <div className="event-list">
                            {snapshot?.events.length ? snapshot.events.map((event, index) => (
                                <div key={`${event.cycle}-${event.kind}-${index}`}>
                                    <span>{event.kind}</span>
                                    <p>{event.message}</p>
                                </div>
                            )) : <p>No events yet.</p>}
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}
