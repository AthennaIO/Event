/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ListenerOptions, ListenerQueueOptions } from '#src/types'

/**
 * The classes annotated with `@Listener()` and their queue options,
 * indexed by every name they can be given to `Event.on()`: the alias, the
 * camel alias and the class name. It lets `Event.on()` read the queue
 * options and methods of a listener without resolving it from the
 * container, so the constructor of a listener never runs while the
 * providers are still registering (its dependencies may not exist yet).
 */
export class ListenerRegistry {
  private static listeners = new Map<
    string,
    { target: any; options: ListenerQueueOptions }
  >()

  /**
   * Register a listener class with all its names.
   */
  public static register(target: any, options: ListenerOptions) {
    const listener = {
      target,
      options: {
        connection: options.connection,
        queue: options.queue,
        delay: options.delay
      }
    }

    for (const name of [options.alias, options.camelAlias, target.name]) {
      if (name) {
        this.listeners.set(name, listener)
      }
    }
  }

  /**
   * Get the listener class and its queue options registered with the name.
   */
  public static get(name: string) {
    return this.listeners.get(name)
  }
}
