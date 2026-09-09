import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Cpu, FastForward, FileCheck2, Layers, Monitor, Pause, Play, RotateCcw, StepForward, Upload } from "lucide-react";
import { decodeAssembly } from "../decode/decoder";
import type { PipelineSnapshot } from "../sim/pipeline";
import { PipelineCPU } from "../top/pipeline_cpu";
import { formatHex } from "./format";
import { MemoryPanel } from "./MemoryPanel";
import { PipelineView, StageStrip } from "./PipelineView";

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

const HISTORY_LIMIT = 256;

export function App()
{
    const initial = useMemo(() => new PipelineCPU(sampleProgram), []);
    const cpuRef = useRef(initial);
    const fileRef = useRef<HTMLInputElement>(null);
    const [program, setProgram] = useState(sampleProgram);
    const [loadedProgram, setLoadedProgram] = useState(sampleProgram);
    const [history, setHistory] = useState<PipelineSnapshot[]>(() => [initial.snapshot()]);
    const [cursor, setCursor] = useState<number>();
    const [selectedId, setSelectedId] = useState<number>();
    const [view, setView] = useState<"machine" | "pipeline">("machine");
    const [running, setRunning] = useState(false);
    const [speed, setSpeed] = useState(2);
    const [error, setError] = useState<string>();
    const headerRef = useRef<HTMLElement>(null);
    const latest = history.at(-1)!;
    const snapshot = history.find((entry) => entry.cycle === cursor) ?? latest;
    const dirty = program !== loadedProgram;
    const instructions = useMemo(() => decodeAssembly(loadedProgram), [loadedProgram]);
    const recorded = history.filter((entry) => entry.cycle <= snapshot.cycle);
    const focusId = selectedId ?? recorded.flatMap((entry) => entry.pipeline).find((entry) => entry.token)?.token?.instanceId;
    const occurrences = new Map<string, number>();
    for (const entry of recorded)
    {
        for (const current of entry.pipeline)
        {
            if (current.token?.instruction) occurrences.set(current.token.instruction.id, current.token.instanceId);
        }
    }

    useEffect(() =>
    {
        headerRef.current?.scrollIntoView?.({ block: "start" });
    }, [view]);

    useEffect(() =>
    {
        if (!running || dirty || latest.halted) return;
        const timer = window.setInterval(() =>
        {
            const next = cpuRef.current.step();
            setHistory((previous) => [...previous, next].slice(-HISTORY_LIMIT));
            if (next.halted) setRunning(false);
        }, 1000 / speed);
        return () => window.clearInterval(timer);
    }, [running, dirty, latest.halted, speed]);

    function loadProgram(source = program): void
    {
        setRunning(false);
        try
        {
            const cpu = new PipelineCPU(source);
            cpuRef.current = cpu;
            setProgram(source);
            setLoadedProgram(source);
            setHistory([cpu.snapshot()]);
            setCursor(undefined);
            setSelectedId(undefined);
            setError(undefined);
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }

    function step(): void
    {
        setRunning(false);
        setCursor(undefined);
        const next = cpuRef.current.step();
        setHistory((previous) => [...previous, next].slice(-HISTORY_LIMIT));
    }

    function inspectCycle(cycle: number): void
    {
        setRunning(false);
        setCursor(cycle);
    }

    function inspectInstruction(id: number): void
    {
        setSelectedId(id);
        setView("pipeline");
    }

    const status = snapshot.fault ? "Fault" : snapshot.halted ? "Halted" : running ? "Running" : snapshot.cycle ? "Paused" : "Ready";
    const previous = history.find((entry) => entry.cycle === snapshot.cycle - 1);

    return (
        <main className="shell">
            <header className="app-header" ref={headerRef}>
                <div className="brand"><Cpu size={27} /><div><h1>System Visualizer</h1><span>AArch64 / five-stage CPU</span></div></div>
                <nav className="view-tabs" aria-label="Workspace view">
                    <button type="button" aria-current={view === "machine" ? "page" : undefined} onClick={() => setView("machine")}><Monitor size={16} /> Machine</button>
                    <button type="button" aria-current={view === "pipeline" ? "page" : undefined} onClick={() => setView("pipeline")}><Layers size={16} /> Pipeline</button>
                </nav>
                <span className={`status-label ${snapshot.fault ? "text-danger" : ""}`}><span className={running ? "status-dot running" : "status-dot"} />{status}</span>
            </header>
            <div className="clock-deck">
            <section className="transport" aria-label="Clock controls">
                <div className="controls">
                    <button type="button" className="icon-button" title="Reset and load program" aria-label="Reset and load program" onClick={() => loadProgram()}><RotateCcw size={18} /></button>
                    <button type="button" className="icon-button" title="Step one clock cycle" aria-label="Step one clock cycle" onClick={step} disabled={dirty || latest.halted}><StepForward size={19} /></button>
                    <button type="button" className="run-button" onClick={() => { setCursor(undefined); setRunning(!running); }} disabled={dirty || latest.halted}>
                        {running ? <Pause size={16} /> : <Play size={16} />}{running ? "Pause" : "Run"}
                    </button>
                    <label className="speed-control"><span>Clock</span><input aria-label="Clock speed" type="range" min="1" max="16" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /><output>{speed} Hz</output></label>
                </div>
                <div className="clock-stats"><span>Cycle <b>{snapshot.cycle}</b></span><span>Retired <b>{snapshot.retired}</b></span></div>
            </section>
            <section className="history-bar" aria-label="Cycle history">
                <button type="button" className="icon-button small" title="Previous recorded cycle" aria-label="Previous recorded cycle" disabled={snapshot.cycle <= history[0].cycle} onClick={() => inspectCycle(snapshot.cycle - 1)}><ChevronLeft size={16} /></button>
                <input aria-label="Recorded cycle" type="range" min={history[0].cycle} max={latest.cycle || 1} value={snapshot.cycle} disabled={!latest.cycle} onChange={(event) => inspectCycle(Number(event.target.value))} />
                <button type="button" className="icon-button small" title="Next recorded cycle" aria-label="Next recorded cycle" disabled={snapshot.cycle >= latest.cycle} onClick={() => inspectCycle(snapshot.cycle + 1)}><ChevronRight size={16} /></button>
                <span className="history-position">{snapshot.cycle} / {latest.cycle}</span>
                <button type="button" className="live-button" aria-pressed={cursor === undefined} onClick={() => setCursor(undefined)} title="Return to latest cycle"><FastForward size={14} /> Live</button>
            </section>
            </div>
            {(error || snapshot.fault) && <div className="fault-banner" role="alert"><AlertCircle size={18} /><span>{error ?? snapshot.fault}</span></div>}
            {view === "pipeline" ? <PipelineView snapshot={snapshot} history={history} selectedId={focusId} onSelect={setSelectedId} onCycle={inspectCycle} /> : <>
                <section className="machine-overview">
                    <div className="program-pane">
                        <div className="section-heading"><h2>Assembly program</h2><div className="controls">
                            <input type="file" ref={fileRef} accept=".s,.asm,.txt" className="hidden-input" aria-label="Assembly file" onChange={async (event) =>
                            {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (!file) return;
                                setRunning(false);
                                try
                                {
                                    if (file.size > 1024 * 1024) throw new Error("Assembly file exceeds 1 MiB.");
                                    const source = await file.text();
                                    setProgram(source);
                                    loadProgram(source);
                                }
                                catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
                            }} />
                            <button type="button" className="icon-button small" title="Open assembly file" aria-label="Open assembly file" onClick={() => fileRef.current?.click()}><Upload size={16} /></button>
                            <button type="button" className="icon-button small" title="Load program" aria-label="Load program" onClick={() => loadProgram()}><FileCheck2 size={17} /></button>
                        </div></div>
                        <textarea aria-label="Assembly program" spellCheck={false} value={program} onChange={(event) => { setRunning(false); setProgram(event.target.value); setError(undefined); }} />
                        <div className="editor-meta"><span>{instructions.length} loaded instructions</span><span>{dirty ? "Unloaded changes" : "Loaded"}</span></div>
                        <div className="program-lines" aria-label="Program listing">
                            {instructions.map((instruction) =>
                            {
                                const active = snapshot.pipeline.filter((entry) => entry.valid && entry.token?.instruction?.id === instruction.id);
                                const occurrence = active[0]?.token?.instanceId ?? occurrences.get(instruction.id);
                                return <button type="button" key={instruction.id} disabled={occurrence === undefined} className={active.length ? "active-line" : ""}
                                    onClick={() => occurrence !== undefined && inspectInstruction(occurrence)} title={occurrence !== undefined ? `Inspect instance #${occurrence}` : "Not fetched yet"}>
                                    <span>{formatHex(instruction.address, 4)}</span><code>{instruction.sourceText}</code><span className="line-stages">{active.map((entry) => entry.name).join(" ")}</span>
                                </button>;
                            })}
                        </div>
                    </div>
                    <div className="machine-state">
                        <div className="state-summary">
                            <div><span>Architectural PC</span><code>{formatHex(snapshot.pc, 4)}</code></div>
                            <div><span>Fetch PC</span><code>{formatHex(snapshot.fetchPc, 4)}</code></div>
                            <div><span>Stack pointer</span><code>{formatHex(snapshot.sp, 4)}</code></div>
                            <div className="flags"><span>PSTATE</span><div>{(["negative", "zero", "carry", "overflow"] as const).map((key, i) => <span className={snapshot.pstate[key] ? "flag set" : "flag"} key={key}>{"NZCV"[i]} <b>{Number(snapshot.pstate[key])}</b></span>)}</div></div>
                        </div>
                        <div className="section-heading"><h2>Registers</h2><span className="muted">X0-X30 / 64-bit</span></div>
                        <div className="register-grid">{snapshot.registers.map((value, index) => <div className={previous && previous.registers[index] !== value ? "changed" : ""} key={index}><span>X{index}</span><code>{formatHex(value)}</code></div>)}</div>
                        <div className="zero-register"><span>XZR</span><code>{formatHex(0n)}</code><span>Read-only zero</span></div>
                    </div>
                </section>
                <section className="pipeline-preview"><div className="section-heading"><h2>Pipeline activity</h2><button type="button" onClick={() => setView("pipeline")}><Layers size={15} /> Open pipeline</button></div><StageStrip snapshot={snapshot} selectedId={focusId} onSelect={inspectInstruction} /></section>
                <MemoryPanel snapshot={snapshot} />
            </>}
            <section className="events-section"><div className="section-heading"><h2>Cycle events</h2><span className="muted">Cycle {snapshot.cycle}</span></div>
                <div className="event-list">{snapshot.events.length ? snapshot.events.map((event, index) => <div key={index} className={`event-${event.kind}`}><span>{event.kind}</span>{event.instanceId !== undefined && <button type="button" onClick={() => inspectInstruction(event.instanceId!)} title={`Inspect instruction #${event.instanceId}`}>#{event.instanceId}</button>}<p>{event.message}</p></div>) : <p className="empty-state">No events this cycle</p>}</div>
            </section>
            <footer><span>AArch64 subset / idealized five-stage microarchitecture</span><span>64 KiB data RAM / {history.length} retained snapshots</span></footer>
        </main>
    );
}
