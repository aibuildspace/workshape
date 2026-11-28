"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string; links?: { id: string; name: string }[] };

export function HomeChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, pending]);

  function startFresh() {
    setMessages([]);
    setDraft("");
    setError("");
    inputRef.current?.focus();
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setError("");
    setPending(true);
    try {
      const history = [...messages.map(({ role, content }) => ({ role, content })),
        { role: "user" as const, content: question }].slice(-8);
      const response = await fetch("/api/home-chat", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Chat is unavailable. Try again later.");
        return;
      }
      setMessages((current) => [...current, { role: "user", content: question },
        { role: "assistant", content: result.answer, links: result.links }]);
      setDraft("");
    } catch {
      setError("Chat is unavailable. Try again later.");
    } finally {
      setPending(false);
    }
  }

  return <section className="panel home-chat" aria-labelledby="home-chat-title">
    <div className="home-panel-heading"><div><p className="home-eyebrow">Ask Workshape</p><h2 id="home-chat-title">AI chat</h2></div>
      {messages.length > 0 ? <button className="button button-text home-chat-fresh" type="button" onClick={startFresh}
        disabled={pending}>New chat</button> : <span className="home-chat-mark" aria-hidden="true">✦</span>}</div>
    <div className="home-chat-body" ref={bodyRef}>
      {messages.length ? <ol className="home-chat-messages" aria-live="polite" aria-relevant="additions">{messages.map((message, index) => <li
        key={index} className={`home-chat-message home-chat-${message.role}`}>
        <strong>{message.role === "user" ? "You" : "Workshape"}</strong><p>{message.content}</p>
        {message.links?.length ? <ul>{message.links.map((link) => <li key={link.id}>
          <Link className="text-link" href={`/processes/${link.id}/request?from=home`}>{link.name} <span aria-hidden="true">→</span></Link>
        </li>)}</ul> : null}
      </li>)}</ol> : <div className="home-chat-welcome">
        <p className="home-chat-intro">Ask which app fits your request or how a process works.</p>
        <div className="home-chat-prompts" aria-label="Suggested questions">
          {["Which apps are available?", "How do I start a request?"].map((question) =>
            <button className="home-chat-prompt" type="button" key={question} onClick={() => {
              setDraft(question); setError(""); inputRef.current?.focus();
            }}>{question}</button>)}
        </div>
      </div>}
      {pending && <p className="home-chat-thinking" role="status">Thinking…</p>}
    </div>
    <form ref={formRef} className="home-chat-form" onSubmit={send}>
      <label className="sr-only" htmlFor="home-chat-input">Ask Workshape</label>
      <textarea ref={inputRef} id="home-chat-input" rows={2} maxLength={1000} value={draft}
        onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (draft.trim() && !pending) formRef.current?.requestSubmit();
          }
        }} placeholder="Ask about an app or process…"
        disabled={pending} required />
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="home-chat-submit"><small>Enter to send · Shift+Enter for a new line</small>
        <button className="button button-primary" disabled={pending || !draft.trim()}>
          {pending ? "Sending…" : "Send"}</button></div>
      <p className="home-chat-disclaimer">Suggestions only. Published rules govern requests.</p>
    </form>
  </section>;
}
