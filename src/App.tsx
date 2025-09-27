import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./styles.scss";

/* ===== Types ===== */
type GameMode = "P1vCPU" | "P1vP2";
type Phase = "present" | "countdown" | "drop" | "land" | "glow" | "replay" | "result";
type GunKind = "revolver" | "pistol" | "smg" | "shotgun";
type Shooter = "P1" | "P2" | "CPU";

interface Scores { p1: number; p2: number }
interface Shot { shooter: Shooter; id: number }
interface RoundTimes { p1?: number; p2?: number }
interface Pt { x: number; y: number }

/* ===== Config ===== */
const GUNS = ["revolver", "pistol", "smg", "shotgun"] as const;

// 40 distinct feather durations (s)
const FEATHER_DURS = [
  0.72,0.78,0.82,0.86,0.90,0.95,1.00,1.06,1.10,1.15,
  1.20,1.24,1.28,1.32,1.36,1.40,1.45,1.48,1.52,1.56,
  1.60,1.64,1.68,1.72,1.76,1.80,1.86,1.90,1.96,2.00,
  2.04,2.08,2.12,2.16,2.20,2.24,2.28,2.32,2.36,2.40
];

const rr = (a:number,b:number)=>Math.random()*(b-a)+a;
const normal = (m:number,s:number)=>{const u=1-Math.random(),v=1-Math.random();return m+Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*s;};

const TIE_MS = 3;            // ≤3ms → draw
const REPLAY_GRACE = 800;    // grace after first shot to allow second
const REPLAY_LEN = 1700;     // slow-mo duration

export default function App(){
  const [mode, setMode] = useState<GameMode>("P1vCPU");
  const [phase, setPhase] = useState<Phase>("present");
  const [scores, setScores] = useState<Scores>({p1:0, p2:0});
  const [level, setLevel] = useState(1);
  const [roundId, setRoundId] = useState(1);

  const [p1Name, setP1Name] = useState("You");
  const [p2Name, setP2Name] = useState("CPU");

  const [countdown, setCountdown] = useState(3);
  const [targetX, setTargetX] = useState(50);
  const [fallDur, setFallDur] = useState(1.4);
  const [fadeDur, setFadeDur] = useState(0.35);

  const [shot, setShot] = useState<Shot|null>(null);
  const [times, setTimes] = useState<RoundTimes>({});
  const [glowAt, setGlowAt] = useState<number | null>(null);

  // pre-tap: tapping early arms a 0ms shot at glow
  const preTapL = useRef(false);
  const preTapR = useRef(false);

  const timeouts = useRef<number[]>([]);
  const cpuTO = useRef<number | null>(null);
  const replayTO = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("present"); useEffect(()=>{ phaseRef.current = phase; },[phase]);

  // layout / measurement
  const arenaRef = useRef<HTMLDivElement|null>(null);
  const ringRef = useRef<HTMLDivElement|null>(null);
  const muzzleLRef = useRef<HTMLDivElement|null>(null);
  const muzzleRRef = useRef<HTMLDivElement|null>(null);
  const [muzzleL, setMuzzleL] = useState<Pt|null>(null);
  const [muzzleR, setMuzzleR] = useState<Pt|null>(null);

  const clearTimers = useCallback(()=>{
    timeouts.current.forEach(t=>clearTimeout(t));
    timeouts.current = [];
    if (cpuTO.current){ clearTimeout(cpuTO.current); cpuTO.current=null; }
    if (replayTO.current){ clearTimeout(replayTO.current); replayTO.current=null; }
  },[]);

  const measureMuzzles = useCallback(()=>{
    const arena = arenaRef.current?.getBoundingClientRect();
    const L = muzzleLRef.current?.getBoundingClientRect();
    const R = muzzleRRef.current?.getBoundingClientRect();
    if (!arena || !L || !R) return;
    setMuzzleL({ x: L.left - arena.left + L.width/2, y: L.top - arena.top + L.height/2 });
    setMuzzleR({ x: R.left - arena.left + R.width/2, y: R.top - arena.top + R.height/2 });
  },[]);

  // measure once per round & on resize
  useLayoutEffect(()=>{ measureMuzzles(); }, [measureMuzzles, level, roundId]);
  useEffect(()=>{
    const onR = ()=>measureMuzzles();
    window.addEventListener("resize", onR);
    const raf = requestAnimationFrame(measureMuzzles);
    return ()=>{ window.removeEventListener("resize", onR); cancelAnimationFrame(raf); };
  },[measureMuzzles]);

  const startRound = useCallback(()=>{
    clearTimers();
    setShot(null); setTimes({}); setGlowAt(null);
    preTapL.current=false; preTapR.current=false;
    setTargetX(Math.round(rr(20,80)));
    setFallDur(FEATHER_DURS[Math.floor(Math.random()*FEATHER_DURS.length)]);
    setFadeDur(rr(0.25,0.45));
    setCountdown(3);
    setPhase("present");
    setRoundId(id=>id+1);
    timeouts.current.push(window.setTimeout(()=>setPhase("countdown"), 800));
  },[clearTimers]);

  const resetMatch = useCallback(()=>{ setScores({p1:0,p2:0}); setLevel(1); startRound(); },[startRound]);

  // countdown → drop → land → glow (armed)
  useEffect(()=>{
    if(phase!=="countdown") return;
    let c=3; setCountdown(c);
    const iv=window.setInterval(()=>{
      c-=1; setCountdown(c);
      if(c<=0){
        clearInterval(iv);
        setPhase("drop");
        timeouts.current.push(window.setTimeout(()=>{
          setPhase("land");
          timeouts.current.push(window.setTimeout(()=>{
            setPhase("glow");
            setGlowAt(performance.now());

            // prearmed shots (0ms)
            if (preTapL.current) registerFire("P1", 0);
            if (mode==="P1vP2" && preTapR.current) registerFire("P2", 0);

            // CPU reaction – guaranteed to occur before REPLAY_GRACE
            if (mode==="P1vCPU"){
              const cpuMs = Math.round(Math.max(180, Math.min(420, normal(280,40))));
              cpuTO.current = window.setTimeout(()=>{
                if (phaseRef.current==="glow") registerFire("CPU");
              }, cpuMs);
            }
          }, fadeDur*1000));
        }, fallDur*1000));
      }
    },1000);
    return ()=>clearInterval(iv);
  },[phase, fallDur, fadeDur, mode]);

  const beginReplay = useCallback((current:RoundTimes)=>{
    if (phaseRef.current!=="glow") return;
    setPhase("replay");
    timeouts.current.push(window.setTimeout(()=>{
      const {p1,p2} = current;
      let addP1=0, addP2=0;
      if (p1!=null && p2!=null){
        const d=Math.abs(p1-p2);
        if (d>TIE_MS){ if (p1<p2) addP1=1; else addP2=1; }
      }else if (p1!=null || p2!=null){
        if (p1!=null) addP1=1; else addP2=1;
      }
      setScores(s=>({p1:s.p1+addP1, p2:s.p2+addP2}));
      setPhase("result");
      timeouts.current.push(window.setTimeout(()=>{
        setLevel(l=>l+1);
        startRound();
      }, 950));
    }, REPLAY_LEN));
  },[startRound]);

  const registerFire = (who:Shooter, forcedMs?:number)=>{
    setShot({ shooter: who, id: (Math.random()*1e9)|0 });
    if (glowAt==null) return;

    setTimes(prev=>{
      const now = performance.now();
      const t = forcedMs!=null ? forcedMs : Math.max(0, Math.round(now - glowAt));
      const n:RoundTimes = { ...prev };
      if (who==="P1") n.p1 ??= t; else n.p2 ??= t;

      // both? start soon; one? wait grace
      if (n.p1!=null && n.p2!=null){
        if (replayTO.current){ clearTimeout(replayTO.current); replayTO.current=null; }
        timeouts.current.push(window.setTimeout(()=>beginReplay(n), 140));
      } else {
        if (!replayTO.current) replayTO.current = window.setTimeout(()=>beginReplay(n), REPLAY_GRACE);
      }
      return n;
    });
  };

  const onArenaPointerDown = (e:React.PointerEvent<HTMLDivElement>)=>{
    const rect = arenaRef.current?.getBoundingClientRect();
    const mid = rect ? rect.left + rect.width/2 : window.innerWidth/2;
    const left = e.clientX <= mid;
    if (phase==="glow"){
      if (mode==="P1vCPU") registerFire("P1"); else registerFire(left ? "P1" : "P2");
      return;
    }
    if (phase==="replay" || phase==="result") return;
    if (left) preTapL.current=true; else if (mode==="P1vP2") preTapR.current=true;
  };

  // desktop test
  useEffect(()=>{
    const k=(ev:KeyboardEvent)=>{ if(ev.key===" "){ if(phase==="glow") registerFire("P1"); else preTapL.current=true; } };
    window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k);
  },[phase, glowAt]);

  useEffect(()=>{ startRound(); },[]);

  const isPvP = mode==="P1vP2";
  const gunL:GunKind = GUNS[(level-1)%GUNS.length];
  const gunR:GunKind = GUNS[level%GUNS.length];
  const blurred = phase==="glow" || phase==="replay" || phase==="result";

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
        <div
          ref={arenaRef}
          className={`arena ${isPvP?"pvp":""} ${blurred?"armed":""}`}
          onPointerDown={onArenaPointerDown}
        >
          {/* blurred content */}
          <div
            className={`arena-content ${blurred?"is-blurred":""}`}
            style={{
              ["--target-x" as any]: `${targetX}%`,
              ["--fall" as any]: `${fallDur}s`,
              ["--fade" as any]: `${fadeDur}s`,
            }}
          >
            {isPvP && <div className="half left"><div className="pvpName">{p1Name}</div></div>}
            {isPvP && <div className="half right"><div className="pvpName">{p2Name}</div></div>}

            <div ref={ringRef} className={`ring ${phase==="drop"||phase==="land"?"pulse":""}`} />
            <Feather key={roundId} phase={phase} ringRef={ringRef} />

            <Fighter
              side="left"
              gun={gunL}
              primary
              fired={shot?.shooter==="P1"}
              onMuzzleRef={(el)=>{ muzzleLRef.current = el; }}
            />
            <Fighter
              side="right"
              gun={gunR}
              mirror
              hue={(level*24)%360}
              fired={!!shot && shot.shooter!=="P1"}
              onMuzzleRef={(el)=>{ muzzleRRef.current = el; }}
            />

            {phase==="countdown" && <div className="countdown">WAIT… {countdown}</div>}
          </div>

          {phase==="glow" && (
            <div className="ready">
              <div className="burst"/><div className="halo"/><div className="call">DRAW!</div>
            </div>
          )}

          {phase==="replay" && muzzleL && muzzleR && (
            <Replay
              leftName={isPvP?p1Name:"You"}
              rightName={isPvP?p2Name:"CPU"}
              times={times}
              L={muzzleL}
              R={muzzleR}
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

/* ===== Subcomponents ===== */

const Fighter: React.FC<{
  side:"left"|"right";
  gun:GunKind;
  primary?:boolean;
  hue?:number;
  mirror?:boolean;
  fired?:boolean;
  onMuzzleRef?:(el:HTMLDivElement|null)=>void;
}> = ({ side, gun, primary=false, hue=0, mirror=false, fired=false, onMuzzleRef }) => (
  <div
    className={`fighter ${side} ${mirror?"mirror":""} gun-${gun} ${fired?"recoil":""}`}
    style={{ ["--tone" as any]: primary?"#8ec5ff":"#a6ff95", ["--hue" as any]: `${hue}deg` }}
  >
    <div className="stick">
      <div className="head"/><div className="body"/>
      <div className="arm aL"/><div className="arm aR"/>
      <div className="leg lL"/><div className="leg lR"/>
      <div className="handL"/><div className="handR"/>
      <div className="band" aria-hidden/>
    </div>
    <div className="gun">
      <div className="barrel"/><div className="vent"/><div className="slide"/><div className="cyl"/>
      <div className="rail"/><div className="sight"/><div className="frame"/>
      <div className="grip"/><div className="texture"/><div className="guard"/><div className="trigger"/><div className="mag"/>
      <div className="stock"/>
    </div>
    <div className="muzzle" ref={onMuzzleRef||null}/>
  </div>
);

const Feather: React.FC<{ phase:Phase; ringRef:React.RefObject<HTMLDivElement> }> = ({ phase, ringRef }) => {
  const ref = useRef<HTMLDivElement|null>(null);
  const [fallY, setFallY] = useState(0);
  const amp = useMemo(()=>rr(8,16)*(Math.random()>.5?1:-1),[]);
  const rot1 = useMemo(()=>rr(-10,10),[]);
  const rot2 = useMemo(()=>rr(-6,12),[]);

  const measure = useCallback(()=>{
    const fe = ref.current?.getBoundingClientRect();
    const ri = ringRef.current?.getBoundingClientRect();
    if (!fe || !ri) return;
    const feC = fe.top + fe.height/2;
    const riC = ri.top + ri.height/2;
    setFallY(riC - feC);
  },[ringRef]);

  useLayoutEffect(()=>{ measure(); },[measure]);
  useEffect(()=>{
    const r=()=>measure();
    window.addEventListener("resize",r);
    return ()=>window.removeEventListener("resize",r);
  },[measure]);

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
              <stop offset="0%" stopColor="white" stopOpacity="0.95"/>
              <stop offset="100%" stopColor="#cfe9ff" stopOpacity="0.85"/>
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

const Replay: React.FC<{ leftName:string; rightName:string; times:RoundTimes; L:Pt; R:Pt; }> =
({ leftName, rightName, times, L, R })=>{
  const haveL = times.p1!=null; const haveR = times.p2!=null;
  const delta = (haveL && haveR) ? Math.abs(times.p1! - times.p2!) : undefined;
  const draw  = delta!=null && delta<=TIE_MS;
  const lWin  = !draw && haveL && (!haveR || times.p1! < times.p2!);
  const rWin  = !draw && haveR && (!haveL || times.p2! < times.p1!);

  const dxL = R.x - L.x, dyL = R.y - L.y;
  const dxR = L.x - R.x, dyR = L.y - R.y;

  return (
    <div className="replay">
      <div className="overlay"/>
      {/* cinematic chromatic aberration strips */}
      <div className="fx-chroma"/>
      {haveL && (
        <div className={`bullet from-left ${lWin?'winner':''}`}
             style={{ left:`${L.x}px`, top:`${L.y}px`, ["--flyX" as any]:`${dxL}px`, ["--flyY" as any]:`${dyL}px`, ["--delay" as any]:"110ms" }}/>
      )}
      {haveR && (
        <div className={`bullet from-right ${rWin?'winner':''}`}
             style={{ left:`${R.x}px`, top:`${R.y}px`, ["--flyX" as any]:`${dxR}px`, ["--flyY" as any]:`${dyR}px`, ["--delay" as any]:"150ms" }}/>
      )}

      {/* winner shockwave */}
      {lWin && <div className="shockwave" style={{ left:`${L.x}px`, top:`${L.y}px` }}/>}
      {rWin && <div className="shockwave" style={{ left:`${R.x}px`, top:`${R.y}px` }}/>}
      {draw  && <div className="shockwave draw" style={{ left:`${(L.x+R.x)/2}px`, top:`${(L.y+R.y)/2}px` }}/>}

      <div className="times">
        <div>{leftName}: <b>{haveL? `${times.p1}ms` : "—"}</b></div>
        <div>{rightName}: <b>{haveR? `${times.p2}ms` : "—"}</b></div>
        <div className={`delta ${draw?"draw":""}`}>{draw? "DRAW!" : (delta!=null? `Δ ${delta}ms` : "—")}</div>
      </div>
    </div>
  );
};
