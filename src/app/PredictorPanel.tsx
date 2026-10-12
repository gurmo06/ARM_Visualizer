import { ArrowRight, GitBranch } from "lucide-react";
import type { PipelineSnapshot } from "../sim/pipeline";
import type { DirectionCounter } from "../sim/prediction";
import { formatHex, formatPredictionBits, formatPredictionState, predictionStateLabels } from "./format";

type PredictorState = Pick<PipelineSnapshot, "cycle" | "predictor">;

export function PredictorPanel({ snapshot, previous }: { snapshot: PredictorState; previous?: PredictorState })
{
    const predictor = snapshot.predictor;
    const enabled = predictor.mode !== "not-taken";
    const stateLabels = predictor.mode === "one-bit" || predictor.mode === "two-bit" ? predictionStateLabels[predictor.mode] : undefined;
    const previousEntries = previous?.cycle === snapshot.cycle - 1 && previous.predictor.mode === predictor.mode
        ? previous.predictor.entries : undefined;
    return <section id="branch-predictor" className="predictor-section" aria-label="Branch predictor">
        <div className="section-heading"><h2><GitBranch size={18} /> Branch predictor</h2>
            <span className="muted">End of cycle {snapshot.cycle} / {enabled ? `${predictor.entries.length} / ${predictor.capacity} BTB entries` : "Always not taken"}</span>
        </div>
        <div className="pipeline-metrics predictor-metrics">
            <span>Resolved branches <b>{predictor.resolved}</b></span>
            <span>Mispredictions <b>{predictor.mispredictions}</b></span>
            <span title="Correct next-PC predictions / branches resolved in EX">Next-PC accuracy <b>{predictor.resolved ? `${(100 * predictor.correct / predictor.resolved).toFixed(1)}%` : "--"}</b></span>
            {enabled && <>
                <span title="At-fetch BTB hits for branches that reached EX">BTB hits <b>{predictor.btbHits}</b></span>
                <span title="At-fetch BTB misses for branches that reached EX">BTB misses <b>{predictor.btbMisses}</b></span>
            </>}
        </div>
        {stateLabels && <ul className="prediction-legend" aria-label={`${predictor.mode === "one-bit" ? "1-bit" : "2-bit"} state encoding`}>
            {stateLabels.map((label, counter) => <li key={counter}>
                <code>{formatPredictionBits(predictor.mode, counter as DirectionCounter)}</code><span>{label}</span>
            </li>)}
        </ul>}
        {enabled && <div className="predictor-scroll" tabIndex={0} role="region" aria-label="Branch target buffer entries">
            <table className="predictor-table" aria-label="Branch target buffer">
                <thead><tr><th>Branch PC</th><th>Bits</th><th>Direction state</th><th>Change</th><th>Index</th><th>Target</th><th>Type</th></tr></thead>
                <tbody>{predictor.entries.map((entry) =>
                {
                    const old = previousEntries?.find((item) => item.pc === entry.pc && item.index === entry.index);
                    const changed = stateLabels !== undefined && entry.counter !== undefined && previousEntries !== undefined && old?.counter !== entry.counter;
                    const pc = formatHex(entry.pc, 4);
                    const bits = formatPredictionBits(predictor.mode, entry.counter);
                    return <tr key={entry.index} aria-label={`Branch ${pc}`} className={changed ? "predictor-changed" : undefined}>
                        <td><code>{pc}</code></td><td className="predictor-bits"><code>{bits}</code></td>
                        <td>{entry.conditional ? formatPredictionState(predictor.mode, entry.counter) : "Always taken"}</td>
                        <td>{changed ? old?.counter === undefined ? <span className="predictor-allocation">Allocated</span>
                            : <span className="predictor-change" aria-label={`${formatPredictionBits(predictor.mode, old.counter)} to ${bits}`}>
                                <code>{formatPredictionBits(predictor.mode, old.counter)}</code><ArrowRight size={13} aria-hidden="true" /><code>{bits}</code>
                            </span> : "--"}</td>
                        <td>{entry.index}</td><td><code>{formatHex(entry.target, 4)}</code></td>
                        <td>{entry.conditional ? "Conditional" : "Unconditional"}</td>
                    </tr>;
                })}</tbody>
            </table>
            {!predictor.entries.length && <p className="empty-state">No trained entries</p>}
        </div>}
    </section>;
}
