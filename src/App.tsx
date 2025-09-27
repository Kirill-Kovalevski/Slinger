import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import "./styles.scss";

/* ---------- Types ---------- */
type GameMode = "P1vCPU" | "P1vP2";
type Phase = "present" | "countdown" | "drop" | "land" | "glow" | "replay" | "result";
type Shooter = "P1" | "P2" | "CPU";
type GunKind = "revolver" | "pistol" | "smg" | "shotgun";
interface Scores { p1:number; p2:number }
interface Times { p1?:number; p2?:number }
interface Pt { x:number; y:number }

/* ---------- Config ---------- */
const GUNS = ["revolver","pistol","smg","shotgun"] as const;

// 40 feather durations (s)
const FEATHER = [
  0.72,0.78,0.82,0.86,0.90,0.95,1.00,1.06,1.10,1.15,
  1.20,1.24,1.28,1.32,1.36,1.40,1.45,1.48,1.52,1.56,
  1.60,1.64,1.68,1.72,1.76,1.80,1.86,1.90,1.96,2.00,
  2.04,2.08,2.12,2.16,2.20,2.24,2.28,2.32,2.36,2.40
];

const rr = (a:number,b:number)=>Math.random()*(b-a)+a;
const normal = (m:number,s:number)=>{const u=1-Math.random(),v=1-Math.random();return m+Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*s;};

const TIE_MS = 3;           // ≤3 ms counts as draw
const REPLAY_GRACE = 900;   // wait up to this long for second shot before replay
const REPLAY_LEN   = 1700;

/* ====================================================================== */

export default function App(){
  const [mode, setMode] = useState<GameMode>("P1vCPU");
  const [phase, setPhase] = useState<Phase>("present");
  const [scores, setScores] = useState<Scores>({ p1:0, p2:0 });
  const [level, setLevel] = useState(1);
  const [roundId, setRoundId] = useState(1);

  const [p1Name, setP1Name] = useState("You");
  const [p2Name, setP2Name] = useState("CPU");

  const [countdown, setCountdown] = useState(3);
  const [fallDur, setFallDur] = useState(1.35);
  const [fadeDur, setFadeDur] = useState(0.35);

  const [times, setTimes] = useState<Times>({});
  const [glowAt, setGlowAt] = useState<number | null>(null);
  const [shot, setShot] = useState<{shooter:Shooter; id:number} | null>(null);

  // users can tap early → fires at 0ms when glow starts
  const preTapL = useRef(false);
  const preTapR = useRef(false);

  // timers
  const todos = useRef<number[]>([]);
  const cpuTO  = useRef<number | null>(null);
  const safeTO = useRef<number | null>(null);
  const replayTO = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("present"); useEffect(()=>{ phaseRef.current = phase; },[phase]);
  const cpuFired = useRef(false);

  // layout measurement
  const arenaRef   = useRef<HTMLDivElement|null>(null);
  const ringRef    = useRef<HTMLDivElement|null>(null);
  const muzzleLRef = useRef<HTMLDivElement|null>(null);
  const muzzleRRef = useRef<HTMLDivElement|null>(null);
  const [mL,setML] = useState<Pt|null>(null);
  const [mR,setMR] = useState<Pt|null>(null);

  const clearTimers = useCallback(()=>{
    todos.current.forEach(t=>clearTimeout(t));
    todos.current=[];
    if (cpuTO.current){ clearTimeout(cpuTO.current); cpuTO.current=null; }
    if (safeTO.current){ clearTimeout(safeTO.current); safeTO.current=null; }
    if (replayTO.current){ clearTimeout(replayTO.current); replayTO.current=null; }
  },[]);

  const measureMuzzles = useCallback(()=>{
    const arena = arenaRef.current?.getBoundingClientRect();
    const L = muzzleLRef.current?.getBoundingClientRect();
    const R = muzzleRRef.current?.getBoundingClientRect();
    if (!arena || !L || !R) return;
    setML({ x: L.left - arena.left + L.width/2, y: L.top - arena.top + L.height/2 });
    setMR({ x: R.left - arena.left + R.width/2, y: R.top - arena.top + R.height/2 });
  },[]);
  useLayoutEffect(()=>{ measureMuzzles(); },[measureMuzzles, level, roundId]);
  useEffect(()=>{
    const onR=()=>measureMuzzles(); window.addEventListener("resize", onR);
    const raf=requestAnimationFrame(measureMuzzles);
    return ()=>{ window.removeEventListener("resize", onR); cancelAnimationFrame(raf); };
  },[measureMuzzles]);

  const startRound = useCallback(()=>{
    clearTimers();
    setTimes({}); setShot(null); setGlowAt(null); cpuFired.current=false;
    preTapL.current=false; preTapR.current=false;
    setFallDur(FEATHER[Math.floor(Math.random()*FEATHER.length)]);
    setFadeDur(rr(0.25,0.45));
    setCountdown(3);
    setPhase("present");
    setRoundId(id=>id+1);
    todos.current.push(window.setTimeout(()=>setPhase("countdown"), 650));
  },[clearTimers]);

  const resetMatch = useCallback(()=>{ setScores({p1:0,p2:0}); setLevel(1); startRound(); },[startRound]);

  /* countdown → drop → land → glow (armed) */
  useEffect(()=>{
    if (phase!=="countdown") return;
    let c=3; setCountdown(c);
    const iv=window.setInterval(()=>{
      c-=1; setCountdown(c);
      if (c<=0){
        clearInterval(iv);
        setPhase("drop");
        todos.current.push(window.setTimeout(()=>{
          setPhase("land");
          todos.current.push(window.setTimeout(()=>{
            setPhase("glow");
            const g = performance.now();
            setGlowAt(g);

            // pre-armed go off at 0ms
            if (preTapL.current) fire("P1", 0);
            if (mode==="P1vP2" && preTapR.current) fire("P2", 0);

            // CPU reaction: 160–420ms after glow
            if (mode==="P1vCPU"){
              const cpuMs = Math.max(160, Math.min(420, Math.round(normal(260,40))));
              cpuTO.current = window.setTimeout(()=>{
                if (phaseRef.current==="glow" && !cpuFired.current){ fire("CPU"); cpuFired.current=true; }
              }, cpuMs);

              // safety: ensure CPU registers BEFORE replay window closes
              safeTO.current = window.setTimeout(()=>{
                if (phaseRef.current==="glow" && !cpuFired.current){ fire("CPU", Math.min(420, cpuMs)); cpuFired.current=true; }
              }, Math.max(120, REPLAY_GRACE - 120));
            }
          }, fadeDur*1000));
        }, fallDur*1000));
      }
    },1000);
    return ()=>clearInterval(iv);
  },[phase, fallDur, fadeDur, mode]);

  const beginReplay = useCallback((t:Times)=>{
    if (phaseRef.current!=="glow") return;
    setPhase("replay");
    todos.current.push(window.setTimeout(()=>{
      const p1=t.p1, p2=t.p2;
      let addP1=0, addP2=0;
      if (p1!=null && p2!=null){
        const d=Math.abs(p1-p2);
        if (d>TIE_MS){ if (p1<p2) addP1=1; else addP2=1; }
      } else if (p1!=null || p2!=null){ if (p1!=null) addP1=1; else addP2=1; }
      setScores(s=>({p1:s.p1+addP1, p2:s.p2+addP2}));
      setPhase("result");
      todos.current.push(window.setTimeout(()=>{ setLevel(l=>l+1); startRound(); }, 950));
    }, REPLAY_LEN));
  },[startRound]);

  const fire = (who:Shooter, forced?:number)=>{
    setShot({ shooter: who, id: (Math.random()*1e9)|0 });
    if (glowAt==null) return;
    setTimes(prev=>{
      const now=performance.now();
      const t = forced!=null?forced:Math.max(0, Math.round(now - glowAt));
      const n={ ...prev } as Times;
      if (who==="P1") n.p1 ??= t; else n.p2 ??= t;

      if (n.p1!=null && n.p2!=null){
        if (replayTO.current){ clearTimeout(replayTO.current); replayTO.current=null; }
        todos.current.push(window.setTimeout(()=>beginReplay(n), 120));
      } else {
        if (!replayTO.current) replayTO.current = window.setTimeout(()=>beginReplay(n), REPLAY_GRACE);
      }
      return n;
    });
  };

  const onTap = (e:React.PointerEvent<HTMLDivElement>)=>{
    const rect=arenaRef.current?.getBoundingClientRect();
    const mid = rect ? rect.left + rect.width/2 : window.innerWidth/2;
    const left = e.clientX <= mid;
    if (phase==="glow"){ if (mode==="P1vCPU") fire("P1"); else fire(left?"P1":"P2"); return; }
    if (phase==="replay"||phase==="result") return;
    if (left) preTapL.current=true; else if (mode==="P1vP2") preTapR.current=true;
  };

  // space bar for desktop testing
  useEffect(()=>{
    const k=(ev:KeyboardEvent)=>{ if(ev.key===" "){ if(phase==="glow") fire("P1"); else preTapL.current=true; } };
    window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k);
  },[phase, glowAt]);

  useEffect(()=>{ startRound(); },[]);

  const isPvP = mode==="P1vP2";
  const gunL:GunKind = GUNS[(level-1)%GUNS.length];
  const gunR:GunKind = GUNS[level%GUNS.length];
  const blurred = phase==="glow"||phase==="replay"||phase==="result";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Slinger</div>
        <div className="toolbar">
          <div className="mode">
            <label><input type="radio" name="mode" checked={mode==="P1vCPU"} onChange={()=>{ setMode("P1vCPU"); setP2Name("CPU"); resetMatch(); }}/> Solo vs CPU</label>
            <label><input type="radio" name="mode" checked={mode==="P1vP2"} onChange={()=>{ setMode("P1vP2"); setP2Name("Player 2"); resetMatch(); }}/> 2 Players</label>
          </div>
          {isPvP && (
            <div className="names">
              <input className="name" value={p1Name} onChange={e=>setP1Name(e.target.value)} placeholder="Player 1"/>
              <span className="sep">vs</span>
              <input className="name" value={p2Name} onChange={e=>setP2Name(e.target.value)} placeholder="Player 2"/>
            </div>
          )}
          <button className="btn" onClick={resetMatch}>Reset</button>
        </div>
      </header>

      <main className="stage">
        <div ref={arenaRef} className={`arena ${isPvP?"pvp":""} ${blurred?"armed":""}`} onPointerDown={onTap}>
          <div className={`arena-content ${blurred?"is-blurred":""}`}>
            {isPvP && <div className="half left"><div className="pvpName">{p1Name}</div></div>}
            {isPvP && <div className="half right"><div className="pvpName">{p2Name}</div></div>}

            {/* fixed ring — above fighters */}
            <div ref={ringRef} className={`ring fixed ${phase==="drop"||phase==="land"?"pulse":""}`} />

            {/* elegant feather drop into ring */}
            <Feather key={roundId} phase={phase} ringRef={ringRef} />

            {/* fighters */}
            <Fighter
              side="left" primary gun={gunL}
              fired={shot?.shooter==="P1"}
              onMuzzleRef={(el)=>{ muzzleLRef.current=el; }}
            />
            <Fighter
              side="right" gun={gunR} mirror hue={(level*22)%360}
              fired={!!shot && shot.shooter!=="P1"}
              onMuzzleRef={(el)=>{ muzzleRRef.current=el; }}
            />

            {phase==="countdown" && <div className="countdown">WAIT… {countdown}</div>}
          </div>

          {phase==="glow" && (
            <div className="ready">
              <div className="burst"/><div className="halo"/><div className="call">DRAW!</div>
            </div>
          )}

          {phase==="replay" && mL && mR && (
            <Replay
              leftName={isPvP?p1Name:"You"} rightName={isPvP?p2Name:"CPU"}
              L={mL} R={mR} times={times}
            />
          )}

          {phase==="result" && <div className="result"><div className="banner">Next round…</div></div>}
        </div>
      </main>

      <footer className="scorebar">
        <div className="chip"><span className="label">{isPvP?p1Name:"You"}</span><span className="num">{scores.p1}</span></div>
        <div className="center"><div className="level">Level {level}</div><div className="fto">Endless</div></div>
        <div className="chip"><span className="label">{isPvP?p2Name:"CPU"}</span><span className="num">{scores.p2}</span></div>
      </footer>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

const Fighter: React.FC<{
  side:"left"|"right"; gun:GunKind; primary?:boolean; hue?:number; mirror?:boolean; fired?:boolean;
  onMuzzleRef?:(el:HTMLDivElement|null)=>void;
}> = ({ side, gun, primary=false, hue=0, mirror=false, fired=false, onMuzzleRef }) => (
  <div
    className={`fighter ${side} ${mirror?"mirror":""} gun-${gun} ${fired?"recoil":""}`}
    style={{ ["--tone" as any]: primary?"#a9d1ff":"#a6ff95", ["--hue" as any]: `${hue}deg` }}
  >
    <div className="stick">
      <div className="head"/><div className="neck"/><div className="torso"/>
      <div className="arm aL"/><div className="arm aR"/>
      <div className="forearm fL"/><div className="forearm fR"/>
      <div className="handL"/><div className="handR"/>
      <div className="leg lL"/><div className="leg lR"/>
      <div className="band" aria-hidden/>
    </div>

    {/* realistic pistol made of many parts */}
    <div className="gun">
      <div className="slide"/><div className="barrel"/><div className="muzzle-port"/>
      <div className="front-sight"/><div className="rear-sight"/>
      <div className="ejection"/><div className="frame"/><div className="trigger-guard"/>
      <div className="trigger"/><div className="grip"/><div className="backstrap"/><div className="mag"/>
      <div className="rail"/><div className="screws"/><div className="glint"/>
    </div>

    <div className="muzzle" ref={onMuzzleRef||null}/>
  </div>
);

const Feather: React.FC<{ phase:Phase; ringRef:React.RefObject<HTMLDivElement> }> = ({ phase, ringRef })=>{
  const ref = useRef<HTMLDivElement|null>(null);
  const [fallY, setFallY] = useState(0);
  const amp  = useMemo(()=>rr(10,18)*(Math.random()>.5?1:-1),[]);
  const rot1 = useMemo(()=>rr(-12,10),[]);
  const rot2 = useMemo(()=>rr(-6,14),[]);

  const measure = useCallback(()=>{
    const fe = ref.current?.getBoundingClientRect();
    const ri = ringRef.current?.getBoundingClientRect();
    if (!fe || !ri) return;
    const feC = fe.top + fe.height/2;
    const riC = ri.top + ri.height/2;
    setFallY(riC - feC);
  },[ringRef]);

  useLayoutEffect(()=>{ measure(); },[measure]);
  useEffect(()=>{ const r=()=>measure(); window.addEventListener("resize",r); return ()=>window.removeEventListener("resize",r); },[measure]);

  return (
    <div
      ref={ref}
      className={`feather ${phase==="drop"?"fall":""} ${phase==="land"?"fade":""}`}
      style={{
        ["--fallY" as any]: `${fallY}px`,
        ["--amp" as any]: `${amp}px`,
        ["--rot1" as any]: `${rot1}deg`,
        ["--rot2" as any]: `${rot2}deg`,
      }}
    >
      <div className="feather-inner">
        <svg viewBox="0 0 60 160" className="svg" aria-hidden>
          <defs>
            <linearGradient id="fg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.96"/>
              <stop offset="100%" stopColor="#cfe9ff" stopOpacity="0.86"/>
            </linearGradient>
          </defs>
          <path d="M30 10 C 10 40, 10 80, 28 130
                  C 30 140, 34 150, 30 155
                  C 24 148, 20 140, 18 130
                  C 10 85, 16 40, 30 10 Z"
                fill="url(#fg)" stroke="#9ec9ff" strokeWidth="2"/>
          <path d="M30 20 L28 135" stroke="#84b6ff" strokeWidth="2" />
          <path d="M22 50 L28 60 M20 70 L28 80 M22 90 L28 100 M24 110 L28 118"
                stroke="#84b6ff" strokeWidth="2"/>
        </svg>
      </div>
    </div>
  );
};

const Replay:React.FC<{ leftName:string; rightName:string; times:Times; L:Pt; R:Pt }>=
({ leftName,rightName,times,L,R })=>{
  const haveL = times.p1!=null, haveR = times.p2!=null;
  const delta = (haveL && haveR) ? Math.abs(times.p1!-times.p2!) : undefined;
  const draw  = delta!=null && delta<=TIE_MS;
  const lWin  = !draw && haveL && (!haveR || times.p1!<times.p2!);
  const rWin  = !draw && haveR && (!haveL || times.p2!<times.p1!);

  const dxL=R.x-L.x, dyL=R.y-L.y;
  const dxR=L.x-R.x, dyR=L.y-R.y;

  return (
    <div className="replay">
      <div className="overlay"/><div className="fx-chroma"/>
      {haveL && (
        <div className={`bullet from-left ${lWin?'winner':''}`}
             style={{ left:`${L.x}px`, top:`${L.y}px`, ["--flyX" as any]:`${dxL}px`, ["--flyY" as any]:`${dyL}px`, ["--delay" as any]:"100ms" }}/>
      )}
      {haveR && (
        <div className={`bullet from-right ${rWin?'winner':''}`}
             style={{ left:`${R.x}px`, top:`${R.y}px`, ["--flyX" as any]:`${dxR}px`, ["--flyY" as any]:`${dyR}px`, ["--delay" as any]:"140ms" }}/>
      )}
      {lWin && <div className="shockwave" style={{ left:`${L.x}px`, top:`${L.y}px` }}/>}
      {rWin && <div className="shockwave" style={{ left:`${R.x}px`, top:`${R.y}px` }}/>}
      {draw  && <div className="shockwave draw" style={{ left:`${(L.x+R.x)/2}px`, top:`${(L.y+R.y)/2}px` }}/>}

      <div className="times">
        <div>{leftName}: <b>{haveL?`${times.p1}ms`:"—"}</b></div>
        <div>{rightName}: <b>{haveR?`${times.p2}ms`:"—"}</b></div>
        <div className={`delta ${draw?"draw":""}`}>{draw?"DRAW!":(delta!=null?`Δ ${delta}ms`:"—")}</div>
      </div>
    </div>
  );
};
