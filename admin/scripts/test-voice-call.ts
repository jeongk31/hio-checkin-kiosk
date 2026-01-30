/**
 * Voice Call Test Script
 *
 * Run with: npx ts-node scripts/test-voice-call.ts
 * Or: npx tsx scripts/test-voice-call.ts
 *
 * Make sure the dev server is running on localhost:3000
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 Running: ${name}`);
  try {
    await testFn();
    const duration = Date.now() - start;
    console.log(`   ✅ PASSED (${duration}ms)`);
    results.push({ name, passed: true, duration });
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ FAILED: ${errorMsg}`);
    results.push({ name, passed: false, error: errorMsg, duration });
  }
}

// ==================== Test Cases ====================

async function testSignalingApiPost(): Promise<void> {
  const sessionId = `test-${Date.now()}`;

  // Test POST - send message
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'test-message' },
      sender: 'test-sender',
    }),
  });
}

async function testSignalingApiGet(): Promise<void> {
  const sessionId = `test-get-${Date.now()}`;

  // First, post a message
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'test-message' },
      sender: 'admin',
    }),
  });

  // Then, poll for messages (excluding our own sender)
  const result = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=kiosk`
  ) as { messages: unknown[] };

  if (!result.messages || result.messages.length === 0) {
    throw new Error('Expected to receive the message');
  }
}

async function testSignalingExcludeSender(): Promise<void> {
  const sessionId = `test-exclude-${Date.now()}`;

  // Post a message from 'admin'
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'test-message' },
      sender: 'admin',
    }),
  });

  // Poll excluding 'admin' - should get no messages
  const result = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=admin`
  ) as { messages: unknown[] };

  if (result.messages && result.messages.length > 0) {
    throw new Error('Should not receive own messages when excluded');
  }
}

async function testSignalingDelete(): Promise<void> {
  const sessionId = `test-delete-${Date.now()}`;

  // Post a message
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'test-message' },
      sender: 'test',
    }),
  });

  // Delete messages
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'DELETE',
    body: JSON.stringify({ sessionId }),
  });

  // Poll - should be empty
  const result = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0`
  ) as { messages: unknown[] };

  if (result.messages && result.messages.length > 0) {
    throw new Error('Messages should have been deleted');
  }
}

async function testSignalingFlowKioskToAdmin(): Promise<void> {
  const sessionId = `test-flow-k2a-${Date.now()}`;

  // Simulate: Admin sends call-answered
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'call-answered' },
      sender: 'admin',
    }),
  });

  // Kiosk polls and receives call-answered
  const kioskPoll1 = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=kiosk`
  ) as { messages: Array<{ payload: { type: string } }> };

  if (!kioskPoll1.messages.some(m => m.payload.type === 'call-answered')) {
    throw new Error('Kiosk should receive call-answered');
  }

  // Kiosk sends offer
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'offer', sdp: 'fake-sdp' },
      sender: 'kiosk',
    }),
  });

  // Admin polls and receives offer
  const adminPoll = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=admin`
  ) as { messages: Array<{ payload: { type: string } }> };

  if (!adminPoll.messages.some(m => m.payload.type === 'offer')) {
    throw new Error('Admin should receive offer');
  }

  // Admin sends answer
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'answer', sdp: 'fake-answer-sdp' },
      sender: 'admin',
    }),
  });

  // Kiosk polls and receives answer
  const kioskPoll2 = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=kiosk`
  ) as { messages: Array<{ payload: { type: string } }> };

  if (!kioskPoll2.messages.some(m => m.payload.type === 'answer')) {
    throw new Error('Kiosk should receive answer');
  }
}

async function testSignalingFlowAdminToKiosk(): Promise<void> {
  const sessionId = `test-flow-a2k-${Date.now()}`;

  // Kiosk sends call-answered (kiosk received incoming call and answered)
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'call-answered' },
      sender: 'kiosk',
    }),
  });

  // Admin polls and receives call-answered
  const adminPoll1 = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=admin`
  ) as { messages: Array<{ payload: { type: string } }> };

  if (!adminPoll1.messages.some(m => m.payload.type === 'call-answered')) {
    throw new Error('Admin should receive call-answered from kiosk');
  }

  // Admin sends offer (after receiving call-answered)
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'offer', sdp: 'fake-sdp' },
      sender: 'admin',
    }),
  });

  // Kiosk polls and receives offer
  const kioskPoll = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=kiosk`
  ) as { messages: Array<{ payload: { type: string } }> };

  if (!kioskPoll.messages.some(m => m.payload.type === 'offer')) {
    throw new Error('Kiosk should receive offer');
  }

  // Kiosk sends answer
  await fetchJson(`${BASE_URL}/api/signaling`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      payload: { type: 'answer', sdp: 'fake-answer-sdp' },
      sender: 'kiosk',
    }),
  });

  // Admin polls and receives answer
  const adminPoll2 = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=admin`
  ) as { messages: Array<{ payload: { type: string } }> };

  if (!adminPoll2.messages.some(m => m.payload.type === 'answer')) {
    throw new Error('Admin should receive answer');
  }
}

async function testNoEchoMessages(): Promise<void> {
  const sessionId = `test-no-echo-${Date.now()}`;

  // Admin sends multiple messages
  for (const type of ['call-answered', 'offer', 'answer', 'ice-candidate']) {
    await fetchJson(`${BASE_URL}/api/signaling`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        payload: { type },
        sender: 'admin',
      }),
    });
  }

  // Admin polls with excludeSender=admin - should get nothing
  const adminPoll = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=admin`
  ) as { messages: unknown[] };

  if (adminPoll.messages && adminPoll.messages.length > 0) {
    throw new Error(`Admin should not receive own messages, got ${adminPoll.messages.length}`);
  }

  // Kiosk polls - should get all admin messages
  const kioskPoll = await fetchJson(
    `${BASE_URL}/api/signaling?sessionId=${sessionId}&lastId=0&excludeSender=kiosk`
  ) as { messages: unknown[] };

  if (!kioskPoll.messages || kioskPoll.messages.length !== 4) {
    throw new Error(`Kiosk should receive 4 messages, got ${kioskPoll.messages?.length || 0}`);
  }
}

// ==================== Main ====================

async function main(): Promise<void> {
  console.log('🚀 Voice Call API Test Suite');
  console.log(`   Testing against: ${BASE_URL}`);
  console.log('='.repeat(50));

  // Run all tests
  await runTest('Signaling API - POST message', testSignalingApiPost);
  await runTest('Signaling API - GET messages', testSignalingApiGet);
  await runTest('Signaling API - Exclude sender', testSignalingExcludeSender);
  await runTest('Signaling API - DELETE messages', testSignalingDelete);
  await runTest('Signaling Flow - Kiosk → Admin', testSignalingFlowKioskToAdmin);
  await runTest('Signaling Flow - Admin → Kiosk', testSignalingFlowAdminToKiosk);
  await runTest('No Echo - Sender exclusion works', testNoEchoMessages);

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(50));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  console.log('\n' + '-'.repeat(50));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
