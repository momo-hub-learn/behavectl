import {AbsoluteFill, Composition, Interactive, interpolate, useCurrentFrame} from "remotion";
import {evidence} from "./evidence";

const EvidenceReplay = () => {
  const frame = useCurrentFrame();
  const corrected = frame >= 360;
  const summary = frame >= 660;
  return <AbsoluteFill style={{background: "#080e1c", color: "#f4f7ff", fontFamily: "Arial, sans-serif", padding: 100}}>
    <Interactive.Div name="Evidence label" style={{fontSize: 30, letterSpacing: 5, color: "#86dfed"}}>BEHAVECTL / RETAINED EVIDENCE REPLAY</Interactive.Div>
    <Interactive.Div name="Main message" style={{fontSize: 116, fontWeight: 750, marginTop: 48, opacity: interpolate(frame, [0, 24], [0, 1], {extrapolateRight: "clamp"})}}>
      {summary ? "Prove the correction." : corrected ? "Fix the source." : "Looks fixed. Still broken."}
    </Interactive.Div>
    <Interactive.Div name="Context" style={{fontSize: 42, color: "#b7c4db", marginTop: 24}}>
      {summary ? "Three paired Codex trials. Two improved. One already passed." : corrected ? "The rule: edit the canonical source, then regenerate." : 'Task: change the display name from "Alpha" to "Beta".'}
    </Interactive.Div>
    {!summary ? <div style={{display: "flex", gap: 36, marginTop: 58}}>
      <div style={{flex: 1, border: "2px solid #3a526d", background: "#101f32", borderRadius: 24, padding: 38}}>
        <div style={{fontSize: 28, color: "#94adc9", marginBottom: 30}}>CANONICAL SOURCE</div>
        <div style={{fontFamily: "monospace", fontSize: 28}}>config/app-config.source.json</div>
        <div style={{fontFamily: "monospace", fontSize: 48, marginTop: 40, color: corrected ? "#8cf0cc" : "#ffa8b5"}}>{corrected ? '"displayName": "Beta"' : '"displayName": "Alpha"'}</div>
        <div style={{fontSize: 38, marginTop: 40, color: corrected ? "#8cf0cc" : "#ffa8b5"}}>{corrected ? "Source updated" : "Source left unchanged"}</div>
      </div>
      <div style={{flex: 1, border: "2px solid #387368", background: "#112a2b", borderRadius: 24, padding: 38}}>
        <div style={{fontSize: 28, color: "#94cabb", marginBottom: 30}}>GENERATED OUTPUT</div>
        <div style={{fontFamily: "monospace", fontSize: 28}}>dist/app-config.json</div>
        <div style={{fontFamily: "monospace", fontSize: 48, marginTop: 40, color: "#8cf0cc"}}>{'"displayName": "Beta"'}</div>
        <div style={{fontSize: 38, marginTop: 40, color: "#8cf0cc"}}>{corrected ? "Regenerated from source" : "Only this file changed"}</div>
      </div>
    </div> : <div style={{display: "flex", alignItems: "center", gap: 72, marginTop: 60}}>
      <div><div style={{fontSize: 32, color: "#b7c4db"}}>WITHOUT RULE</div><div style={{fontSize: 180, fontWeight: 750, color: "#ffa8b5"}}>{evidence.scores.baseline}/3</div></div>
      <div style={{fontSize: 100, color: "#607c9a"}}>→</div>
      <div><div style={{fontSize: 32, color: "#b7c4db"}}>WITH RULE</div><div style={{fontSize: 180, fontWeight: 750, color: "#8cf0cc"}}>{evidence.scores.candidate}/3</div></div>
      <div style={{fontSize: 42, marginLeft: 60, lineHeight: 1.7}}>6 real tasks<br/>13 RC checks passed<br/><span style={{color: "#8cf0cc"}}>RC GO</span></div>
    </div>}
    <Interactive.Div name="Observed outcome" style={{marginTop: 38, fontSize: 38, color: corrected ? "#8cf0cc" : "#ffa8b5", opacity: interpolate(frame, [120, 150], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}}>
      {summary ? "Inspect the proof before promoting the rule." : corrected ? "Observed: node scripts/generate-config.mjs · all 4 checks PASS" : "Independent check: generated config is stale"}
    </Interactive.Div>
    <div style={{position: "absolute", bottom: 64, left: 100, right: 100, fontSize: 27, color: "#91a4bd"}}>Recorded evidence · 2026-09-16 · Codex · one challenge · not a live screen recording</div>
    <div style={{position: "absolute", bottom: 0, left: 0, height: 7, background: "#86dfed", width: interpolate(frame, [0, 899], [0, 1920])}}/>
  </AbsoluteFill>;
};

export const MyComposition = () => <Composition id="EvidenceReplay" component={EvidenceReplay} durationInFrames={900} fps={30} width={1920} height={1080}/>;
