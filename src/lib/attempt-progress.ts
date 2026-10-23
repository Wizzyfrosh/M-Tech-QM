// Browser-side save coordinator. Scores and authorization remain on the server.
export type AttemptState = {
  id: string; revision: number; status: "IN_PROGRESS" | "SUBMITTED"; canSubmit: boolean;
  quiz: { title: string; shareSlug: string; deadline: string | null };
  questions: { id: string; prompt: string; marks: number;
    options: { id: string; text: string; position: number }[] }[];
  answers: { questionId: string; selectedOptionId: string | null }[];
};
type ProgressState = {
  attempt: AttemptState | null; answers: Record<string, string | null>;
  phase: "loading" | "idle" | "saving" | "submitting" | "submitted";
  dirty: boolean; saved: boolean; error: string; blocked: boolean; submissionUncertain: boolean;
};
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export class AttemptProgress {
  private state: ProgressState = { attempt: null, answers: {}, phase: "loading",
    dirty: false, saved: false, error: "", blocked: false, submissionUncertain: false };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;
  private submitting = false;
  private version = 0;
  private retries = 0;
  private epoch = 0;
  private active = false;
  constructor(private id: string, private onSubmitted: () => void,
    private transport: typeof fetch = (input, init) => fetch(input, init)) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ProgressState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private async request(path = "", init?: RequestInit) {
    const response = await this.transport(`/api/attempts/${this.id}${path}`, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new RequestError(data.error || "Unable to update this assessment.", response.status);
    return data;
  }
  async load() {
    this.active = true;
    const epoch = ++this.epoch;
    try {
      const attempt: AttemptState = await this.request();
      if (!this.active || epoch !== this.epoch) return;
      if (attempt.status === "SUBMITTED") { this.onSubmitted(); return; }
      this.update({ attempt, answers: Object.fromEntries(attempt.answers.map(a => [a.questionId, a.selectedOptionId])), phase: "idle" });
    } catch (error) {
      if (epoch === this.epoch) this.update({ phase: "idle", error: error instanceof Error ? error.message : "Unable to load quiz. Please reload." });
    }
  }
  dispose() { this.active = false; this.epoch++; clearTimeout(this.timer); }
  private schedule(delay = 800) {
    clearTimeout(this.timer);
    if (this.active && this.state.dirty && !this.state.blocked && !this.submitting && !this.state.submissionUncertain)
      this.timer = setTimeout(() => { void this.save(); }, delay);
  }
  choose(questionId: string, selectedOptionId: string | null) {
    if (!this.active || !this.state.attempt?.canSubmit || this.state.blocked || this.submitting || this.state.submissionUncertain) return;
    this.version++;
    this.retries = 0;
    this.update({ answers: { ...this.state.answers, [questionId]: selectedOptionId }, dirty: true, saved: false, error: "" });
    this.schedule();
  }
  retry = () => { this.retries = 0; void this.save(); };
  save(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inFlight) return this.inFlight;
    if (!this.active || !this.state.attempt?.canSubmit || !this.state.dirty || this.state.blocked || this.submitting || this.state.submissionUncertain) return Promise.resolve();
    this.inFlight = this.writeSave().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
  private async writeSave() {
    const epoch = this.epoch;
    const attempt = this.state.attempt!;
    const version = this.version;
    const answers = attempt.questions.map(q => ({ questionId: q.id, selectedOptionId: this.state.answers[q.id] ?? null }));
    this.update({ phase: "saving", error: "" });
    try {
      let revision: number;
      try {
        const data = await this.request("/answers", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: attempt.revision, answers }) });
        revision = data.revision;
      } catch (error) {
        if (error instanceof RequestError && error.status < 500) throw error;
        // A response can be lost after commit. Reconcile this exact snapshot before
        // retrying; never adopt a different tab's revision and overwrite its work.
        const server: AttemptState = await this.request();
        if (server.status === "SUBMITTED") { if (this.active && epoch === this.epoch) { this.update({ phase: "submitted", dirty: false }); this.onSubmitted(); } return; }
        const saved = new Map(server.answers.map(a => [a.questionId, a.selectedOptionId]));
        if (server.revision === attempt.revision + 1 && answers.every(a => (saved.get(a.questionId) ?? null) === a.selectedOptionId)) {
          revision = server.revision;
        } else if (server.revision !== attempt.revision) {
          throw new RequestError("Your answers changed in another tab. Reload before continuing.", 409);
        } else { throw error; }
      }
      if (!this.active || epoch !== this.epoch) return;
      this.retries = 0;
      const dirty = version !== this.version;
      this.update({ attempt: { ...attempt, revision }, dirty, saved: !dirty, phase: this.submitting ? "submitting" : "idle", error: "" });
      if (dirty) this.schedule();
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return;
      const blocked = error instanceof RequestError && error.status < 500;
      this.update({ phase: "idle", blocked, error: blocked ? error.message : "Answers not saved. Check your connection, then choose Save progress. Keep this page open." });
      if (!blocked && this.retries++ < 3) this.schedule(1000 * 2 ** (this.retries - 1));
    }
  }
  async submit() {
    if (!this.active || this.submitting || !this.state.attempt?.canSubmit || this.state.blocked) return;
    this.submitting = true;
    this.update({ phase: "submitting", error: "" });
    clearTimeout(this.timer);
    // Wait for the active save's acknowledgement before using its new revision.
    await this.inFlight;
    if (!this.active || this.state.blocked) { this.submitting = false; return; }
    const epoch = this.epoch;
    const attempt = this.state.attempt!;
    this.update({ phase: "submitting", error: "" });
    try {
      await this.request("/submit", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: attempt.revision,
          answers: attempt.questions.map(q => ({ questionId: q.id, selectedOptionId: this.state.answers[q.id] ?? null })) }) });
      if (!this.active || epoch !== this.epoch) return;
      this.update({ phase: "submitted", dirty: false, submissionUncertain: false });
      this.onSubmitted();
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return;
      const blocked = error instanceof RequestError && error.status < 500;
      this.update({ phase: "idle", blocked, submissionUncertain: !blocked,
        error: blocked ? error.message : "Submission not confirmed. Keep this page open and retry submission to confirm your result." });
    } finally { this.submitting = false; }
  }
}
