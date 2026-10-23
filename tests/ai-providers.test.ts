import { describe, expect, it, afterEach } from "vitest";
import { fromChatCompletions, aiProviderConfig } from "../src/lib/ai-providers";

const transcript = "JavaScript const defines a binding that cannot be reassigned. " +
  "JavaScript let defines a binding that can be reassigned. " +
  "The function keyword declares a function. The var keyword declares a variable. ".repeat(3);
const question = {
  prompt: "Which JavaScript keyword prevents reassignment of a binding?",
  options: ["const","let","var","function"],
  correctIndex: 0,
  explanation: "JavaScript const defines a binding that cannot be reassigned.",
  sourceExcerpt: "JavaScript const defines a binding that cannot be reassigned.",
};

afterEach(()=>{delete process.env.OPENROUTER_API_KEY;delete process.env.XAI_API_KEY;});

describe("chat-completion providers",()=>{
 it("never calls the provider when no key is configured",async ()=>{
   let called=false;
   await expect(fromChatCompletions("openrouter",transcript,1,"beginner",
     (async()=>{called=true;throw Error("unexpected");}) as typeof fetch)).rejects.toMatchObject({status:503});
   expect(called).toBe(false);
 });
 it("uses fixed OpenRouter endpoint, server credential and schema, returning only grounded questions",async ()=>{
   process.env.OPENROUTER_API_KEY="test-not-real";
   const fetcher=(async (url:string,init:RequestInit)=>{
     expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
     expect((init.headers as Record<string,string>).authorization).toBe("Bearer test-not-real");
     const payload=JSON.parse(init.body as string);
     expect(payload.provider.require_parameters).toBe(true);
     expect(payload.response_format.type).toBe("json_schema");
     return Response.json({choices:[{message:{content:JSON.stringify({questions:[question]})}}],usage:{prompt_tokens:90,completion_tokens:30}});
   }) as typeof fetch;
   const result=await fromChatCompletions("openrouter",transcript,1,"intermediate",fetcher);
   expect(result).toMatchObject({provider:"openrouter",inputTokens:90,outputTokens:30});
   expect(result.questions[0].correctIndex).toBe(0);
 });
 it("allows explicit Grok selection but rejects ungrounded output",async ()=>{
   process.env.XAI_API_KEY="fake";
   expect(aiProviderConfig("grok").model).toBe("grok-4.3");
   const fetcher=(async()=>Response.json({choices:[{message:{content:JSON.stringify({
     questions:[{...question,sourceExcerpt:"This text is absent from the transcript"}]
   })}}]})) as typeof fetch;
   await expect(fromChatCompletions("grok",transcript,1,"advanced",fetcher)).rejects.toMatchObject({status:422});
 });
 it("reports provider exhaustion without leaking provider response or key",async ()=>{
   process.env.OPENROUTER_API_KEY="secret-do-not-log";
   const response=await fromChatCompletions("openrouter",transcript,1,"beginner",
     (async()=>new Response('{"message":"private billing data"}',{status:402})) as typeof fetch).catch(e=>e);
   expect(response.status).toBe(503);
   expect(String(response.message)).not.toContain("private billing data");
   expect(String(response.message)).not.toContain("secret-do-not-log");
 });
});
