export type Context<T = any> = {
  /**
   * The id of the job in the queue.
   */
  jobId: string

  /**
   * The id of the listener.
   */
  listenerId: string

  /**
   * The attempts of the listener.
   */
  attempts: number

  /**
   * The event name.
   */
  event: string

  /**
   * The data of the event.
   */
  data: T

  /**
   * The timestamp of the event emission.
   */
  emittedAt: number

  /**
   * The timestamp when the listener was due to run. It is the same as
   * `emittedAt` for listeners without delay. Always set when the listener
   * runs from the queue.
   */
  dueAt?: number
}
