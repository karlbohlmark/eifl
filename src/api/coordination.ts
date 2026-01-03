import {
  createCoordinationSession,
  getCoordinationSession,
  updateCoordinationSessionStatus,
  joinCoordinationSession,
  getCoordinationParticipants,
  isParticipantInSession,
  createOrIncrementBarrier,
  getBarrier,
  getBarriers,
  sendSignal,
  getSignals,
  deleteCoordinationSession,
} from "../db/queries";
import type { Runner } from "../db/schema";

/**
 * POST /api/coordination/session
 * Create a new coordination session
 *
 * Body:
 * - session_id: string (unique identifier for the session)
 * - expected_participants: number (how many runners need to join)
 * - run_id?: number (optional run to associate with)
 * - expires_in_ms?: number (optional, defaults to 5 minutes)
 */
export async function handleCreateSession(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as {
    session_id: string;
    expected_participants: number;
    run_id?: number;
    expires_in_ms?: number;
  };

  if (!body.session_id || typeof body.session_id !== "string") {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }

  if (!body.expected_participants || body.expected_participants < 1) {
    return Response.json({ error: "expected_participants must be at least 1" }, { status: 400 });
  }

  // Check if session already exists
  const existing = getCoordinationSession(body.session_id);
  if (existing) {
    return Response.json({ error: "Session already exists" }, { status: 409 });
  }

  const session = createCoordinationSession(
    body.session_id,
    body.expected_participants,
    body.run_id,
    body.expires_in_ms
  );

  return Response.json(session, { status: 201 });
}

/**
 * GET /api/coordination/session/:sessionId
 * Get session status and participants
 */
export function handleGetSession(sessionId: string): Response {
  const session = getCoordinationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const participants = getCoordinationParticipants(sessionId);
  const barriers = getBarriers(sessionId);

  return Response.json({
    session,
    participants,
    barriers,
  });
}

/**
 * DELETE /api/coordination/session/:sessionId
 * Delete a coordination session and all associated data
 */
export function handleDeleteSession(runner: Runner, sessionId: string): Response {
  const session = getCoordinationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const deleted = deleteCoordinationSession(sessionId);
  if (!deleted) {
    return Response.json({ error: "Failed to delete session" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

/**
 * POST /api/coordination/join
 * Join a coordination session
 *
 * Body:
 * - session_id: string
 * - role?: string (optional role identifier like "sender" or "receiver")
 */
export async function handleJoin(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as {
    session_id: string;
    role?: string;
  };

  if (!body.session_id) {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }

  const session = getCoordinationSession(body.session_id);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "expired") {
    return Response.json({ error: "Session has expired" }, { status: 410 });
  }

  if (session.status === "completed") {
    return Response.json({ error: "Session has completed" }, { status: 410 });
  }

  const participant = joinCoordinationSession(body.session_id, runner.id, body.role);
  if (!participant) {
    return Response.json({ error: "Could not join session (full or already joined)" }, { status: 409 });
  }

  // Get updated session status
  const updatedSession = getCoordinationSession(body.session_id);
  const participants = getCoordinationParticipants(body.session_id);

  return Response.json({
    participant,
    session: updatedSession,
    participants,
    all_joined: updatedSession?.status === "active",
  });
}

/**
 * POST /api/coordination/barrier
 * Wait at a barrier until all participants arrive
 *
 * Body:
 * - session_id: string
 * - barrier_name: string
 * - expected_count?: number (defaults to session's expected_participants)
 * - poll?: boolean (if true, just check status without incrementing)
 */
export async function handleBarrier(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as {
    session_id: string;
    barrier_name: string;
    expected_count?: number;
    poll?: boolean;
  };

  if (!body.session_id || !body.barrier_name) {
    return Response.json({ error: "session_id and barrier_name are required" }, { status: 400 });
  }

  // Check if runner is a participant
  if (!isParticipantInSession(body.session_id, runner.id)) {
    return Response.json({ error: "Runner is not a participant in this session" }, { status: 403 });
  }

  if (body.poll) {
    // Just check barrier status without incrementing
    const barrier = getBarrier(body.session_id, body.barrier_name);
    if (!barrier) {
      return Response.json({
        exists: false,
        released: false,
        current_count: 0,
        expected_count: body.expected_count,
      });
    }
    return Response.json({
      exists: true,
      released: !!barrier.released,
      current_count: barrier.current_count,
      expected_count: barrier.expected_count,
    });
  }

  try {
    const { barrier, released } = createOrIncrementBarrier(
      body.session_id,
      body.barrier_name,
      body.expected_count
    );

    return Response.json({
      barrier,
      released,
      waiting: !released,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

/**
 * GET /api/coordination/barrier/:sessionId/:barrierName
 * Poll barrier status without incrementing
 */
export function handleGetBarrier(sessionId: string, barrierName: string): Response {
  const barrier = getBarrier(sessionId, barrierName);
  if (!barrier) {
    return Response.json({
      exists: false,
      released: false,
    });
  }

  return Response.json({
    exists: true,
    barrier,
    released: !!barrier.released,
  });
}

/**
 * POST /api/coordination/signal
 * Send a signal to other participants
 *
 * Body:
 * - session_id: string
 * - signal_name: string
 * - data?: any (JSON data to send)
 */
export async function handleSignal(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as {
    session_id: string;
    signal_name: string;
    data?: unknown;
  };

  if (!body.session_id || !body.signal_name) {
    return Response.json({ error: "session_id and signal_name are required" }, { status: 400 });
  }

  // Check if runner is a participant
  if (!isParticipantInSession(body.session_id, runner.id)) {
    return Response.json({ error: "Runner is not a participant in this session" }, { status: 403 });
  }

  const signal = sendSignal(
    body.session_id,
    body.signal_name,
    runner.id,
    body.data as string | object | undefined
  );

  return Response.json(signal, { status: 201 });
}

/**
 * GET /api/coordination/signals/:sessionId?name=...&after_id=...
 * Get signals for a session
 *
 * Query params:
 * - name?: string (filter by signal name)
 * - after_id?: number (only signals with id > after_id)
 */
export function handleGetSignals(sessionId: string, url: URL): Response {
  const signalName = url.searchParams.get("name") ?? undefined;
  const afterIdStr = url.searchParams.get("after_id");
  const afterId = afterIdStr ? parseInt(afterIdStr) : undefined;

  const signals = getSignals(sessionId, signalName, afterId);

  return Response.json({ signals });
}

/**
 * POST /api/coordination/complete
 * Mark a coordination session as complete
 *
 * Body:
 * - session_id: string
 */
export async function handleComplete(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as {
    session_id: string;
  };

  if (!body.session_id) {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }

  // Check if runner is a participant
  if (!isParticipantInSession(body.session_id, runner.id)) {
    return Response.json({ error: "Runner is not a participant in this session" }, { status: 403 });
  }

  const success = updateCoordinationSessionStatus(body.session_id, "completed");
  if (!success) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
