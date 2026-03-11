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

export class EventProvider extends ServiceProvider {
  public async register() {
    this.container.singleton('Athenna/Core/Event', EventImpl)
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
}
