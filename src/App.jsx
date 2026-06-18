import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const fallbackSentiment = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  values: [0.2, 0.4, 0.8, 0.6, 0.9, 1.0, 0.7],
};

const archiveImages = [
  "/media/media__1781392497611.jpg",
  "/media/media__1781392497622.jpg",
  "/media/media__1781392497634.jpg",
  "/media/media__1781392497647.jpg",
  "/media/media__1781392497668.png",
  "/media/media__1781392682678.jpg",
  "/media/media__1781392682690.jpg",
  "/media/media__1781392682704.jpg",
  "/media/media__1781392682721.jpg",
];

function App() {
  const [activeTab, setActiveTab] = useState("builder");
  const [rawThoughts, setRawThoughts] = useState("");
  const [tone, setTone] = useState("restrained warmth");
  const [format, setFormat] = useState("letter");
  const [purpose, setPurpose] = useState("it has been some time");
  const [length, setLength] = useState("medium");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [includeDiaryContext, setIncludeDiaryContext] = useState(false);
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryKind, setDiaryKind] = useState("poem");
  const [diaryContent, setDiaryContent] = useState("");
  const [diaryStatus, setDiaryStatus] = useState("Ready");
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("Ready");
  const [isUploading, setIsUploading] = useState(false);

  const [sentimentData, setSentimentData] = useState(fallbackSentiment);
  const [clusterData, setClusterData] = useState([]);
  const [analyticsStatus, setAnalyticsStatus] = useState("Ready");

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      text: "Ask me about timing, patterns, topics, or emotional shape in the communication history.",
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatSuggestions, setChatSuggestions] = useState([]);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (activeTab !== "analytics") return;

    const controller = new AbortController();
    fetch("/api/analytics", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Analytics request failed");
        return res.json();
      })
      .then((data) => {
        setSentimentData(data.sentimentOverTime || fallbackSentiment);
        setClusterData(data.clustering || []);
        setAnalyticsStatus(data.source === "bigquery" ? "BigQuery connected" : "Using local sample data");
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Error fetching analytics", err);
          setAnalyticsStatus("Using local sample data");
        }
      });

    return () => controller.abort();
  }, [activeTab]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const loadDiaryEntries = () => {
    fetch("/api/diary")
      .then((res) => {
        if (!res.ok) throw new Error("Diary request failed");
        return res.json();
      })
      .then((data) => {
        setDiaryEntries(data.entries || []);
        setDiaryStatus(data.entries?.length ? `${data.entries.length} saved entries` : "Ready");
      })
      .catch((err) => {
        console.error("Error fetching diary", err);
        setDiaryStatus("Diary service offline");
      });
  };

  useEffect(() => {
    if (activeTab === "diary" || activeTab === "builder") loadDiaryEntries();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "uploads") return;

    fetch("/api/uploads")
      .then((res) => {
        if (!res.ok) throw new Error("Upload list request failed");
        return res.json();
      })
      .then((data) => {
        setUploadedFiles(data.files || []);
        setUploadStatus(data.files?.length ? `${data.files.length} saved files` : "Ready");
      })
      .catch((err) => {
        console.error("Error fetching uploads", err);
        setUploadStatus("Upload service offline");
      });
  }, [activeTab]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    setIsUploading(true);
    setUploadStatus("Uploading");

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setUploadedFiles(data.files || []);
      setUploadStatus(`${data.uploaded} file${data.uploaded === 1 ? "" : "s"} uploaded`);
    } catch (err) {
      console.error(err);
      setUploadStatus("Upload failed");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveDiary = async (e) => {
    e.preventDefault();
    if (!diaryContent.trim() || isSavingDiary) return;

    setIsSavingDiary(true);
    setDiaryStatus("Saving");

    try {
      const response = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: diaryTitle, kind: diaryKind, content: diaryContent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Diary save failed");

      setDiaryEntries(data.entries || []);
      setDiaryTitle("");
      setDiaryContent("");
      setDiaryStatus("Entry saved");
    } catch (err) {
      console.error(err);
      setDiaryStatus("Save failed");
    } finally {
      setIsSavingDiary(false);
    }
  };

  const handleGenerateDraft = async () => {
    setIsGeneratingDraft(true);
    setDraft("");
    setStatus("Composing");

    try {
      const response = await fetch("/api/talmadge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawThoughts,
          tone,
          format,
          purpose,
          length,
          diaryContext: includeDiaryContext
            ? diaryEntries
                .slice(0, 5)
                .map((entry) => `${entry.title}: ${entry.content}`)
                .join("\n\n")
            : "",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft request failed");

      setDraft(data.output || "");
      setStatus(data.source === "openai" ? "Generated with OpenAI" : "Generated with local fallback");
    } catch (err) {
      console.error(err);
      setDraft("I could not generate a draft right now. Please check that the API server is running.");
      setStatus("Draft failed");
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleChat = async (e) => {
    e?.preventDefault();
    const inputStr = chatInput.trim();
    if (!inputStr || isChatLoading) return;

    const historySnapshot = [...chatMessages];
    const nextMessages = [...historySnapshot, { role: "user", text: inputStr }];
    setChatInput("");
    setChatSuggestions([]);
    setChatMessages(nextMessages);
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputStr, history: historySnapshot }),
      });

      if (!response.ok || !response.body) throw new Error("Chat request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assistantResponse = "";
      let hasAssistantMessage = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (event === "data: [DONE]") return;
          if (!event.startsWith("data: ")) continue;

          try {
            const parsed = JSON.parse(event.replace("data: ", ""));
            if (parsed.type === "SUGGESTION") {
              setChatSuggestions((prev) => (prev.includes(parsed.content) ? prev : [...prev, parsed.content]));
              continue;
            }

            if (parsed.type === "THOUGHT" || parsed.type === "FINAL_RESPONSE") {
              assistantResponse += parsed.content;
              if (!hasAssistantMessage) {
                hasAssistantMessage = true;
                setChatMessages([...nextMessages, { role: "assistant", text: assistantResponse, type: parsed.type }]);
              } else {
                setChatMessages([
                  ...nextMessages,
                  { role: "assistant", text: assistantResponse, type: parsed.type },
                ]);
              }
            }
          } catch (err) {
            console.error("SSE parse error", err, event);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "I could not reach the analytics chat service. The local API may be offline." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const sentimentChartOption = useMemo(
    () => ({
      color: ["#c69b4a"],
      title: { text: "Weekly Signal", textStyle: { color: "#f5f2eb", fontWeight: 500 } },
      grid: { left: 36, right: 18, bottom: 32, top: 58 },
      tooltip: { trigger: "axis", backgroundColor: "#1a1815", borderColor: "#4a3e2b", textStyle: { color: "#f5f2eb" } },
      xAxis: { type: "category", data: sentimentData.days, axisLabel: { color: "#c2bbae" }, axisLine: { lineStyle: { color: "#4a3e2b" } } },
      yAxis: { type: "value", axisLabel: { color: "#c2bbae" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
      series: [{ data: sentimentData.values, type: "line", smooth: true, lineStyle: { width: 3 }, areaStyle: { opacity: 0.18 } }],
    }),
    [sentimentData],
  );

  const clusteringOption = useMemo(
    () => ({
      color: ["#c69b4a", "#7fa088", "#b66d58", "#8f84b8", "#d9c89f"],
      title: { text: "Theme Mix", textStyle: { color: "#f5f2eb", fontWeight: 500 } },
      tooltip: { trigger: "item", backgroundColor: "#1a1815", borderColor: "#4a3e2b", textStyle: { color: "#f5f2eb" } },
      series: [{
        name: "Themes",
        type: "pie",
        radius: ["42%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#1a1815", borderWidth: 2 },
        label: { color: "#c2bbae" },
        data: clusterData.length ? clusterData : [{ value: 1, name: "Sample data" }],
      }],
    }),
    [clusterData],
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Private Correspondence Studio</p>
        <h1>Talmadge GPT</h1>
        <p className="subtitle">
          A finished workspace for careful drafts, communication analytics, and the visual archive.
        </p>
      </section>

      <nav className="tab-navigation" aria-label="Primary">
        {[
          ["builder", "Draft Builder"],
          ["analytics", "ML Analytics"],
          ["gallery", "Visual Archive"],
          ["uploads", "Archive Uploads"],
          ["diary", "Diary"],
        ].map(([id, label]) => (
          <button key={id} className={`tab-btn ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="workspace">
        {activeTab === "builder" && (
          <section className="panel builder-panel">
            <div className="panel-heading">
              <h2>Correspondence Builder</h2>
              {status && <span className="pill">{status}</span>}
            </div>

            <div className="control-grid">
              <label className="form-group">
                <span>Tone</span>
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="restrained warmth">Restrained Warmth</option>
                  <option value="soft and reflective">Soft and Reflective</option>
                  <option value="playful but discreet">Playful but Discreet</option>
                </select>
              </label>
              <label className="form-group">
                <span>Format</span>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="letter">Letter</option>
                  <option value="short note">Short Note</option>
                  <option value="text message">Text Message</option>
                </select>
              </label>
              <label className="form-group">
                <span>Purpose</span>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  <option value="it has been some time">It Has Been Some Time</option>
                  <option value="gentle check-in">Gentle Check-in</option>
                  <option value="shared memory">Shared Memory</option>
                </select>
              </label>
              <label className="form-group">
                <span>Length</span>
                <select value={length} onChange={(e) => setLength(e.target.value)}>
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </label>
            </div>

            <label className="form-group">
              <span>Raw Thoughts</span>
              <textarea
                value={rawThoughts}
                onChange={(e) => setRawThoughts(e.target.value)}
                placeholder="Write the unpolished version here."
              />
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={includeDiaryContext}
                onChange={(e) => setIncludeDiaryContext(e.target.checked)}
              />
              <span>Use recent diary and poems as private draft context</span>
            </label>

            <div className="button-row">
              <button className="primary" onClick={handleGenerateDraft} disabled={isGeneratingDraft}>
                {isGeneratingDraft ? "Generating" : "Generate Draft"}
              </button>
              <button className="secondary" onClick={() => setRawThoughts("")} disabled={!rawThoughts || isGeneratingDraft}>
                Clear
              </button>
            </div>

            {draft && <div className="draft-box">{draft}</div>}
          </section>
        )}

        {activeTab === "analytics" && (
          <section className="analytics-layout">
            <div className="charts-col">
              <div className="panel-heading">
                <h2>Analytics</h2>
                <span className="pill">{analyticsStatus}</span>
              </div>
              <section className="output-card">
                <ReactECharts option={sentimentChartOption} className="chart" />
              </section>
              <section className="output-card">
                <ReactECharts option={clusteringOption} className="chart" />
              </section>
            </div>

            <section className="panel chat-panel">
              <div className="panel-heading">
                <h2>Ask Your Data</h2>
                {isChatLoading && <span className="pill">Thinking</span>}
              </div>
              <div className="chat-messages">
                {chatMessages.map((msg, i) => (
                  <article key={`${msg.role}-${i}`} className={`message ${msg.role}`}>
                    {msg.type === "THOUGHT" && <span className="message-kicker">Thinking</span>}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                  </article>
                ))}
                <div ref={chatBottomRef} />
              </div>

              {chatSuggestions.length > 0 && (
                <div className="suggestion-row">
                  {chatSuggestions.map((suggestion) => (
                    <button key={suggestion} className="suggestion-chip" onClick={() => setChatInput(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              <form className="chat-form" onSubmit={handleChat}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="When is the best time to send a note?"
                  disabled={isChatLoading}
                />
                <button type="submit" className="primary" disabled={isChatLoading || !chatInput.trim()}>
                  Ask
                </button>
              </form>
            </section>
          </section>
        )}

        {activeTab === "gallery" && (
          <section className="panel gallery-panel">
            <div className="panel-heading">
              <h2>Visual Archive</h2>
              <span className="pill">{archiveImages.length} images</span>
            </div>
            <div className="gallery-grid">
              {archiveImages.map((img, i) => (
                <figure className="gallery-item" key={img}>
                  <img src={img} alt={`Archive image ${i + 1}`} loading="lazy" />
                </figure>
              ))}
            </div>
          </section>
        )}

        {activeTab === "uploads" && (
          <section className="panel upload-panel">
            <div className="panel-heading">
              <h2>Archive Uploads</h2>
              <span className="pill">{uploadStatus}</span>
            </div>

            <label className="upload-dropzone">
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.doc,.docx"
                onChange={handleUpload}
                disabled={isUploading}
              />
              <span className="upload-title">{isUploading ? "Uploading files" : "Choose pictures or letters"}</span>
              <span className="upload-copy">Images, PDFs, text files, and Word documents up to 20 MB each.</span>
            </label>

            <div className="upload-grid">
              {uploadedFiles.map((file) => (
                <article className="upload-item" key={file.name}>
                  {file.isImage ? (
                    <img src={file.url} alt={file.name} loading="lazy" />
                  ) : (
                    <div className="document-preview">Letter</div>
                  )}
                  <div className="upload-meta">
                    <a href={file.url} target="_blank" rel="noreferrer">{file.name}</a>
                    <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "diary" && (
          <section className="diary-layout">
            <form className="panel diary-editor" onSubmit={handleSaveDiary}>
              <div className="panel-heading">
                <h2>Diary</h2>
                <span className="pill">{diaryStatus}</span>
              </div>

              <div className="control-grid diary-controls">
                <label className="form-group">
                  <span>Title</span>
                  <input
                    type="text"
                    value={diaryTitle}
                    onChange={(e) => setDiaryTitle(e.target.value)}
                    placeholder="Moonlight note"
                  />
                </label>
                <label className="form-group">
                  <span>Kind</span>
                  <select value={diaryKind} onChange={(e) => setDiaryKind(e.target.value)}>
                    <option value="poem">Poem</option>
                    <option value="diary">Diary</option>
                    <option value="memory">Memory</option>
                    <option value="draft fragment">Draft Fragment</option>
                  </select>
                </label>
              </div>

              <label className="form-group">
                <span>Entry</span>
                <textarea
                  value={diaryContent}
                  onChange={(e) => setDiaryContent(e.target.value)}
                  placeholder="Write a poem, feeling, memory, or loose thought here."
                />
              </label>

              <div className="button-row">
                <button className="primary" type="submit" disabled={isSavingDiary || !diaryContent.trim()}>
                  {isSavingDiary ? "Saving" : "Save Entry"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setDiaryTitle("");
                    setDiaryContent("");
                  }}
                  disabled={isSavingDiary || (!diaryTitle && !diaryContent)}
                >
                  Clear
                </button>
              </div>
            </form>

            <section className="panel diary-list-panel">
              <div className="panel-heading">
                <h2>Saved</h2>
                <span className="pill">{diaryEntries.length} entries</span>
              </div>
              <div className="diary-list">
                {diaryEntries.map((entry) => (
                  <article className="diary-entry" key={entry.id}>
                    <div className="diary-entry-heading">
                      <h3>{entry.title}</h3>
                      <span>{entry.kind}</span>
                    </div>
                    <p>{entry.content}</p>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
