/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * The context given to a listener at `emit()` time, before its job exists
 * in the queue. It is the argument of the `delay` option when it is a
 * function and of the `withDelay()` and `shouldQueue()` listener methods.
 */
export type EmitContext<T = any> = {
  /**
   * The id of the listener.
   */
  listenerId: string

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
}
