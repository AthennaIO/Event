/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * An event recorded by `Event.fake()`.
 */
export type EmittedEvent<T = any> = {
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
