/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import 'reflect-metadata'

import { debug } from '#src/debug'
import { Options } from '@athenna/common'
import { Annotation } from '@athenna/ioc'
import type { ListenerOptions } from '#src/types'
import { ListenerRegistry } from '#src/events/ListenerRegistry'

/**
 * Create a listener inside the service provider.
 */
export function Listener(options?: ListenerOptions): ClassDecorator {
  return (target: any) => {
    /**
     * The `connection` has no default here on purpose: a listener that does
     * not declare one follows the connection selected with `Event.store()`
     * at emit time, instead of the `event.store` value read when the file
     * was imported.
     */
    options = Options.create(options, {
      camelAlias: target.name,
      alias: `App/Listeners/${target.name}`,
      type: 'transient'
    })

    ListenerRegistry.register(target, options)

    debug('Registering listener metadata for the service container %o', {
      ...options,
      name: target.name
    })

    if (ioc.has(options.alias)) {
      debug(
        'Skipping registration, alias %s is already registered.',
        options.alias
      )

      return
    }

    Annotation.defineMeta(target, options)
  }
}
