/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { createHash } from 'node:crypto'
import { Event } from '#src/facades/Event'
import type { EventClosure } from '#src/types'

export class Listener {
  public readonly id: string
  public readonly event: string
  public readonly closure: EventClosure

  public constructor(event: string, closure: EventClosure) {
    this.event = event
    this.closure = closure
    this.id = this.createId()
  }

  /**
   * Remove the listener.
   */
  public remove() {
    Event.removeListenerById(this.id)
  }

  /**
   * Run the listener.
   */
  public async run(data: any) {
    await this.closure(data)
  }

  private createId() {
    return createHash('sha256')
      .update(`${this.event ?? '*'}|${this.closure.toString()}`)
      .digest('hex')
  }
}
