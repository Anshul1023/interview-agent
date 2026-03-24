import { useState, useEffect, useRef, useCallback } from "react";

const WS_AUDIO_URL = "ws://localhost:8000/ws/audio";

const NOISE = [
  "thank you","thanks","you're welcome","welcome","okay","ok",
  "yes","no","hello","hi","bye","goodbye","um","uh","hmm",
  "alright","right","sure","got it","i see","please","sorry",
  "good","great","nice","wow","oh","ah","well","so","and",
];

function isNoise(text) {
  const t = text.toLowerCase().trim();
  const words = t.split(/\s+/).length;
  if (words < 4) return true;
  if (words < 8 && NOISE.some(n => t.includes(n))) return true;
  return false;
}

export default function App() {
  const [candidate,   setCandidate]   = useState("Candidate");
  const [transcript,  setTranscript]  = useState("");
  const [aiResponse,  setAiResponse]  = useState("");
  const [statusMsg,   setStatusMsg]   = useState("Idle");
  const [isListening, setIsListening] = useState(false);
  const [resumeText,  setResumeText]  = useState("");
  const [resumeSaved, setResumeSaved] = useState(false);
  const [typedQ,      setTypedQ]      = useState("");
  const [isTyping,    setIsTyping]    = useState(false);

  // Overlay state
  const [overlayOp,      setOverlayOp]      = useState(0.92);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayPos,     setOverlayPos]     = useState({ x: 20, y: 80 });
  const [overlayQ,       setOverlayQ]       = useState("");
  const [overlayResp,    setOverlayResp]    = useState("");
  const [overlayStatus,  setOverlayStatus]  = useState("Waiting...");
  const draggingRef = useRef(false);
  const dragOffset  = useRef({ x: 0, y: 0 });

  const wsRef       = useRef(null);
  const recRef      = useRef(null);
  const streamRef   = useRef(null);
  const timerRef    = useRef(null);
  const aiStreamRef = useRef("");
  const candidateRef = useRef(candidate);

  useEffect(() => { candidateRef.current = candidate; }, [candidate]);

  // ── Overlay drag ───────────────────────────────────────────────────────────
  const onDragStart = (e) => {
    draggingRef.current = true;
    dragOffset.current = { x: e.clientX - overlayPos.x, y: e.clientY - overlayPos.y };
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      setOverlayPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    try { wsRef.current?.close(); } catch (_) {}
    const ws = new WebSocket(WS_AUDIO_URL);
    ws.onopen  = () => setStatusMsg("🟢 Connected — speak now");
    ws.onerror = () => { setStatusMsg("🔴 Backend not running"); setIsListening(false); };

    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);

      if (msg.type === "transcript") {
        const text = msg.text?.trim() || "";
        if (!text || isNoise(text)) return;

        setTranscript(text);
        setAiResponse("");
        aiStreamRef.current = "";
        setStatusMsg("⏳ Getting answer...");
        setOverlayQ(text);
        setOverlayResp("⏳ Generating answer...");
        setOverlayStatus("Thinking...");
        setOverlayVisible(true);

      } else if (msg.type === "llm_token") {
        aiStreamRef.current += msg.text;
        setAiResponse(aiStreamRef.current);
        setOverlayResp(aiStreamRef.current);
        setOverlayStatus("Answering...");

      } else if (msg.type === "llm_done") {
        setStatusMsg("✅ Done — click Start to ask again");
        setOverlayStatus("Done ✓");

      } else if (msg.type === "error") {
        setStatusMsg("❌ " + msg.message);
        setIsListening(false);
      }
    };

    wsRef.current = ws;
    return ws;
  }, []);

  // ── Start listening ────────────────────────────────────────────────────────
  const startListening = async () => {
    try {
      setTranscript("");
      setAiResponse("");
      aiStreamRef.current = "";

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 }
      });

      const ws = connectWS();

      // Wait for WS to open
      await new Promise((res, rej) => {
        if (ws.readyState === WebSocket.OPEN) { res(); return; }
        ws.addEventListener("open",  res, { once: true });
        ws.addEventListener("error", rej, { once: true });
        setTimeout(() => rej(new Error("Connection timeout")), 6000);
      });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";

      const rec = new MediaRecorder(micStream, { mimeType });
      const chunks = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      rec.onstop = async () => {
        // Stop mic tracks
        micStream.getTracks().forEach(t => t.stop());
        setIsListening(false);

        if (!chunks.length) { setStatusMsg("No audio captured"); return; }

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 3000) { setStatusMsg("Too short — speak louder"); return; }

        setStatusMsg("⏳ Processing speech...");

        const buf   = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary  = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const b64 = btoa(binary);

        // WS may still be open — send audio
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "audio_chunk", data: b64, candidate: candidateRef.current }));
          ws.send(JSON.stringify({ type: "end_audio" }));
        } else {
          setStatusMsg("❌ Connection lost — try again");
        }
      };

      rec.start();
      setIsListening(true);
      setOverlayStatus("Listening...");
      setOverlayVisible(true);
      recRef.current  = rec;
      streamRef.current = micStream;

      // Auto-stop after 10 seconds
      timerRef.current = setTimeout(() => {
        if (rec.state === "recording") {
          setStatusMsg("⏳ Processing...");
          rec.stop();
        }
      }, 10000);

    } catch (err) {
      setStatusMsg("❌ " + err.message);
      setIsListening(false);
    }
  };

  // ── Stop listening manually ────────────────────────────────────────────────
  const stopListening = () => {
    clearTimeout(timerRef.current);
    if (recRef.current?.state === "recording") {
      setStatusMsg("⏳ Processing...");
      recRef.current.stop(); // triggers onstop → sends audio
    }
  };

  // ── Send typed question ────────────────────────────────────────────────────
  const sendTypedQuestion = async () => {
    if (!typedQ.trim() || isTyping) return;
    const question = typedQ.trim();
    setTypedQ("");
    setTranscript(question);
    setAiResponse("");
    aiStreamRef.current = "";
    setIsTyping(true);
    setStatusMsg("⏳ Getting answer...");
    setOverlayQ(question);
    setOverlayResp("⏳ Generating answer...");
    setOverlayStatus("Thinking...");
    setOverlayVisible(true);

    try {
      const resumeRes = await fetch(`http://localhost:8000/resume/${encodeURIComponent(candidate)}`).catch(() => null);
      const resumeData = resumeRes?.ok ? await resumeRes.json() : {};
      const resumeCtx = resumeData.content || "";

      const response = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, candidate_name: candidate, resume_context: resumeCtx }),
      });

      if (!response.ok) throw new Error("Backend error");

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          const token = line.slice(6);
          if (token === "[DONE]") break;
          aiStreamRef.current += token;
          setAiResponse(aiStreamRef.current);
          setOverlayResp(aiStreamRef.current);
          setOverlayStatus("Answering...");
        }
      }
      setStatusMsg("✅ Done");
      setOverlayStatus("Done ✓");
    } catch (err) {
      setStatusMsg("❌ " + err.message);
      setOverlayStatus("Error");
    } finally {
      setIsTyping(false);
    }
  };

  // ── Save resume ────────────────────────────────────────────────────────────
  const saveResume = async () => {
    try {
      const res = await fetch("http://localhost:8000/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: resumeText, candidate_name: candidate }),
      });
      if (res.ok) { setResumeSaved(true); setStatusMsg("✅ Resume saved"); }
    } catch { setStatusMsg("❌ Backend not running"); }
  };

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
  }, []);

  const sc = statusMsg.includes("🟢") || statusMsg.includes("✅") ? { bg:"#dcfce7", fg:"#166534" }
    : statusMsg.includes("🔴") || statusMsg.includes("❌") ? { bg:"#fee2e2", fg:"#991b1b" }
    : statusMsg.includes("🎤") || statusMsg.includes("speak") ? { bg:"#ede9fe", fg:"#5b21b6" }
    : statusMsg.includes("⏳") ? { bg:"#fef9c3", fg:"#854d0e" }
    : { bg:"#f1f5f9", fg:"#64748b" };

  return (
    <div style={st.app}>

      {/* ── Floating Overlay ───────────────────────────────────────────────── */}
      {overlayVisible && (
        <div style={{
          position: "fixed",
          left: overlayPos.x,
          top:  overlayPos.y,
          width: 380,
          zIndex: 9999,
          opacity: overlayOp,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          border: "1px solid #30363d",
          background: "#0d1117",
          userSelect: "none",
        }}>
          {/* Title bar */}
          <div
            onMouseDown={onDragStart}
            style={{ background:"#161b22", padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"move", borderBottom:"1px solid #30363d" }}
          >
            <span style={{ color:"#a78bfa", fontSize:12, fontWeight:700 }}>🤖 AI Assistant</span>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10, color:"#6e7681" }}>Opacity</span>
              <input type="range" min="10" max="100" value={Math.round(overlayOp*100)}
                onChange={e => setOverlayOp(e.target.value/100)}
                style={{ width:60, accentColor:"#a78bfa", cursor:"pointer" }}
                onMouseDown={e => e.stopPropagation()}
              />
              <span style={{ fontSize:10, color:"#6e7681", width:28 }}>{Math.round(overlayOp*100)}%</span>
              <span style={{ fontSize:10, color:"#6e7681", background:"#30363d", padding:"2px 6px", borderRadius:4 }}>{overlayStatus}</span>
              <button onClick={() => setOverlayVisible(false)}
                style={{ background:"none", border:"none", color:"#6e7681", cursor:"pointer", fontSize:14, padding:"0 2px" }}>✕</button>
            </div>
          </div>

          {/* Question */}
          {overlayQ && (
            <div style={{ padding:"6px 12px", background:"#1c2128", borderBottom:"1px solid #30363d", fontSize:11, color:"#e3b341", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              ❓ {overlayQ}
            </div>
          )}

          {/* Response */}
          <div style={{ padding:"12px", maxHeight:220, overflowY:"auto" }}>
            {overlayResp
              ? <p style={{ fontSize:13, color:"#e6edf3", lineHeight:1.75, margin:0, whiteSpace:"pre-wrap" }}>{overlayResp}</p>
              : <p style={{ fontSize:13, color:"#484f58", fontStyle:"italic", margin:0 }}>Waiting for question...</p>
            }
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header style={st.header}>
        <div>
          <h1 style={st.title}>🎙 Interview AI Agent</h1>
          <p style={st.subtitle}>Answers any question — technical, DSA, HR, behavioral</p>
        </div>
        <span style={{ ...st.badge, background:sc.bg, color:sc.fg }}>{statusMsg}</span>
      </header>

      <div style={st.banner}>
        💡 <strong>To hide from interviewer:</strong> In Zoom/Meet → Share Screen → select <strong>only the Zoom/Meet window</strong> (not browser). The floating overlay stays on your screen only.
      </div>

      {/* ── Candidate Setup ────────────────────────────────────────────────── */}
      <section style={st.card}>
        <h2 style={st.sectionTitle}>👤 Candidate Setup</h2>
        <div style={st.row}>
          <label style={st.label}>Your Name</label>
          <input style={st.input} value={candidate} onChange={e => setCandidate(e.target.value)} placeholder="Enter your name" />
        </div>
        <div style={st.row}>
          <label style={st.label}>Resume <span style={{color:"#94a3b8",fontWeight:400}}>(for personalized HR answers)</span></label>
          <textarea style={{...st.input, height:100, resize:"vertical", fontFamily:"monospace", fontSize:12}}
            value={resumeText} onChange={e => { setResumeText(e.target.value); setResumeSaved(false); }}
            placeholder="Paste resume here..." />
        </div>
        <button style={resumeSaved ? st.btnSuccess : st.btnSecondary} onClick={saveResume} disabled={!resumeText}>
          {resumeSaved ? "✅ Resume Saved" : "💾 Save Resume"}
        </button>
      </section>

      {/* ── Voice Input ────────────────────────────────────────────────────── */}
      <section style={st.card}>
        <h2 style={st.sectionTitle}>🎤 Voice Input <span style={{fontSize:12,color:"#94a3b8",fontWeight:400}}>(one question at a time)</span></h2>
        <div style={st.controls}>
          {!isListening
            ? <button style={st.btnPrimary} onClick={startListening} disabled={isTyping}>
                🎤 Start Listening
              </button>
            : <button style={st.btnDanger} onClick={stopListening}>
                ⏹ Stop &amp; Send
              </button>
          }
          <button style={st.btnSecondary} onClick={() => setOverlayVisible(v => !v)}>
            {overlayVisible ? "🙈 Hide Overlay" : "🪟 Show Overlay"}
          </button>
        </div>
        <div style={st.tips}>
          <p style={st.tip}>🎧 <strong>Use headphones</strong> — prevents echo</p>
          <p style={st.tip}>🎤 Click Start → speak → click Stop (or wait 10s auto-stop)</p>
          <p style={st.tip}>🔁 Click Start again for next question</p>
        </div>
      </section>

      {/* ── Type a Question ────────────────────────────────────────────────── */}
      <section style={st.card}>
        <h2 style={st.sectionTitle}>⌨️ Type a Question <span style={{fontSize:12,color:"#94a3b8",fontWeight:400}}>(any topic — coding, DSA, HR)</span></h2>
        <div style={{display:"flex", gap:8}}>
          <input style={{...st.input, flex:1}} value={typedQ}
            onChange={e => setTypedQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendTypedQuestion()}
            placeholder="e.g. What is a binary search tree? / Write quicksort in Python..."
            disabled={isTyping || isListening}
          />
          <button style={{...st.btnPrimary, padding:"8px 18px", whiteSpace:"nowrap"}}
            onClick={sendTypedQuestion} disabled={!typedQ.trim() || isTyping || isListening}>
            {isTyping ? "⏳..." : "Ask →"}
          </button>
        </div>
        <p style={{fontSize:12, color:"#94a3b8", margin:"6px 0 0"}}>Press Enter to send</p>
      </section>

      {/* ── Overlay Settings ───────────────────────────────────────────────── */}
      <section style={st.card}>
        <h2 style={st.sectionTitle}>🪟 Overlay Settings</h2>
        <div style={{display:"flex", alignItems:"center", gap:12, flexWrap:"wrap"}}>
          <span style={{fontSize:13, color:"#64748b"}}>Opacity: <strong>{Math.round(overlayOp*100)}%</strong></span>
          <input type="range" min="10" max="100" value={Math.round(overlayOp*100)}
            onChange={e => setOverlayOp(e.target.value/100)}
            style={{flex:1, maxWidth:300, accentColor:"#7c3aed", cursor:"pointer"}} />
          <button style={st.btnSecondary} onClick={() => setOverlayVisible(v => !v)}>
            {overlayVisible ? "🙈 Hide" : "🪟 Show"}
          </button>
        </div>
        <p style={{fontSize:12, color:"#94a3b8", margin:"8px 0 0"}}>
          🖱️ Drag the overlay by its title bar to reposition it anywhere on screen
        </p>
      </section>

      {/* ── Question ───────────────────────────────────────────────────────── */}
      {transcript && (
        <section style={st.card}>
          <h2 style={st.sectionTitle}>📝 Question</h2>
          <p style={st.transcriptText}>"{transcript}"</p>
        </section>
      )}

      {/* ── AI Response ────────────────────────────────────────────────────── */}
      <section style={{...st.card, background:"#f0fdf4", border:"1px solid #bbf7d0"}}>
        <h2 style={st.sectionTitle}>🤖 AI Response</h2>
        {aiResponse
          ? <p style={st.aiText}>{aiResponse}</p>
          : <p style={st.placeholder}>Ask a question by voice or by typing above...</p>
        }
      </section>
    </div>
  );
}

const st = {
  app:           { fontFamily:"'Inter',system-ui,sans-serif", maxWidth:820, margin:"0 auto", padding:"24px 16px", background:"#f8fafc", minHeight:"100vh" },
  header:        { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 },
  title:         { fontSize:22, fontWeight:700, margin:0, color:"#1e293b" },
  subtitle:      { fontSize:13, color:"#94a3b8", margin:"2px 0 0" },
  badge:         { fontSize:12, padding:"5px 12px", borderRadius:99, fontWeight:600, whiteSpace:"nowrap", marginTop:4 },
  banner:        { background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#92400e", lineHeight:1.5 },
  card:          { background:"#fff", borderRadius:12, padding:20, marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,.07)" },
  sectionTitle:  { fontSize:15, fontWeight:600, marginTop:0, marginBottom:12, color:"#334155" },
  row:           { display:"flex", flexDirection:"column", marginBottom:12 },
  label:         { fontSize:13, color:"#64748b", marginBottom:4, fontWeight:500 },
  input:         { border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:14, width:"100%", boxSizing:"border-box", outline:"none" },
  controls:      { display:"flex", gap:12, flexWrap:"wrap" },
  tips:          { marginTop:12, padding:"10px 14px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0" },
  tip:           { fontSize:12, color:"#64748b", margin:"3px 0" },
  btnPrimary:    { background:"#7c3aed", color:"#fff", border:"none", borderRadius:8, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer" },
  btnDanger:     { background:"#dc2626", color:"#fff", border:"none", borderRadius:8, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer" },
  btnSecondary:  { background:"#ede9fe", color:"#5b21b6", border:"none", borderRadius:8, padding:"11px 18px", fontSize:13, fontWeight:600, cursor:"pointer" },
  btnSuccess:    { background:"#dcfce7", color:"#166534", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer" },
  transcriptText:{ fontSize:15, color:"#475569", lineHeight:1.6, margin:0, fontStyle:"italic" },
  aiText:        { fontSize:15, color:"#166534", lineHeight:1.8, margin:0, whiteSpace:"pre-wrap" },
  placeholder:   { fontSize:14, color:"#94a3b8", margin:0, fontStyle:"italic" },
};