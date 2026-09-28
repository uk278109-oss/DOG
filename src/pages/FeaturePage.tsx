import { useState, type ReactNode } from "react";
import { ArrowLeft, CalendarClock, Code2, FolderKanban, Image, Library, Puzzle, Sparkles, Crown, CheckCircle2, Download, Copy } from "lucide-react";
import DogLoader from "../components/DogLoader";
import type { AppPage } from "../types";
import { useAuth } from "../context/AuthContext";

const meta: Record<Exclude<AppPage,"home"|"account"|"images"|"code">,{title:string;desc:string;icon:ReactNode}> = {
  library:{title:"Library",desc:"",icon:<Library size={25}/>},
  projects:{title:"Projects",desc:"",icon:<FolderKanban size={25}/>},
  scheduled:{title:"Scheduled",desc:"",icon:<CalendarClock size={25}/>},
  plugins:{title:"Tools",desc:"",icon:<Puzzle size={25}/>},
  voice:{title:"Voice AI",desc:"",icon:<Sparkles size={25}/>},
  pro:{title:"DOG Pro",desc:"",icon:<Crown size={25}/>}
};

export default function FeaturePage({page,onNavigate}:{page:AppPage;onNavigate:(p:AppPage)=>void}) {
  if(page === "account") return <AccountPage onBack={()=>onNavigate("home")}/>;
  if(page === "pro") return <ProPage onBack={()=>onNavigate("home")}/>;
  if(page === "images") return <ImagePage onBack={()=>onNavigate("home")}/>;
  if(page === "code") return <CodePage onBack={()=>onNavigate("home")}/>;
  const item = meta[page as Exclude<AppPage,"home"|"account"|"images"|"code">];
  return <div className="feature-page"><header className="page-header"><button className="back-button" onClick={()=>onNavigate("home")}><ArrowLeft size={18}/> Home</button><div className="page-title">{item.icon}<div><h1>{item.title}</h1></div></div></header><section className="workspace-placeholder"><div className="placeholder-mark">{item.icon}</div><h2>{item.title}</h2><div className="quick-grid"><button onClick={()=>onNavigate("home")}><CheckCircle2 size={17}/> Back to chat</button></div></section></div>;
}

function CodePage({onBack}:{onBack:()=>void}) {
  const [prompt,setPrompt]=useState(""); const [answer,setAnswer]=useState(""); const [loading,setLoading]=useState(false);
  const readApiResponse=async(r:Response)=>{const raw=await r.text();let data:any;try{data=raw?JSON.parse(raw):{}}catch{throw new Error(raw?.trim()||`DOG server returned an invalid response (${r.status}).`)}if(!r.ok)throw new Error(data?.error||data?.message||`DOG server error (${r.status}).`);return data;};
  const run=async()=>{if(!prompt.trim()||loading)return;setLoading(true);setAnswer("");try{const request=`Act as DOG Code Builder. The user wants website code. First determine the platform and requirements from the user's request. If enough information is present, generate the actual working website code now, including the relevant files/components and setup instructions. If the request is broad but clearly asks for website code, make sensible standard assumptions and generate a complete starter implementation instead of stopping to ask questions. Never return JSON unless the user explicitly asks for JSON. User request:

${prompt.trim()}`;const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({message:request}),});const d=await readApiResponse(r);const answer=String(d?.text||"").trim();if(!answer)throw new Error("DOG returned an empty response.");setAnswer(answer)}catch(e){setAnswer(e instanceof Error?e.message:"DOG could not generate the code.")}finally{setLoading(false)}};
  return <div className="feature-page"><header className="page-header"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/> Home</button><div className="page-title"><Code2 size={25}/><div><h1>Code Builder</h1></div></div></header><section className="builder-panel"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the code you want to build, fix or refactor…"/><button className="primary-button builder-run" disabled={loading||!prompt.trim()} onClick={()=>void run()}>{loading?<><DogLoader size={30} label="DOG is coding…"/></>:<><Code2 size={17}/> Generate code</>}</button>{answer&&<div className="code-result"><div className="result-head"><strong>DOG</strong><button onClick={()=>void navigator.clipboard?.writeText(answer)}><Copy size={15}/> Copy</button></div><pre>{answer}</pre></div>}</section></div>;
}

function ImagePage({onBack}:{onBack:()=>void}) {
  const [prompt,setPrompt]=useState(""); const [image,setImage]=useState(""); const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const generate=async()=>{if(!prompt.trim()||loading)return;setLoading(true);setError("");setImage("");try{const r=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,aspectRatio:"1:1"})});const d=await r.json();if(!r.ok)throw new Error(d?.error||"Image generation failed.");setImage(`data:${d.mimeType};base64,${d.data}`)}catch(e){setError(e instanceof Error?e.message:"Image generation failed.")}finally{setLoading(false)}};
  return <div className="feature-page"><header className="page-header"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/> Home</button><div className="page-title"><Image size={25}/><div><h1>Image Creation</h1></div></div></header><section className="image-builder"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the image you want…"/><button className="primary-button builder-run" disabled={loading||!prompt.trim()} onClick={()=>void generate()}>{loading?<><DogLoader size={30} label="DOG is creating…"/></>:<><Sparkles size={17}/> Generate image</>}</button>{error&&<div className="error-box">{error}</div>}{image&&<div className="generated-image-card"><img src={image} alt={prompt}/><a className="secondary-button" href={image} download="dog-image.png"><Download size={16}/> Save image</a></div>}</section></div>;
}

function AccountPage({onBack}:{onBack:()=>void}) { const {user}=useAuth(); return <div className="feature-page"><header className="page-header"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/> Home</button><div className="page-title"><Sparkles size={25}/><div><h1>Account</h1></div></div></header><section className="workspace-placeholder account-workspace"><div className="avatar account-large">{(user?.displayName||user?.email||"U").slice(0,1).toUpperCase()}</div><h2>{user?.displayName || "DOG user"}</h2><p>{user?.email || "Your account email"}</p></section></div>; }
function ProPage({onBack}:{onBack:()=>void}) { return <div className="feature-page"><header className="page-header"><button className="back-button" onClick={onBack}><ArrowLeft size={18}/> Home</button><div className="page-title"><Crown size={25}/><div><h1>DOG Pro</h1><p>Early-access plan architecture. Billing can be connected later.</p></div></div></header><section className="pro-grid"><div className="plan-card"><div className="plan-label">FREE</div><h2>Starter</h2><div className="plan-price">PKR 0 <span>/ month</span></div><ul><li>Coding AI</li><li>Limited image generation</li><li>Basic projects</li></ul><button className="plan-button secondary-button">Current plan</button></div><div className="plan-card plan-featured"><div className="offer-badge">EARLY ACCESS</div><div className="plan-label">PRO</div><h2>Builder</h2><div className="plan-price">PKR 499 <span>/ month</span></div><p className="offer-copy">Payment is not active yet.</p><ul><li>Higher coding limits</li><li>Higher image limits</li><li>Larger project context</li><li>Advanced coding workflows</li></ul><button className="plan-button primary-button" disabled>Coming soon</button></div></section></div>; }
