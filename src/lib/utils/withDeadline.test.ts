import { describe, it, expect, vi } from "vitest";
import { DeadlineExceededError, withDeadline } from "./withDeadline";

const resolveAfter = <T,>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("withDeadline", () => {
  it("passes through a value that settles in time", async () => {
    await expect(withDeadline(resolveAfter(5, "ok"), 200, "test")).resolves.toBe("ok");
  });

  it("rejects with DeadlineExceededError when the promise is too slow", async () => {
    await expect(withDeadline(resolveAfter(200, "late"), 20, "test")).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
  });

  it("names the label and timeout in the error", async () => {
    await expect(withDeadline(resolveAfter(200, "late"), 20, "runOneShot")).rejects.toThrow(
      /runOneShot exceeded its 20ms deadline/,
    );
  });

  it("propagates the original rejection rather than a timeout", async () => {
    const boom = Promise.reject(new Error("upstream failure"));
    await expect(withDeadline(boom, 200, "test")).rejects.toThrow("upstream failure");
  });

  it("rejects immediately when there is no budget left", async () => {
    await expect(withDeadline(resolveAfter(5, "ok"), 0, "test")).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
    await expect(withDeadline(resolveAfter(5, "ok"), -100, "test")).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
  });

  it("clears its timer so a settled call leaves nothing pending", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await withDeadline(resolveAfter(1, "ok"), 5_000, "test");
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
