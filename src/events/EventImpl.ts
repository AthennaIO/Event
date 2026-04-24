/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Config } from '@athenna/config'
import { Listener } from '#src/events/Listener'
import { Is, Macroable, Module } from '@athenna/common'
import type { EventClosure, Context } from '#src/types'
import { QueueImpl, type ConnectionOptions } from '@athenna/queue'

const otelModule = await Module.safeImport('@athenna/otel')

export class EventImpl extends Macroable {
  /**
   * The Queue connection name used for the event storage.
   */
  public queue: QueueImpl

  /**
   * Cached queues per connection.
   */
  private queues = new Map<string, QueueImpl>()

  /**
   * Event listeners indexed by event name (ids only).
   */
  private listeners = new Map<string, Set<string>>()

  /**
   * Any listeners (ids only).
   */
  private anyListeners = new Set<string>()

  /**
   * Listener records by id.
   */
  private records = new Map<string, Listener>()

  /**
   * Consumer loop state.
   */
  private consumers = new Map<
    string,
    { timer?: NodeJS.Timeout; running: boolean }
  >()

  public constructor() {
    super()
    this.queue = this.getOrCreateQueue(Config.get('event.store'))
  }

  /**
   * Define which Queue connection will be used as store for emitted events.
   *
   * @example
   * ```ts
   * await Event.store('memory').emit('new:user', user)
   * ```
   */
  public store(con: string, options?: ConnectionOptions) {
    this.queue = this.getOrCreateQueue(con, options)

    if (this.listenerCount() > 0) {
      this.startConsumer()
    }

    return this
  }

  /**
   * List all registered listeners.
   *
   * @example
   * ```ts
   * const listeners = Event.getListeners()
   *
   * console.log(listeners)
   * ```
   */
  public getListeners() {
    return Array.from(this.records.values())
  }

  /**
   * Register a listener for a specific event and return a Listener instance.
   *
   * @example
   * ```ts
   * Event.on('user.created', 'UserCreatedListener')
   * // or
   * Event.on('user.created', user => console.log(user))
   * ```
   */
  public on(event: string, closure: EventClosure | string) {
    let listener = null

    if (Is.String(closure)) {
      listener = new Listener(event, ctx => ioc.safeUse(closure).handle(ctx))
    } else {
      listener = new Listener(event, closure)
    }

    const set = this.listeners.get(event) ?? new Set<string>()

    set.add(listener.id)

    this.listeners.set(event, set)

    this.records.set(listener.id, listener)

    this.startConsumer()

    return listener
  }

  /**
   * Register a listener that will be called on every event.
   *
   * @example
   * ```ts
   * Event.onAny(event => console.log(event))
   * ```
   */
  public onAny(closure: EventClosure) {
    const listener = new Listener('*', closure)

    this.anyListeners.add(listener.id)
    this.records.set(listener.id, listener)

    this.startConsumer()

    return listener
  }

  /**
   * Remove a listener for a specific event.
   *
   * @example
   * ```ts
   * const listener = Event.on('user.created', user => console.log(user))
   *
   * listener.remove()
   * // or
   * Event.removeListener('user.created', listener.closure)
   * ```
   */
  public removeListener(event: string, closure: EventClosure) {
    const set = this.listeners.get(event)

    if (!set) {
      return this
    }

    const listener = new Listener(event, closure)

    set.delete(listener.id)
    this.records.delete(listener.id)

    if (set.size === 0) {
      this.listeners.delete(event)
    }

    return this
  }

  /**
   * Remove a "any event" listener.
   *
   * @example
   * ```ts
   * const listener = Event.onAny(event => console.log(event))
   *
   * listener.remove()
   * // or
   * Event.removeAnyListener(listener.closure)
   * ```
   */
  public removeAnyListener(closure: EventClosure) {
    const listener = new Listener('*', closure)

    this.anyListeners.delete(listener.id)
    this.records.delete(listener.id)

    return this
  }

  /**
   * Remove a listener by id.
   *
   * @example
   * ```ts
   * const listener = Event.on('user.created', user => console.log(user))
   *
   * Event.removeListenerById(listener.id)
   * ```
   */
  public removeListenerById(id: string) {
    const record = this.records.get(id)

    if (!record) {
      return this
    }

    if (record.event === '*') {
      this.anyListeners.delete(id)
      this.records.delete(id)

      return this
    }

    const set = record.event ? this.listeners.get(record.event) : undefined

    if (set) {
      set.delete(id)

      if (set.size === 0) {
        this.listeners.delete(record.event!)
      }
    }

    this.records.delete(id)

    return this
  }

  /**
   * Remove all listeners.
   *
   * @example
   * ```ts
   * Event.clearListeners()
   * ```
   */
  public clearListeners(event?: string) {
    if (event !== undefined) {
      const ids = this.listeners.get(event)

      if (ids) {
        for (const id of ids) {
          this.records.delete(id)
        }
      }

      this.listeners.delete(event)

      return this
    }

    this.listeners.clear()
    this.anyListeners.clear()
    this.records.clear()

    return this
  }

  /**
   * Return number of listeners for a specific event.
   *
   * @example
   * ```ts
   * Event.listenerCount('user.created')
   * ```
   */
  public listenerCount(event?: string) {
    if (event !== undefined) {
      return this.listeners.get(event)?.size ?? 0
    }

    let count = this.anyListeners.size

    for (const set of this.listeners.values()) {
      count += set.size
    }

    return count
  }

  /**
   * Return number of consumers.
   *
   * @example
   * ```ts
   * Event.consumerCount()
   * ```
   */
  public consumerCount() {
    return this.consumers.size
  }

  /**
   * Listen for a single event and remove the listener after it is called.
   *
   * @example
   * ```ts
   * const user = await Event.once('user.created')
   *
   * console.log(user)
   * ```
   */
  public once<T = any>(event: string): Promise<T> {
    return new Promise(resolve => {
      const listener = this.on(event, ctx => {
        listener.remove()
        resolve(ctx.data as T)
      })
    })
  }

  /**
   * Emit an event. Listeners are executed in parallel.
   *
   * @example
   * ```ts
   * await Event.emit('user.created', user)
   * ```
   */
  public async emit(event: string, data?: any) {
    const emittedAt = Date.now()

    const promises = []

    for (const id of Array.from(this.anyListeners)) {
      const record = this.records.get(id)

      if (!record) {
        continue
      }

      const payload = {
        listenerId: id,
        event,
        data,
        emittedAt
      }

      promises.push(this.queue.add(payload))
    }

    const ids = this.listeners.get(event)

    if (ids?.size) {
      for (const id of Array.from(ids)) {
        const record = this.records.get(id)

        if (!record) {
          continue
        }

        const payload = {
          listenerId: id,
          event,
          data,
          emittedAt
        }

        promises.push(this.queue.add(payload))
      }
    }

    await Promise.all(promises)
  }

  /**
   * Emit an event. Listeners are executed sequentially.
   *
   * @example
   * ```ts
   * await Event.emitSequentially('user.created', user)
   * ```
   */
  public async emitSequentially(event: string, data?: any) {
    await this.emit(event, data)
  }

  /**
   * Start the Event consumer for the current connection.
   *
   * @example
   * ```ts
   * Event.startConsumer()
   * ```
   */
  public startConsumer() {
    const connection = this.queue.connectionName
    const state = this.consumers.get(connection)

    if (state?.running) {
      return
    }

    const consumerState = { timer: undefined, running: true }

    this.consumers.set(connection, consumerState)

    const queue = this.getOrCreateQueue(connection)

    const loop = async () => {
      if (!consumerState.running) {
        return
      }

      const interval = Config.get(
        `queue.connections.${connection}.workerInterval`,
        1000
      )

      try {
        await this.processFrom(queue)
      } catch {
      } finally {
        if (consumerState.running) {
          consumerState.timer = setTimeout(loop, Math.max(1, interval))
          consumerState.timer.unref?.()
        }
      }
    }

    consumerState.timer = setTimeout(loop, 0)
    consumerState.timer.unref?.()
  }

  /**
   * Shutdown all consumers by clearing all timers.
   *
   * @example
   * ```ts
   * Event.closeAllConsumers()
   * ```
   */
  public closeAllConsumers() {
    for (const state of this.consumers.values()) {
      if (state.timer) {
        clearTimeout(state.timer)
      }
    }

    this.consumers.clear()
  }

  private async processFrom(queue: QueueImpl) {
    await queue.process(async job => {
      const data = job.data
      const record = this.records.get(data.listenerId)

      if (!record) {
        await queue.ack(job.id)

        return
      }

      const ctx: Context = {
        jobId: job.id,
        listenerId: data.listenerId,
        attempts: job.attempts,
        event: data.event,
        data: data.data,
        emittedAt: data.emittedAt
      }

      await this.runWithOtelContext(ctx, () => record.closure(ctx))

      await queue.ack(job.id)
    })
  }

  private runWithOtelContext<T>(ctx: Context, callback: () => T): T {
    if (!Config.is('event.otel.contextEnabled', true) || !otelModule) {
      return callback()
    }

    return otelModule.Otel.withContext(callback, {
      bindings: Config.get('event.otel.contextBindings', []),
      resolveBinding: binding => binding.resolve(ctx)
    })
  }

  private parseConnectionName(con: string) {
    if (con === 'default') {
      return Config.get('event.store')
    }

    return con
  }

  private getOrCreateQueue(con: string, options?: ConnectionOptions) {
    con = this.parseConnectionName(con)

    const cached = this.queues.get(con)

    if (cached) {
      return cached
    }

    const queue = new QueueImpl(options).connection(con, options)

    this.queues.set(con, queue)

    return queue
  }
}
