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
import type {
  EventClosure,
  EmitContext,
  ListenerQueueOptions
} from '#src/types'

export class Listener {
  public readonly id: string
  public readonly event: string
  public readonly closure: EventClosure
  public readonly key?: string
  public readonly options: ListenerQueueOptions

  /**
   * Decide at `emit()` time if the listener runs for the event. Set from
   * the `shouldQueue()` method of named listeners.
   */
  public readonly shouldQueue?: (ctx: EmitContext) => boolean | Promise<boolean>

  /**
   * The optional `key` uniquely identifies the listener when its closure
   * source alone cannot. Listeners registered by name (`Event.on(event,
   * 'MyListener')`) all share the same wrapper closure, so without the name
   * as a key every named listener on the same event would hash to the same
   * id and silently overwrite the previous one in the records map.
   *
   * The `options` never take part in the id, so the same listener keeps
   * the same id when its delay, connection or queue changes.
   */
  public constructor(
    event: string,
    closure: EventClosure,
    key?: string,
    options: ListenerQueueOptions = {},
    shouldQueue?: (ctx: EmitContext) => boolean | Promise<boolean>
  ) {
    this.event = event
    this.closure = closure
    this.key = key
    this.options = options
    this.shouldQueue = shouldQueue
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
    const identity = this.key ?? this.closure.toString()

    return createHash('sha256')
      .update(`${this.event ?? '*'}|${identity}`)
      .digest('hex')
  }
}
