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
import { Config } from '@athenna/config'
import { Options } from '@athenna/common'
import { Annotation } from '@athenna/ioc'
import type { ListenerOptions } from '#src/types'

/**
 * Create a listener inside the service provider.
 */
export function Listener(options?: ListenerOptions): ClassDecorator {
  return (target: any) => {
    options = Options.create(options, {
      camelAlias: target.name,
      alias: `App/Listeners/${target.name}`,
      connection: Config.get('event.store'),
      type: 'transient'
    })

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
