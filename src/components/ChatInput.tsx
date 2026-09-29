import { useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, Paperclip, Plus, Send, Sparkles, X } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled = false, placeholder = "Ask DOG" }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [thinkHarder, setThinkHarder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    setMessage("");
    await onSend(thinkHarder ? `${trimmed}\n\n[Think harder]` : trimmed);
  };

  const handleFile = async (file?: File) => {
    if (!file || disabled) return;
    if (file.type.startsWith("image/")) {
      setMessage(prev => `${prev}${prev ? "\n\n" : ""}[Attached image: ${file.name}]`);
      return;
    }
    if (!file.type.startsWith("text/") && !/\.(md|mdx|json|js|jsx|ts|tsx|css|html|xml|py|java|kt|swift|sql|sh|yml|yaml|txt)$/i.test(file.name)) {
      setMessage(prev => `${prev}${prev ? "\n\n" : ""}[Attached file: ${file.name}]\nThis file type cannot be read directly in the browser.`);
      return;
    }
    try {
      const text = await file.text();
      setMessage(prev => `${prev}${prev ? "\n\n" : ""}[Attached: ${file.name}]\n\`\`\`\n${text.slice(0, 120000)}\n\`\`\``);
    } catch {
      setMessage(prev => `${prev}${prev ? "\n\n" : ""}[Could not read ${file.name}]`);
    }
  };

  const pick = (kind: "camera" | "photos" | "files") => {
    setSheetOpen(false);
    window.setTimeout(() => {
      if (kind === "camera") cameraInputRef.current?.click();
      if (kind === "photos") photoInputRef.current?.click();
      if (kind === "files") fileInputRef.current?.click();
    }, 80);
  };

  return (
    <div className="chat-input-area">
      <form className="chat-input-wrapper" onSubmit={e => { e.preventDefault(); void handleSend(); }}>
        <input ref={cameraInputRef} type="file" hidden accept="image/*" capture="environment" onChange={e => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <input ref={photoInputRef} type="file" hidden accept="image/*" onChange={e => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <input ref={fileInputRef} type="file" hidden accept=".txt,.md,.mdx,.json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.py,.java,.kt,.swift,.sql,.sh,.yml,.yaml,text/*" onChange={e => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <button type="button" className="input-action" aria-label="Open attachments" disabled={disabled} onClick={() => setSheetOpen(true)}><Plus size={21} /></button>
        <input value={message} placeholder={placeholder} disabled={disabled} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <button type="button" className={`think-button ${thinkHarder ? "active" : ""}`} title="Think harder" onClick={() => setThinkHarder(v => !v)} disabled={disabled}><Sparkles size={17} /></button>
        <button type="submit" className="send-button" disabled={disabled || !message.trim()} aria-label="Send"><Send size={19} /></button>
      </form>
      {sheetOpen && <div className="attachment-layer" onClick={() => setSheetOpen(false)}>
        <div className="attachment-sheet" onClick={e => e.stopPropagation()}>
          <div className="attachment-head"><strong>Add to discussion</strong><button onClick={() => setSheetOpen(false)} aria-label="Close"><X size={19}/></button></div>
          <div className="attachment-grid">
            <button onClick={() => pick("camera")}><Camera size={22}/><span>Camera</span></button>
            <button onClick={() => pick("photos")}><ImageIcon size={22}/><span>Photos</span></button>
            <button onClick={() => pick("files")}><FileText size={22}/><span>Files</span></button>
            <button onClick={() => { setSheetOpen(false); setThinkHarder(true); }}><Sparkles size={22}/><span>Think harder</span></button>
            <button onClick={() => setSheetOpen(false)}><Paperclip size={22}/><span>Plugins</span></button>
          </div>
          <small>Attachments stay inside this discussion.</small>
        </div>
      </div>}
    </div>
  );
}
