import { ArrowRight, Binary, CircleCheck, CircuitBoard, GitBranch, Layers, X } from "lucide-react";
import type { PipelineSnapshot, PipelineStage, PipelineToken } from "../sim/pipeline";
import { registerName } from "../pipe/operands";
import { formatHex } from "./format";

const stageLabels = { IF: "Instruction fetch", ID: "Decode / register read", EX: "Execute", MEM: "Memory access", WB: "Writeback" };
const latchNames = ["IF/ID", "ID/EX", "EX/MEM", "MEM/WB"] as const;

interface PipelineProps
{
    snapshot: PipelineSnapshot;
    history: PipelineSnapshot[];
    selectedId?: number;
    onSelect: (id: number) => void;
    onCycle: (cycle: number) => void;
}

export function StageStrip({ snapshot, selectedId, onSelect }: Pick<PipelineProps, "snapshot" | "selectedId" | "onSelect">)
{
    return (
        <div className="stage-scroll">
            <div className="stage-strip" aria-label="Five-stage pipeline">
                {snapshot.pipeline.map((entry, index) => (
                    <div className={`stage-column stage-${entry.name.toLowerCase()}`} key={entry.name}>
                        <button type="button"
                            className={`stage-unit ${entry.flushed ? "flushed" : ""} ${entry.stalled ? "stalled" : ""} ${entry.token?.instanceId === selectedId ? "selected" : ""}`}
                            onClick={() => entry.token && onSelect(entry.token.instanceId)}
                            disabled={!entry.token}
                            title={entry.note ?? entry.token?.instruction?.sourceText ?? "Pipeline bubble"}
                            aria-label={`${entry.name}: ${entry.token?.instruction?.sourceText ?? (entry.token?.fault ? "Fetch fault" : "Bubble")}`}
                            aria-pressed={!!entry.token && entry.token.instanceId === selectedId}>
                            <div className="stage-heading"><b>{entry.name}</b><span>{entry.flushed ? "FLUSH" : entry.stalled ? "STALL" : entry.valid ? "VALID" : "BUBBLE"}</span></div>
                            <span className="stage-caption">{stageLabels[entry.name]}</span>
                            <code className="stage-instruction">{entry.token?.instruction?.sourceText ?? (entry.token?.fault ? "Fetch fault" : "Empty")}</code>
                            <span className="stage-foot">{entry.token ? `#${entry.token.instanceId} / ${formatHex(entry.token.address, 4)}` : entry.note ?? "No instruction"}</span>
                        </button>
                        {index < 4 ? (
                            <div className="latch-label"><span>{latchNames[index]}</span><code>V={Number(snapshot.latches[latchNames[index]].valid)}</code><ArrowRight size={13} /></div>
                        ) : <div className="latch-label"><span>Retired</span><code>{snapshot.retired}</code><CircleCheck size={13} /></div>}
                    </div>
                ))}
            </div>
        </div>
    );
}

function DataRow({ label, value }: { label: string; value: string })
{
    return <div className="data-row"><span>{label}</span><code>{value}</code></div>;
}

function TokenDetails({ token }: { token: PipelineToken })
{
    const instruction = token.instruction;
    return (
        <div className="instruction-details">
            <section>
                <h3><Binary size={15} /> Operands &amp; forwarding</h3>
                {token.operands.length ? token.operands.map((operand) => (
                    <div className="operand-row" key={operand.slot}>
                        <div><b>{registerName(operand.register)}</b><span>{operand.slot === "base" ? "Address base" : operand.slot === "rd" ? "Previous Rd / store data" : operand.slot}</span></div>
                        <code>{formatHex(operand.value, operand.register.width / 4)}</code>
                        <span className={operand.producerId ? "forward-source" : "muted"}>{operand.source}{operand.producerId ? ` / #${operand.producerId}` : ""}</span>
                    </div>
                )) : <p className="empty-state">{instruction?.operands.some((operand) => operand.kind === "register" || operand.kind === "memory") ? "Operands pending decode" : "No register inputs"}</p>}
                {instruction?.immediate && <DataRow label="Immediate" value={`${instruction.immediate.value} / LSL ${instruction.immediate.shift ?? 0}`} />}
                {instruction?.shift && <DataRow label="Shifter" value={`${instruction.shift.shiftKind} #${instruction.shift.amount}`} />}
            </section>
            <section>
                <h3><CircuitBoard size={15} /> Datapath</h3>
                <DataRow label="ALU input A" value={token.aluA === undefined ? "Pending / unused" : formatHex(token.aluA)} />
                <DataRow label="ALU input B" value={token.aluB === undefined ? "Pending / unused" : formatHex(token.aluB)} />
                <DataRow label="Result" value={token.result === undefined ? "Pending / unused" : formatHex(token.result)} />
                <DataRow label="Destination" value={token.destination ? registerName(token.destination) : "None / pending EX"} />
                {token.flags && <DataRow label="NZCV result" value={`${+token.flags.negative}${+token.flags.zero}${+token.flags.carry}${+token.flags.overflow}`} />}
                {instruction?.memory && <>
                    <DataRow label="Address" value={token.memoryAddress === undefined ? "Pending EX" : formatHex(token.memoryAddress, 4)} />
                    <DataRow label="Access" value={`${instruction.opcode === "LDR" ? "Read" : "Write"} / ${instruction.memory.accessSize} bits / little-endian`} />
                    {token.storeValue !== undefined && <DataRow label="Store data" value={formatHex(token.storeValue)} />}
                </>}
                {instruction?.branch && <>
                    <DataRow label="Branch target" value={formatHex(instruction.branch.target, 4)} />
                    <DataRow label="Branch decision" value={token.branchTaken === undefined ? "Pending EX" : token.branchTaken ? "Taken" : "Not taken"} />
                </>}
                {token.fault && <p className="inline-fault">{token.fault}</p>}
            </section>
        </div>
    );
}

export function PipelineView({ snapshot, history, selectedId, onSelect, onCycle }: PipelineProps)
{
    const recorded = history.filter((entry) => entry.cycle <= snapshot.cycle);
    const journey = history.flatMap((entry) => entry.pipeline
        .filter((current) => selectedId !== undefined && current.token?.instanceId === selectedId)
        .map((current) => ({ cycle: entry.cycle, stage: current })));
    const latest = journey.filter((entry) => entry.cycle <= snapshot.cycle).at(-1)?.stage;
    const token = latest?.token;
    const windowEnd = Math.max(history.findIndex((entry) => entry.cycle === snapshot.cycle) + 1, 16);
    const cycles = history.slice(Math.max(0, windowEnd - 16), windowEnd);
    const instances = new Map<number, PipelineToken>();
    for (const entry of recorded)
    {
        for (const current of entry.pipeline)
        {
            if (current.token) instances.set(current.token.instanceId, current.token);
        }
    }
    const rows = Array.from(instances.values()).slice(-24);
    const status = latest?.flushed ? "Flushed" : latest?.token?.fault ? "Fault"
        : latest?.name === "WB" ? "Retired" : latest?.stalled ? "Stalled in ID" : latest ? `In ${latest.name}` : "Not fetched";

    return (
        <div className="pipeline-workspace">
            <section className="pipeline-overview">
                <div className="section-heading"><h2><Layers size={18} /> Pipeline</h2><span className="muted">Single issue / in order / branch resolution in EX</span></div>
                <StageStrip snapshot={snapshot} selectedId={selectedId} onSelect={onSelect} />
                <div className="pipeline-metrics">
                    <span>Fetch PC <code>{formatHex(snapshot.fetchPc, 4)}</code></span>
                    <span>Load-use stalls <b>{snapshot.stalls}</b></span>
                    <span>Flushed slots <b>{snapshot.flushed}</b></span>
                    <span>CPI <b>{snapshot.retired ? (snapshot.cycle / snapshot.retired).toFixed(2) : "--"}</b></span>
                </div>
            </section>
            <section className="instruction-focus" aria-label="Instruction inspector">
                <div className="section-heading"><h2><GitBranch size={18} /> Instruction focus</h2>
                    {token && <span className={`instruction-status ${latest?.flushed ? "text-danger" : ""}`}>#{token.instanceId} / {status}</span>}
                </div>
                {token ? <>
                    <div className="focus-title"><code>{token.instruction?.sourceText ?? "Instruction fetch fault"}</code><span>{formatHex(token.address, 4)}{token.instruction ? ` / ${token.instruction.width}-bit / ${token.instruction.format}` : ""}</span></div>
                    <div className="journey" aria-label="Selected instruction journey">
                        {journey.map(({ cycle, stage: current }) => (
                            <button type="button" key={`${cycle}-${current.name}`}
                                title={current.note ?? `${stageLabels[current.name]} at cycle ${cycle}`}
                                className={`journey-stop stage-${current.name.toLowerCase()} ${current.flushed ? "flushed" : ""} ${current.stalled ? "stalled" : ""}`}
                                aria-current={cycle === snapshot.cycle ? "step" : undefined}
                                onClick={() => onCycle(cycle)} aria-label={`Inspect cycle ${cycle}, ${current.name}`}>
                                <span>C{cycle}</span><b>{current.name}</b><span>{current.flushed ? "Flushed" : current.stalled ? "Stalled" : current.name === "WB" ? (token.fault ? "Fault" : "Retired") : "Valid"}</span>
                            </button>
                        ))}
                    </div>
                    {latest?.flushed && <p className="flush-note"><X size={15} /> {latest.note}. This instruction did not retire.</p>}
                    <TokenDetails token={token} />
                </> : <p className="empty-state">{selectedId ? `Instruction #${selectedId} is outside this cycle's retained history.` : "No fetched instruction"}</p>}
            </section>
            <section className="timeline-section">
                <div className="section-heading"><h2>Cycle timeline</h2><span className="muted">Recorded cycles {cycles[0]?.cycle ?? 0}-{cycles.at(-1)?.cycle ?? 0} / latest 24 instances</span></div>
                <div className="timeline-scroll">
                    <table className="timeline-table">
                        <thead><tr><th>Instruction instance</th>{cycles.map((entry) => <th key={entry.cycle}><button type="button" onClick={() => onCycle(entry.cycle)} title={`Inspect cycle ${entry.cycle}`}>{entry.cycle}</button></th>)}</tr></thead>
                        <tbody>{rows.map((instance) => (
                            <tr key={instance.instanceId} className={instance.instanceId === selectedId ? "selected-row" : ""}>
                                <th><button type="button" onClick={() => onSelect(instance.instanceId)} title={`Inspect instruction #${instance.instanceId}`}><span>#{instance.instanceId}</span><code>{instance.instruction?.sourceText ?? "Fetch fault"}</code></button></th>
                                {cycles.map((entry) =>
                                {
                                    const current = entry.pipeline.find((item) => item.token?.instanceId === instance.instanceId);
                                    return <td key={entry.cycle} className={entry.cycle === snapshot.cycle ? "current-cycle" : ""}>{current && <TimelineCell current={current} cycle={entry.cycle} onClick={() => { onSelect(instance.instanceId); onCycle(entry.cycle); }} />}</td>;
                                })}
                            </tr>
                        ))}</tbody>
                    </table>
                    {!rows.length && <p className="empty-state">No cycles recorded</p>}
                </div>
            </section>
            <section className="latch-section">
                <div className="section-heading"><h2>Pipeline registers</h2><span className="muted">Latched at the end of cycle {snapshot.cycle}</span></div>
                <div className="latch-grid">{latchNames.map((name) =>
                {
                    const current = snapshot.latches[name];
                    return <div className="latch-detail" key={name}>
                        <h3>{name}<span>V={Number(current.valid)}</span></h3>
                        <DataRow label="Instance" value={current.token ? `#${current.token.instanceId}` : "Bubble"} />
                        <DataRow label="PC" value={current.token ? formatHex(current.token.address, 4) : "--"} />
                        <DataRow label="Result" value={current.token?.result === undefined ? "--" : formatHex(current.token.result)} />
                        <DataRow label="Mem address" value={current.token?.memoryAddress === undefined ? "--" : formatHex(current.token.memoryAddress, 4)} />
                    </div>;
                })}</div>
            </section>
        </div>
    );
}

function TimelineCell({ current, cycle, onClick }: { current: PipelineStage; cycle: number; onClick: () => void })
{
    return <button type="button" onClick={onClick}
        className={`timeline-cell stage-${current.name.toLowerCase()} ${current.flushed ? "flushed" : ""} ${current.stalled ? "stalled" : ""}`}
        title={`#${current.token!.instanceId} / cycle ${cycle} / ${current.name}${current.flushed ? " / flushed" : current.stalled ? " / stalled" : ""}`}>
        {current.flushed ? <X size={13} /> : current.name}{current.stalled ? "*" : ""}
    </button>;
}
