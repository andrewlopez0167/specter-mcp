import { describe, it, expect, beforeEach } from 'vitest';
import { RequestQueue, getGlobalQueue, executeQueued } from '../../../src/queue/executor.js';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue();
  });

  describe('enqueue', () => {
    it('should execute a single task', async () => {
      const result = await queue.enqueue(async () => 'result');
      expect(result).toBe('result');
    });

    it('should execute tasks sequentially', async () => {
      const order: number[] = [];

      const task1 = queue.enqueue(async () => {
        await delay(50);
        order.push(1);
        return 1;
      });

      const task2 = queue.enqueue(async () => {
        order.push(2);
        return 2;
      });

      const task3 = queue.enqueue(async () => {
        order.push(3);
        return 3;
      });

      await Promise.all([task1, task2, task3]);

      // Tasks should complete in order, even though task2 and task3 are faster
      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle task errors without affecting other tasks', async () => {
      const results: (number | string)[] = [];

      const task1 = queue.enqueue(async () => {
        results.push(1);
        return 1;
      });

      const task2 = queue.enqueue(async () => {
        throw new Error('Task 2 failed');
      });

      const task3 = queue.enqueue(async () => {
        results.push(3);
        return 3;
      });

      await task1;
      await expect(task2).rejects.toThrow('Task 2 failed');
      await task3;

      expect(results).toEqual([1, 3]);
    });

    it('should return correct results for each task', async () => {
      const result1 = queue.enqueue(async () => 'a');
      const result2 = queue.enqueue(async () => 'b');
      const result3 = queue.enqueue(async () => 'c');

      const results = await Promise.all([result1, result2, result3]);
      expect(results).toEqual(['a', 'b', 'c']);
    });
  });

  describe('queue state', () => {
    it('should report correct length', async () => {
      expect(queue.length).toBe(0);

      const task1 = queue.enqueue(async () => {
        await delay(100);
        return 1;
      });

      // Queue another task while first is running
      setTimeout(() => {
        queue.enqueue(async () => 2);
        queue.enqueue(async () => 3);
      }, 10);

      await task1;
      // After first completes, remaining tasks should process
    });

    it('should report busy state correctly', async () => {
      expect(queue.busy).toBe(false);

      const task = queue.enqueue(async () => {
        await delay(50);
        return 'done';
      });

      // Should be busy while processing
      await delay(10);
      expect(queue.busy).toBe(true);

      await task;
      expect(queue.busy).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reject pending tasks when cleared', async () => {
      const task1 = queue.enqueue(async () => {
        await delay(100);
        return 1;
      });

      // Attach catch handlers immediately to prevent unhandled rejection warnings
      const task2 = queue.enqueue(async () => 2).catch((e) => e);
      const task3 = queue.enqueue(async () => 3).catch((e) => e);

      // Clear while task1 is running
      await delay(10);
      queue.clear();

      await task1; // First task completes normally

      // Now check that tasks 2 and 3 received the clear error
      const result2 = await task2;
      const result3 = await task3;
      expect(result2).toBeInstanceOf(Error);
      expect(result2.message).toBe('Queue cleared');
      expect(result3).toBeInstanceOf(Error);
      expect(result3.message).toBe('Queue cleared');
    });
  });
});

describe('executeQueued', () => {
  it('should use the global queue', async () => {
    const result = await executeQueued(async () => 'global result');
    expect(result).toBe('global result');
  });

  it('should queue multiple global calls', async () => {
    const order: number[] = [];

    const tasks = [
      executeQueued(async () => {
        await delay(30);
        order.push(1);
      }),
      executeQueued(async () => {
        order.push(2);
      }),
    ];

    await Promise.all(tasks);
    expect(order).toEqual([1, 2]);
  });
});

// Helper function
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
