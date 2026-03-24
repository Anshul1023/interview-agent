import { useState, useEffect } from "react";

export default function Overlay() {
  const [response, setResponse] = useState("");
  const [question, setQuestion]  = useState("");
  const [loading, setLoading]    = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onTranscript((text) => {
        setQuestion(text);
        setResponse("");
        setLoading(true);
      });
      window.electronAPI.onAiToken((token) => {
        setResponse((r) => r + token);
        setLoading(false);
      });
      window.electronAPI.onAiDone(() => setLoading(false));
    }

    const bc = new BroadcastChannel("ai-agent");
    bc.onmessage = (e) => {
      if (e.data.type === "transcript") { setQuestion(e.data.text); setResponse(""); setLoading(true); }
      if (e.data.type === "ai_token")   { setResponse((r) => r + e.data.text); setLoading(false); }
      if (e.data.type === "ai_done")    { setLoading(false); }
    };
    return () => bc.close();
  }, []);

  return (
    <div style={s.root}>
      <div style={s.bar}>
        <span style={s.barTitle}>🤖 AI Interview Assistant</span>
        <span style={s.barDot}></span>
      </div>
      {question && <div style={s.question}>❓ {question}</div>}
      <div style={s.body}>
        {loading && !response && <p style={s.loading}>Generating answer...</p>}
        {response  && <p style={s.text}>{response}</p>}
        {!response && !loading && <p style={s.idle}>Waiting for question...</p>}
      </div>
    </div>
  );
}

const s = {
  root:     { display:"flex", flexDirection:"column", height:"100vh", background:"#0f172a", borderRadius:12, border:"1px solid #334155", overflow:"hidden", fontFamily:"Arial,sans-serif" },
  bar:      { background:"#1e293b", padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"move" },
  barTitle: { color:"#818cf8", fontSize:13, fontWeight:700 },
  barDot:   { width:8, height:8, borderRadius:"50%", background:"#22c55e" },
  question: { padding:"6px 14px", background:"#1e3a5f", color:"#fcd34d", fontSize:12, borderBottom:"1px solid #334155" },
  body:     { flex:1, padding:"12px 14px", overflowY:"auto" },
  text:     { color:"#e2e8f0", fontSize:14, lineHeight:1.7, margin:0, whiteSpace:"pre-wrap" },
  idle:     { color:"#475569", fontSize:13, margin:0, fontStyle:"italic" },
  loading:  { color:"#818cf8", fontSize:13, margin:0 },
};