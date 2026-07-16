import { test, expect } from "@playwright/test";

const API_ENDPOINT = "/api/events";

// The SSE test stashes state on `window` for Playwright to read back across
// page.evaluate / waitForFunction boundaries. This alias names that augmented
// shape once instead of repeating the intersection cast at every access. It is
// compile-time only, so referencing it inside browser-context callbacks is fine.
type TestWindow = Window &
  typeof globalThis & {
    sseReceivedData?: string[];
    eventSource?: EventSource;
  };

test.describe("API Robustness - POST /api/events", () => {
  test("should return 400 for empty payload", async ({ request }) => {
    const response = await request.post(API_ENDPOINT, { data: {} });
    expect(response.status()).toBe(400);
  });

  test("should return 400 for missing 'type' field", async ({ request }) => {
    const response = await request.post(API_ENDPOINT, {
      data: { id: "test", key: "g" },
    });
    expect(response.status()).toBe(400);
  });

  test("should return 400 for invalid 'type' field", async ({ request }) => {
    const response = await request.post(API_ENDPOINT, {
      data: { type: "invalidType", id: "test" },
    });
    expect(response.status()).toBe(400);
  });

  test.describe("Eye Update Event Validation", () => {
    test("should return 400 for missing 'id' in eye event", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: { type: "eyeUpdate", p: [1, 2, 3], t: Date.now() },
      });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for missing 'p' in eye event", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: { type: "eyeUpdate", id: "test", t: Date.now() },
      });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for 'p' not an array in eye event", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: {
          type: "eyeUpdate",
          id: "test",
          p: "not-an-array",
          t: Date.now(),
        },
      });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for 'p' not an array of 3 numbers", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: { type: "eyeUpdate", id: "test", p: [1, 2], t: Date.now() },
      });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for 'p' with non-number elements", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: {
          type: "eyeUpdate",
          id: "test",
          p: [1, "a", 3],
          t: Date.now(),
        },
      });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for missing 't' in eye event", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: { type: "eyeUpdate", id: "test", p: [1, 2, 3] },
      });
      expect(response.status()).toBe(400);
    });

    test("should return 200 for valid eye event", async ({ request }) => {
      const response = await request.post(API_ENDPOINT, {
        data: {
          type: "eyeUpdate",
          id: "test-valid-eye",
          p: [1, 2, 3],
          t: Date.now(),
        },
      });
      expect(response.ok()).toBeTruthy();
    });

    test("should return 200 for valid eye event with only lookAt (l)", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: {
          type: "eyeUpdate",
          id: "test-valid-eye-lookat",
          l: [4, 5, 6],
          t: Date.now(),
        },
      });
      expect(response.ok()).toBeTruthy();
    });

    test("should return 200 for valid eye event with position (p) and lookAt (l)", async ({
      request,
    }) => {
      const response = await request.post(API_ENDPOINT, {
        data: {
          type: "eyeUpdate",
          id: "test-valid-eye-both",
          p: [1, 2, 3],
          l: [4, 5, 6],
          t: Date.now(),
        },
      });
      expect(response.ok()).toBeTruthy();
    });
  });
});

test.describe("API Robustness - POST /api/events - Chat Message Event", () => {
  test("should return 400 for missing 'text' in chat event", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      data: {
        type: "chatMessage",
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        userId: "user1",
        timestamp: Date.now(),
      },
    });
    expect(response.status()).toBe(400);
  });

  test("should return 400 for 'text' not a string in chat event", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      data: {
        type: "chatMessage",
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d480",
        userId: "user2",
        text: 123,
        timestamp: Date.now(),
      },
    });
    expect(response.status()).toBe(400);
  });

  test("should return 200 for valid chat event", async ({ request }) => {
    const response = await request.post(API_ENDPOINT, {
      data: {
        type: "chatMessage",
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d481",
        userId: "user3",
        text: "Hello, world!",
        timestamp: Date.now(),
      },
    });
    expect(response.ok()).toBeTruthy();
  });
});

test.describe("API Robustness - GET /api/events SSE", () => {
  test("should establish SSE connection and receive events", async ({
    page,
  }) => {
    await page.goto("/"); // Go to a page to establish the SSE connection context

    // Evaluate in browser context to set up SSE
    await page.evaluate((apiUrl) => {
      const eventSource = new EventSource(apiUrl);
      eventSource.onmessage = (event) => {
        // Store received data on window for Playwright to access
        (window as TestWindow).sseReceivedData =
          (window as TestWindow).sseReceivedData || [];
        (window as TestWindow).sseReceivedData!.push(event.data);
      };
      eventSource.onerror = (err) => {
        console.error("SSE error:", err);
        eventSource.close(); // Close on error to prevent infinite retries in test
      };
      // Store eventSource on window to close it later if needed
      (window as TestWindow).eventSource = eventSource;
    }, API_ENDPOINT);

    // Wait a moment for the connection to be established
    await page.waitForTimeout(500);

    const testEvent = {
      type: "chatMessage",
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d482",
      userId: "user-sse",
      text: "SSE Hello",
      timestamp: Date.now(),
    };

    // Send an event using the API
    const postResponse = await page.request.post(API_ENDPOINT, {
      data: testEvent,
    });
    expect(postResponse.ok()).toBeTruthy();

    // Wait for the event to be processed and sent via SSE
    await page
      .waitForFunction(
        (expectedEventId) => {
          const receivedEvents = (window as TestWindow).sseReceivedData || [];
          return receivedEvents.some((eventString) => {
            try {
              const eventData = JSON.parse(eventString);
              return eventData.id === expectedEventId;
            } catch {
              return false;
            }
          });
        },
        testEvent.id, // Pass only the ID to the function
        { timeout: 5000 }, // Adjust timeout as needed
      )
      .catch((e) => {
        console.error("waitForFunction failed:", e);
        throw e; // Re-throw to fail the test
      });

    // Read the stash back into Playwright's context and assert on the payload
    const sseEvents = await page.evaluate(
      () => (window as TestWindow).sseReceivedData ?? [],
    );
    const receivedEvent = sseEvents.find((e) => e.includes(testEvent.id));
    expect(receivedEvent).toBeDefined();
    if (receivedEvent) {
      expect(JSON.parse(receivedEvent)).toMatchObject(testEvent);
    }

    // Clean up: Close the SSE connection
    await page.evaluate(() => {
      (window as TestWindow)?.eventSource?.close();
    });
  });
});
