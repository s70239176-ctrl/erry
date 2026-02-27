import { useState, useEffect, useRef, useCallback } from "react";

const CONFIG = {
  rpcUrl: "https://testnet.opnet.org",
  contractAddress: "tb1p8vqqjuw4xnrpz9ym89zqm3gy4lhk2nqzk5d8f3t7r6p2c",
  network: "testnet",
  decimals: 8,
  symbol: "TSAV",
  name: "TestSave",
  blocksPerMonth: 4320,
  yieldBps: 33,
};

function fmt(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 10) + "..." + addr.slice(-8);
}

const COIN_COLORS = [
  "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
];

function generateCoins(fillPct) {
  const count = Math.floor(fillPct * 0.35);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 75,
    y: 2 + Math.random() * Math.min(fillPct * 0.85, 88),
    size: 28 + Math.random() * 20,
    delay: (i % 5) * 0.05,
    color: COIN_COLORS[i % COIN_COLORS.length],
  }));
}

function Coin({ x, y, size, delay, color }) {
  return (
    <div style={{
      position: "absolute", left: `${x}%`, bottom: `${y}%`,
      width: size, height: size * 0.35, borderRadius: "50%",
      background: color,
      boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.4)",
      animation: `coinFall 0.6s ${delay}s both`, opacity: 0,
    }} />
  );
}

export default function SavingsJar() {
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [depositedBalance, setDepositedBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [pendingYield, setPendingYield] = useState(0);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [totalYieldPaid, setTotalYieldPaid] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(892441);
  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [coins, setCoins] = useState([]);
  const [animating, setAnimating] = useState(false);
  const [shake, setShake] = useState(false);

  const depRef = useRef(depositedBalance);
  depRef.current = depositedBalance;

  const maxJar = 1000;
  const fillPct = Math.min((depositedBalance / maxJar) * 100, 100);

  useEffect(() => { setCoins(generateCoins(fillPct)); }, [Math.floor(fillPct)]);

  // Simulate block ticking when connected
  useEffect(() => {
    if (!wallet) return;
    const id = setInterval(() => {
      setCurrentBlock(b => b + 1);
      // Tiny yield drip per block for demo feel
      if (depRef.current > 0) {
        const drip = depRef.current * (CONFIG.yieldBps / 10000) / CONFIG.blocksPerMonth;
        setPendingYield(p => p + drip);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [wallet]);

  function addLog(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    setLog(prev => [{ msg, time, type, id: Date.now() + Math.random() }, ...prev].slice(0, 30));
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  async function connect() {
    setConnecting(true);
    await new Promise(r => setTimeout(r, 1400));
    setWallet({ address: "tb1qx9rk4m2savingsjarOpNet8f3t7testnet" });
    setWalletBalance(5000);
    setConnecting(false);
    addLog("🔗 Wallet connected to OpNet testnet", "success");
    setTxStatus({ type: "success", msg: "Connected to OpNet testnet ✓" });
    setTimeout(() => setTxStatus(null), 3000);
  }

  function disconnect() {
    setWallet(null);
    setDepositedBalance(0);
    setWalletBalance(0);
    setPendingYield(0);
    setTotalDeposits(0);
    setTotalYieldPaid(0);
    setLog([]);
    addLog("🔌 Wallet disconnected");
  }

  async function deposit() {
    const amt = parseFloat(depositInput);
    if (!amt || amt <= 0 || amt > walletBalance) { triggerShake(); return; }
    setTxPending(true);
    setTxStatus({ type: "pending", msg: "Broadcasting deposit tx to OpNet..." });
    await new Promise(r => setTimeout(r, 1600));
    setDepositedBalance(d => d + amt);
    setWalletBalance(w => w - amt);
    setTotalDeposits(t => t + amt);
    setTxStatus({ type: "success", msg: `Deposited ${fmt(amt)} ${CONFIG.symbol} ✓` });
    addLog(`💰 deposit(${fmt(amt)}) → OpNet block #${currentBlock}`, "success");
    setDepositInput("");
    setAnimating(true);
    setTimeout(() => setAnimating(false), 700);
    triggerShake();
    setTxPending(false);
    setTimeout(() => setTxStatus(null), 3500);
  }

  async function withdraw() {
    const amt = parseFloat(withdrawInput);
    if (!amt || amt <= 0 || amt > depositedBalance) { triggerShake(); return; }
    setTxPending(true);
    setTxStatus({ type: "pending", msg: "Broadcasting withdraw tx to OpNet..." });
    await new Promise(r => setTimeout(r, 1600));
    setDepositedBalance(d => d - amt);
    setWalletBalance(w => w + amt);
    setTotalDeposits(t => Math.max(0, t - amt));
    setTxStatus({ type: "success", msg: `Withdrew ${fmt(amt)} ${CONFIG.symbol} ✓` });
    addLog(`💸 withdraw(${fmt(amt)}) → OpNet block #${currentBlock}`, "success");
    setWithdrawInput("");
    triggerShake();
    setTxPending(false);
    setTimeout(() => setTxStatus(null), 3500);
  }

  async function claimYield() {
    if (pendingYield <= 0) return;
    setTxPending(true);
    setTxStatus({ type: "pending", msg: "Claiming yield on OpNet..." });
    await new Promise(r => setTimeout(r, 1600));
    const claimed = pendingYield;
    setWalletBalance(w => w + claimed);
    setTotalYieldPaid(y => y + claimed);
    setPendingYield(0);
    setTxStatus({ type: "success", msg: `Claimed ${fmt(claimed)} ${CONFIG.symbol} yield ✓` });
    addLog(`📈 claimYield() → +${fmt(claimed)} ${CONFIG.symbol} block #${currentBlock}`, "success");
    triggerShake();
    setTxPending(false);
    setTimeout(() => setTxStatus(null), 3500);
  }

  function quickDeposit(amt) {
    setDepositInput(String(amt));
  }

  const statusColor = txStatus?.type === "success" ? "#6dffb3"
    : txStatus?.type === "error" ? "#ff8080" : "#80d0ff";

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0d0d1a 50%, #0a1a0d 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", padding: "20px", boxSizing: "border-box",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=JetBrains+Mono:wght@300;400;500&display=swap');
        @keyframes coinFall {
          0%  { opacity:0; transform:translateY(-20px) scale(0.5); }
          60% { opacity:1; transform:translateY(4px) scale(1.1); }
          100%{ opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes coinDrop {
          0%  { transform:translateY(-60px) rotate(0deg); opacity:1; }
          100%{ transform:translateY(0) rotate(180deg); opacity:0; }
        }
        @keyframes shake {
          0%,100%{ transform:rotate(0deg); }
          20%    { transform:rotate(-2deg) translateX(-3px); }
          40%    { transform:rotate(2deg) translateX(3px); }
          60%    { transform:rotate(-1.5deg) translateX(-2px); }
          80%    { transform:rotate(1.5deg) translateX(2px); }
        }
        @keyframes glimmer { 0%,100%{ opacity:0.3; } 50%{ opacity:0.7; } }
        @keyframes fadeSlide { from{ opacity:0; transform:translateY(-6px); } to{ opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.02); } }
        @keyframes spin { to{ transform:rotate(360deg); } }
        @keyframes yieldPulse { 0%,100%{ box-shadow:0 0 0 0 rgba(109,255,179,0); } 50%{ box-shadow:0 0 12px 3px rgba(109,255,179,0.2); } }
        .sj-btn {
          border:none; cursor:pointer; transition:all 0.2s;
          font-family:'JetBrains Mono',monospace; font-size:11px;
          letter-spacing:1px; text-transform:uppercase;
          padding:10px 18px; border-radius:6px;
        }
        .sj-btn:hover:not(:disabled){ transform:translateY(-1px); filter:brightness(1.2); }
        .sj-btn:active:not(:disabled){ transform:translateY(1px); }
        .sj-btn:disabled{ opacity:0.35; cursor:not-allowed; }
        .sj-input {
          background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
          color:#e8e0d0; padding:10px 14px; border-radius:6px;
          font-family:'JetBrains Mono',monospace; font-size:13px;
          width:110px; outline:none; transition:border-color 0.2s; box-sizing:border-box;
        }
        .sj-input:focus{ border-color:rgba(246,211,101,0.5); }
        .sj-log-entry{ animation:fadeSlide 0.3s ease; }
        .sj-scroll::-webkit-scrollbar{ width:3px; }
        .sj-scroll::-webkit-scrollbar-track{ background:transparent; }
        .sj-scroll::-webkit-scrollbar-thumb{ background:rgba(255,255,255,0.08); border-radius:2px; }
      `}</style>

      <div style={{ display:"flex", gap:"28px", alignItems:"flex-start", flexWrap:"wrap", justifyContent:"center", width:"100%" }}>

        {/* ─── JAR ─── */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"16px" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"26px", fontWeight:900, color:"#f6d365", textShadow:"0 0 30px rgba(246,211,101,0.4)", letterSpacing:"-0.5px" }}>
              🫙 Savings Jar
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.5)", letterSpacing:"3px", textTransform:"uppercase", marginTop:"5px" }}>
              OP_20 · {CONFIG.symbol} · OpNet Testnet
            </div>
          </div>

          <div style={{ animation: shake ? "shake 0.6s ease" : "none" }}>
            {/* Lid */}
            <div style={{ width:"130px", height:"20px", background:"linear-gradient(180deg,#8b7355,#6b5a3e)", borderRadius:"8px 8px 2px 2px", margin:"0 auto", marginBottom:"-2px", position:"relative", zIndex:10, boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }}>
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"70px", height:"5px", background:"rgba(255,255,255,0.1)", borderRadius:"3px" }} />
            </div>
            {/* Body */}
            <div style={{ width:"170px", height:"220px", position:"relative", overflow:"hidden" }}>
              {/* Glass */}
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,rgba(200,230,255,0.08),rgba(255,255,255,0.02),rgba(200,230,255,0.06))", border:"2px solid rgba(200,220,255,0.12)", borderRadius:"8px 8px 24px 24px", zIndex:5, pointerEvents:"none" }}>
                <div style={{ position:"absolute", top:"10%", left:"8%", width:"10px", height:"60%", background:"linear-gradient(180deg,rgba(255,255,255,0.18),transparent)", borderRadius:"5px", animation:"glimmer 3s ease-in-out infinite" }} />
              </div>
              {/* Fill */}
              <div style={{ position:"absolute", bottom:0, left:0, right:0, height:`${fillPct}%`, background:"linear-gradient(180deg,rgba(246,211,101,0.12),rgba(246,211,101,0.32))", transition:"height 0.9s cubic-bezier(0.34,1.56,0.64,1)", borderRadius:"0 0 22px 22px" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:"4px", background:"rgba(246,211,101,0.55)", filter:"blur(2px)" }} />
              </div>
              {/* Coins */}
              <div style={{ position:"absolute", inset:"10px", overflow:"hidden" }}>
                {coins.map(c => <Coin key={c.id} {...c} />)}
              </div>
              {/* Falling coin */}
              {animating && (
                <div style={{ position:"absolute", top:"20px", left:"50%", transform:"translateX(-50%)", width:"28px", height:"10px", borderRadius:"50%", background:"linear-gradient(135deg,#f6d365,#fda085)", animation:"coinDrop 0.7s ease-in forwards", zIndex:20 }} />
              )}
              {/* Not connected overlay */}
              {!wallet && (
                <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:"8px 8px 22px 22px", zIndex:10, gap:"6px" }}>
                  <div style={{ fontSize:"22px" }}>🔐</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.5)", letterSpacing:"2px", textTransform:"uppercase" }}>Connect Wallet</div>
                </div>
              )}
            </div>
            {/* Base */}
            <div style={{ width:"190px", height:"10px", background:"linear-gradient(180deg,#5a4a30,#3d3220)", borderRadius:"4px", margin:"0 auto", marginTop:"-2px", boxShadow:"0 4px 12px rgba(0,0,0,0.5)" }} />
          </div>

          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", color:"rgba(246,211,101,0.7)", letterSpacing:"2px" }}>
            {fillPct.toFixed(1)}% FULL
          </div>

          {wallet && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.35)", letterSpacing:"1px", lineHeight:1.8 }}>
                Block #{currentBlock.toLocaleString()}<br/>
                <span style={{ color:"rgba(109,255,179,0.4)" }}>Yield accruing live ↑</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── CONTROLS ─── */}
        <div style={{ display:"flex", flexDirection:"column", gap:"12px", width:"310px" }}>

          {/* Wallet */}
          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"12px", padding:"14px" }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.4)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"10px" }}>OpNet Wallet</div>
            {!wallet ? (
              <button className="sj-btn" onClick={connect} disabled={connecting} style={{ width:"100%", background:"linear-gradient(135deg,#f6d365,#fda085)", color:"#1a0a2e", fontWeight:700, fontSize:"12px" }}>
                {connecting
                  ? <span style={{ display:"inline-flex", alignItems:"center", gap:"8px" }}>
                      <span style={{ display:"inline-block", width:"10px", height:"10px", border:"2px solid #1a0a2e", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                      Connecting to OpNet...
                    </span>
                  : "🔗 Connect Wallet"
                }
              </button>
            ) : (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", color:"#6dffb3" }}>● Connected</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.4)", marginTop:"3px" }}>{shortAddr(wallet.address)}</div>
                </div>
                <button className="sj-btn" onClick={disconnect} style={{ background:"rgba(255,100,100,0.08)", color:"#ff8080", border:"1px solid rgba(255,100,100,0.15)", padding:"5px 10px", fontSize:"9px" }}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Balances */}
          <div style={{ background:"rgba(246,211,101,0.04)", border:"1px solid rgba(246,211,101,0.15)", borderRadius:"12px", padding:"16px", animation: shake ? "pulse 0.3s ease" : "none" }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.45)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"6px" }}>Deposited</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"30px", fontWeight:700, color:"#f6d365", lineHeight:1 }}>
              {fmt(depositedBalance)}
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", color:"rgba(200,180,150,0.5)", marginTop:"3px" }}>{CONFIG.symbol}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginTop:"14px", paddingTop:"12px", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
              {[
                ["Wallet", `${fmt(walletBalance)} TSAV`],
                ["Pending Yield", `${fmt(pendingYield)} TSAV`],
                ["TVL", `${fmt(totalDeposits)} TSAV`],
                ["Yield Paid", `${fmt(totalYieldPaid)} TSAV`],
              ].map(([label, value]) => (
                <div key={label} style={{ animation: label === "Pending Yield" && pendingYield > 0 ? "yieldPulse 2s ease-in-out infinite" : "none", borderRadius:"6px", padding:"4px" }}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color: label === "Pending Yield" ? "rgba(109,255,179,0.5)" : "rgba(200,180,150,0.35)", letterSpacing:"1px", textTransform:"uppercase" }}>{label}</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"10px", color: label === "Pending Yield" ? "#6dffb3" : "#e8e0d0", marginTop:"2px" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Contract info */}
          <div style={{ background:"rgba(255,255,255,0.015)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:"12px", padding:"12px" }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.35)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"8px" }}>OP_20 Contract</div>
            {[
              ["Network", CONFIG.network],
              ["APY", "~4%"],
              ["Monthly Rate", `${CONFIG.yieldBps} bps (0.33%)`],
              ["Yield Cycle", `~${CONFIG.blocksPerMonth} BTC blocks`],
            ].map(([k, v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"10px", color:"rgba(200,180,150,0.35)" }}>{k}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"10px", color:"#e8e0d0" }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:"8px", paddingTop:"8px", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"8px", color:"rgba(200,180,150,0.3)", marginBottom:"3px", letterSpacing:"1px", textTransform:"uppercase" }}>Contract</div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(246,211,101,0.4)", wordBreak:"break-all" }}>{CONFIG.contractAddress}</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ background:"rgba(255,255,255,0.015)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:"12px", padding:"14px" }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.35)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"12px" }}>Actions</div>
            <div style={{ display:"flex", gap:"8px", marginBottom:"8px" }}>
              <input className="sj-input" type="number" placeholder="amount" value={depositInput} onChange={e => setDepositInput(e.target.value)} onKeyDown={e => e.key === "Enter" && deposit()} disabled={!wallet || txPending} />
              <button className="sj-btn" onClick={deposit} disabled={!wallet || txPending || !depositInput} style={{ background:"linear-gradient(135deg,#f6d365,#fda085)", color:"#1a0a2e", fontWeight:700, flex:1 }}>
                Deposit
              </button>
            </div>
            <div style={{ display:"flex", gap:"8px", marginBottom:"8px" }}>
              <input className="sj-input" type="number" placeholder="amount" value={withdrawInput} onChange={e => setWithdrawInput(e.target.value)} onKeyDown={e => e.key === "Enter" && withdraw()} disabled={!wallet || txPending} />
              <button className="sj-btn" onClick={withdraw} disabled={!wallet || txPending || !withdrawInput} style={{ background:"rgba(255,100,100,0.12)", color:"#ff8080", border:"1px solid rgba(255,100,100,0.18)", flex:1 }}>
                Withdraw
              </button>
            </div>
            <button className="sj-btn" onClick={claimYield} disabled={!wallet || txPending || pendingYield <= 0} style={{ width:"100%", background: pendingYield > 0 ? "rgba(109,255,179,0.1)" : "rgba(255,255,255,0.03)", color: pendingYield > 0 ? "#6dffb3" : "rgba(200,180,150,0.3)", border:`1px solid ${pendingYield > 0 ? "rgba(109,255,179,0.2)" : "rgba(255,255,255,0.05)"}`, animation: pendingYield > 0.001 ? "yieldPulse 2s ease-in-out infinite" : "none" }}>
              🌱 Claim Yield {pendingYield > 0 ? `(+${fmt(pendingYield)} TSAV)` : "(nothing yet)"}
            </button>
          </div>

          {/* Quick amounts */}
          <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
            {[10, 50, 100, 250, 500].map(amt => (
              <button key={amt} className="sj-btn" onClick={() => quickDeposit(amt)} disabled={!wallet || txPending} style={{ background:"rgba(246,211,101,0.07)", color:"rgba(246,211,101,0.75)", border:"1px solid rgba(246,211,101,0.12)", padding:"6px 12px", fontSize:"10px" }}>
                +{amt}
              </button>
            ))}
          </div>

          {/* Tx status */}
          {txStatus && (
            <div style={{ background:"rgba(0,0,0,0.4)", border:`1px solid ${statusColor}28`, borderRadius:"8px", padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", color:statusColor, animation:"fadeSlide 0.3s ease", display:"flex", alignItems:"center", gap:"8px" }}>
              {txStatus.type === "pending" && <span style={{ display:"inline-block", width:"9px", height:"9px", border:`2px solid ${statusColor}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 }} />}
              {txStatus.msg}
            </div>
          )}

          {/* Log */}
          <div className="sj-scroll" style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.04)", borderRadius:"12px", padding:"12px", maxHeight:"140px", overflowY:"auto" }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.35)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"8px" }}>Activity Log</div>
            {log.length === 0
              ? <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", color:"rgba(200,180,150,0.25)", fontStyle:"italic" }}>
                  {wallet ? "Make a deposit to start earning..." : "Connect wallet to begin..."}
                </div>
              : log.map(entry => (
                <div key={entry.id} className="sj-log-entry" style={{ marginBottom:"5px", display:"flex", gap:"8px" }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"9px", color:"rgba(200,180,150,0.25)", flexShrink:0 }}>{entry.time}</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"10px", color: entry.type === "success" ? "#6dffb3" : entry.type === "error" ? "#ff8080" : "rgba(220,210,190,0.7)" }}>{entry.msg}</span>
                </div>
              ))
            }
          </div>

          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"8px", color:"rgba(200,180,150,0.18)", textAlign:"center", letterSpacing:"1px", lineHeight:1.7 }}>
            Built on OpNet · Bitcoin L1 Smart Contracts<br/>
            OP_20 Token Standard · ~4% APY · Yield per BTC block
          </div>
        </div>
      </div>
    </div>
  );
}
