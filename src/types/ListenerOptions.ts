/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ListenerQueueOptions } from '#src/types/ListenerQueueOptions'

export type ListenerOptions = ListenerQueueOptions & {
  /**
   * The alias that will be used to register the listener inside
   * the service container.
   *
   * @default App/Listeners/YourListenerClassName
   */
  alias?: string

  /**
   * The camel alias that will be used as an alias of the real
   * listener alias. Camel alias is important when you want to
   * work with constructor injection. By default, Athenna doesn't
   * create camel alias for listeners.
   *
   * @default undefined
   */
  camelAlias?: string

  /**
   * The registration type that will be used to register your listener
   * inside the service container.
   *
   * @default 'transient'
   */
  type?: 'fake' | 'scoped' | 'singleton' | 'transient'
}
