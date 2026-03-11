/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { ServiceProvider } from '@athenna/ioc'
import { EventImpl } from '#src/events/EventImpl'
import { Module, Path, File } from '@athenna/common'
import { sep, isAbsolute, resolve } from 'node:path'

export class EventProvider extends ServiceProvider {
  public async register() {
    this.container.singleton('Athenna/Core/Event', EventImpl)

    const listeners = Config.get<string[]>('rc.events.listeners', [])

    await this.container.loadModules(listeners, {
      addCamelAlias: true,
      parentURL: this.getMeta()
    })

    const eventsPath = Config.get<string>('rc.events.path', null)

    if (eventsPath) {
      await this.registerEvents(eventsPath)
    }
  }

  public async shutdown() {
    const event = this.container.use<EventImpl>('Athenna/Core/Event')

    if (!event) {
      return
    }

    event.clearListeners()
    event.closeAllConsumers()

    await event.queue.closeAll()
  }

  /**
   * Get the meta URL of the project.
   */
  private getMeta() {
    return Config.get('rc.parentURL', Path.toHref(Path.pwd() + sep))
  }

  /**
   * Register the events file by importing the file.
   */
  private async registerEvents(path: string) {
    // Bust ESM import cache to guarantee the events file re-runs (tests/providers
    // may register/shutdown provider multiple times in same process).
    const resolvedPath = `${path}?version=${Math.random()}`

    if (path.startsWith('#')) {
      await Module.resolve(resolvedPath, this.getMeta())

      return
    }

    if (!isAbsolute(path)) {
      path = resolve(path)
    }

    if (!(await File.exists(path))) {
      return
    }

    await Module.resolve(`${path}?version=${Math.random()}`, this.getMeta())
  }
}
