import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptProgress, type AttemptState } from "../src/lib/attempt-progress";
const initial: AttemptState = {
  id: "attempt", revision: 0, status: "IN_PROGRESS", canSubmit: true,
  quiz: { title: "Synthetic quiz", shareSlug: "quiz", deadline: null },
  questions: [{ id: "q", prompt: "Question", marks: 1, options: [] }], answers: [],
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function harness() {
  let server = structuredClone(initial);
  const requests: { path: string; body: { revision: number; answers: AttemptState["answers"] } }[] = [];
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    if (!init?.method) return json(server);
    const body = JSON.parse(String(init.body));
    requests.push({ path, body });
    if (body.revision !== server.revision) return json({ error: "Your answers changed in another tab. Reload before saving." }, 409);
    server = { ...server, revision: server.revision + 1, answers: body.answers };
    if (path.endsWith("/submit")) server.status = "SUBMITTED";
    return json(server);
  });
  const submitted = vi.fn();
  const progress = new AttemptProgress("attempt", submitted, transport);
  return { progress, transport, submitted, requests, get server() { return server; } };
}
describe("assessment save coordination", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("debounces changes and only acknowledges server-saved choices", async () => {
    const h = harness(); await h.progress.load();
    h.progress.choose("q", "a"); h.progress.choose("q", "b");
    expect(h.progress.getSnapshot().dirty).toBe(true);
    expect(h.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(800);
    expect(h.requests).toHaveLength(1);
    expect(h.server.answers[0].selectedOptionId).toBe("b");
    expect(h.progress.getSnapshot()).toMatchObject({ dirty: false, saved: true });
    h.progress.dispose();
  });
  it("keeps edits made during a save and sends them using its acknowledged revision", async () => {
    const h = harness(); await h.progress.load();
    let release!: (response: Response) => void;
    h.transport.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    h.progress.choose("q", "a"); const first = h.progress.save();
    h.progress.choose("q", "b");
    expect(h.progress.save()).toBe(first);
    release(json({ revision: 1 })); await first;
    expect(h.progress.getSnapshot()).toMatchObject({ dirty: true, answers: { q: "b" } });
    // Model the first commit while its HTTP response was held.
    h.server.revision = 1;
    await vi.advanceTimersByTimeAsync(800);
    expect(h.requests[0].body).toMatchObject({ revision: 1, answers: [{ questionId: "q", selectedOptionId: "b" }] });
    expect(h.progress.getSnapshot().dirty).toBe(false); h.progress.dispose();
  });
  it("waits for the current save before submitting and prevents double clicks", async () => {
    const h = harness(); await h.progress.load();
    let release!: (response: Response) => void;
    h.transport.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    h.progress.choose("q", "a"); const saving = h.progress.save();
    const submitting = h.progress.submit(); await h.progress.submit();
    expect(h.requests).toHaveLength(0);
    h.server.revision = 1;
    release(json({ revision: 1 })); await saving; await submitting;
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]).toMatchObject({ path: "/api/attempts/attempt/submit", body: { revision: 1 } });
    expect(h.submitted).toHaveBeenCalledTimes(1); h.progress.dispose();
  });
  it("recovers a lost save acknowledgement without overwriting later local edits", async () => {
    const h = harness(); await h.progress.load();
    h.transport.mockImplementationOnce(async (_url, init) => {
      h.server.revision = 1;
      h.server.answers = JSON.parse(String(init?.body)).answers;
      h.progress.choose("q", "b");
      throw new TypeError("Connection lost after commit");
    });
    h.progress.choose("q", "a"); await h.progress.save();
    expect(h.progress.getSnapshot()).toMatchObject({ attempt: { revision: 1 }, dirty: true, answers: { q: "b" } });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.server.answers[0].selectedOptionId).toBe("b"); h.progress.dispose();
  });
  it("stops on revision conflicts and never retries by adopting another tab's answers", async () => {
    const h = harness(); await h.progress.load(); h.server.revision = 2;
    h.progress.choose("q", "a"); await h.progress.save();
    expect(h.progress.getSnapshot()).toMatchObject({ blocked: true, dirty: true, saved: false });
    h.progress.retry(); await vi.advanceTimersByTimeAsync(10000);
    expect(h.requests).toHaveLength(1); expect(h.server.answers).toEqual([]); h.progress.dispose();
  });
  it("bounds network retries and preserves unsaved answers until reconnect/manual retry", async () => {
    const h = harness(); await h.progress.load();
    h.transport.mockRejectedValue(new TypeError("Offline"));
    h.progress.choose("q", "a"); await h.progress.save();
    await vi.advanceTimersByTimeAsync(30000);
    expect(h.transport).toHaveBeenCalledTimes(9); // load + 4 writes and their reconciliation reads
    expect(h.progress.getSnapshot()).toMatchObject({ dirty: true, saved: false, blocked: false, answers: { q: "a" } });
    const count = h.transport.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000); expect(h.transport).toHaveBeenCalledTimes(count);
    h.progress.dispose();
  });
  it("never autosaves or fabricates a grade after an uncertain submission", async () => {
    const h = harness(); await h.progress.load(); h.progress.choose("q", "a");
    h.transport.mockRejectedValueOnce(new TypeError("Response lost"));
    await h.progress.submit();
    expect(h.submitted).not.toHaveBeenCalled();
    expect(h.progress.getSnapshot()).toMatchObject({ submissionUncertain: true, phase: "idle" });
    h.progress.choose("q", "b"); h.progress.retry(); await vi.advanceTimersByTimeAsync(10000);
    expect(h.requests).toHaveLength(0);
    expect(h.progress.getSnapshot().answers.q).toBe("a");
    await h.progress.submit(); expect(h.submitted).toHaveBeenCalledTimes(1); h.progress.dispose();
  });
  it("does not write queued changes after leaving the assessment", async () => {
    const h = harness(); await h.progress.load(); h.progress.choose("q", "a"); h.progress.dispose();
    await vi.advanceTimersByTimeAsync(5000); expect(h.requests).toHaveLength(0);
  });
});
