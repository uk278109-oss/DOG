import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Menu, Image as ImageIcon, Code2, Brain, UserCircle2, Copy, Plus, RotateCcw } from "lucide-react";
import DogLoader from "../components/DogLoader";
import ChatInput from "../components/ChatInput";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import type { AppPage } from "../types";

interface HomeProps{onOpenMenu:()=>void;onNavigate:(page:AppPage)=>void;onOpenAccount:()=>void;}
type Msg={role:"user"|"assistant";content:string};
function formatText(text:string){return text.split(/(```[\s\S]*?```)/g).map((part,i)=>part.startsWith("```")?<pre key={i}>{part.replace(/^```\w*\n?/ ,"").replace(/```$/,"\n")}</pre>:part.split(/\n\n+/).map((p,j)=><p key={`${i}-${j}`}>{p.replace(/^###\s+/gm,"").replace(/^##\s+/gm,"").replace(/^#\s+/gm,"")}</p>));}
function typeResponse(full:string,setMessages:Dispatch<SetStateAction<Msg[]>>,onDone:()=>Promise<void>,isCurrent:()=>boolean){
 let index=0;
 const step=()=>{if(!isCurrent())return;index=Math.min(full.length,index+Math.max(2,Math.ceil(full.length/140)));const partial=full.slice(0,index);setMessages(v=>{const next=[...v];const last=next[next.length-1];if(last?.role==="assistant")next[next.length-1]={role:"assistant",content:partial};else next.push({role:"assistant",content:partial});return next;});if(index<full.length)window.setTimeout(step,14);else void onDone();};
 step();
}

export default function Home({onOpenMenu,onNavigate,onOpenAccount}:HomeProps){
 const {user}=useAuth();
 const {memoryEnabled,activeChatId,setActiveChatId,createChat,loadMessages,saveMessage,chats}=useApp();
 const [messages,setMessages]=useState<Msg[]>([]);
 const [loading,setLoading]=useState(false);
 const [copied,setCopied]=useState<string|null>(null);
 const [newSession,setNewSession]=useState(true);
 const requestRef=useRef<AbortController|null>(null);
 const sessionRef=useRef(0);

 useEffect(()=>{
   let cancelled=false;
   setNewSession(!activeChatId);
   (async()=>{if(!activeChatId){setMessages([]);return;}const saved=await loadMessages(activeChatId);if(!cancelled){setMessages(saved.map(m=>({role:m.role,content:m.content})));setNewSession(false);}})();
   return()=>{cancelled=true;};
 },[activeChatId,loadMessages]);

 const startNewChat=()=>{
   sessionRef.current+=1;
   requestRef.current?.abort();
   requestRef.current=null;
   setLoading(false);
   setMessages([]);
   setCopied(null);
   setNewSession(true);
   setActiveChatId(null);
 };

 const handleSend=async(message:string)=>{
   const requestId=++sessionRef.current;
   const cleanMessage=message.trim();
   if(!cleanMessage)return;

   // Put the user's message on screen before any Firebase/API operation.
   setNewSession(false);
   setMessages(v=>[...v,{role:"user",content:cleanMessage}]);
   setLoading(true);

   let chatId=activeChatId;
   try{
     // A fresh discussion gets its chat document first, but we do not switch
     // the active-chat loader until the user's message has been persisted.
     if(!chatId){
       chatId=await createChat(cleanMessage.slice(0,45)||"New chat");
       if(!chatId)throw new Error("DOG could not create the conversation. Check Firebase configuration and permissions.");
     }

     if(requestId!==sessionRef.current)return;

     try{
       await saveMessage(chatId,"user",cleanMessage);
     }catch(error){
       throw new Error(`Your message could not be saved: ${error instanceof Error?error.message:"Firebase save failed."}`);
     }

     // Now it is safe to make this chat the active persisted chat.
     setActiveChatId(chatId);

     const history=[...messages.slice(-12),{role:"user",content:cleanMessage}]
       .map(m=>({role:m.role,content:m.content}));

     const controller=new AbortController();
     requestRef.current=controller;
     const responseTimeout=window.setTimeout(()=>controller.abort(),35000);

     try{
       const r=await fetch("/api/chat",{
         method:"POST",
         headers:{"Content-Type":"application/json","Accept":"application/json"},
         body:JSON.stringify({message:cleanMessage,history}),
         signal:controller.signal
       });

       const raw=await r.text();
       let data:any={};
       if(raw.trim()){
         try{data=JSON.parse(raw);}
         catch{throw new Error(raw.trim().slice(0,1000)||`DOG server returned an invalid response (${r.status}).`);}
       }
       if(!r.ok)throw new Error(data?.error||data?.message||`DOG could not get a response (${r.status}).`);

       const answer=String(data?.text||"").trim();
       if(!answer)throw new Error("DOG returned an empty response. Check the AI API configuration.");

       await new Promise<void>(resolve=>{
         typeResponse(
           answer,
           setMessages,
           async()=>{
             if(requestId===sessionRef.current){
               try{await saveMessage(chatId!,"assistant",answer);}
               catch(error){
                 setMessages(v=>[...v,{role:"assistant",content:`DOG replied, but saving the response failed: ${error instanceof Error?error.message:"Firebase save failed."}`}]);
               }
             }
             resolve();
           },
           ()=>requestId===sessionRef.current
         );
       });
     }finally{
       window.clearTimeout(responseTimeout);
     }
   }catch(error){
     if(requestId!==sessionRef.current)return;
     const text=(error instanceof Error && error.name==="AbortError")
       ?"DOG took too long to respond. Please try again."
       :(error instanceof Error?error.message:"DOG could not send your message.");
     setMessages(v=>[...v,{role:"assistant",content:text}]);
     if(chatId){
       try{await saveMessage(chatId,"assistant",text);}catch{}
     }
   }finally{
     if(requestId===sessionRef.current){
       setLoading(false);
       requestRef.current=null;
     }
   }
 };

 const activeTitle=chats.find(c=>c.id===activeChatId)?.title||"New discussion";
 const inChat=!newSession;
 return <div className={`home ${inChat?"chat-active":"home-idle"}`}>
  <header className="mobile-header"><button className="menu-button" onClick={onOpenMenu} aria-label="Open menu"><Menu size={25}/></button><div className="mobile-brand">DOG</div><button className="mobile-profile-button" onClick={onOpenAccount} aria-label="Open account"><UserCircle2 size={25}/></button></header>
  {!inChat&&<><section className="feature-section"><button className="feature-card compact-feature" onClick={()=>onNavigate("images")}><div className="feature-icon"><ImageIcon size={26}/></div><div className="feature-title">Image Creation</div></button><button className="feature-card compact-feature" onClick={()=>onNavigate("code")}><div className="feature-icon"><Code2 size={26}/></div><div className="feature-title">Code Builder</div></button></section><section className="hero-section"><DogLoader size={92}/><h1>Hello, {user?.displayName?.split(" ")[0]||"there"}.<br/>What are you building?</h1>{memoryEnabled&&<div className="memory-hint"><Brain size={16}/> Memory is on</div>}</section></>}
  {inChat&&<section className="discussion-screen"><div className="discussion-head"><strong>{activeTitle}</strong><button onClick={startNewChat}><Plus size={16}/> New discussion</button></div><div className="discussion-messages">{messages.length===0&&!loading&&<div className="empty-discussion"><DogLoader size={78}/><h2>New discussion</h2><button className="reset-discussion" onClick={startNewChat}><RotateCcw size={14}/> Start again</button></div>}{messages.map((m,i)=><div className={`message-bubble ${m.role}`} key={`${i}-${m.content.slice(0,8)}`}><div className="preview-label">{m.role==="user"?"You":"DOG"}</div><div className="preview-message">{m.role==="assistant"?formatText(m.content):<p>{m.content}</p>}</div>{m.role==="assistant"&&<button className="copy-response" onClick={()=>{void navigator.clipboard?.writeText(m.content);setCopied(String(i));setTimeout(()=>setCopied(null),1200)}}><Copy size={14}/> {copied===String(i)?"Copied":"Copy"}</button>}</div>)}{loading&&<div className="ai-loading"><DogLoader size={46} label="DOG is thinking…"/></div>}</div></section>}
  <section className={`chat-section ${inChat?"chat-section-active":""}`}><ChatInput onSend={handleSend} disabled={loading}/></section>
 </div>;
}
