/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import { AssertionError } from 'node:assert'
import { Config } from '@athenna/config'
import { Listener } from '#src/events/Listener'
import { ListenerRegistry } from '#src/events/ListenerRegistry'
import { Is, Macroable, Module, Parser } from '@athenna/common'
import { QueueImpl, type ConnectionOptions } from '@athenna/queue'
import type {
  Context,
  EmitContext,
  EventClosure,
  EmittedEvent,
  ListenerQueueOptions
} from '#src/types'

const otelModule = await Module.safeImport('@athenna/otel')

/**
 * Drivers whose queues are plain names, so each listener can have a queue
 * of its own. The queues of `aws_sqs` are URLs of queues that must exist,
 * so its listeners share the queue of the connection.
 */
const ISOLATED_DRIVERS = ['memory', 'database']

export class EventImpl extends Macroable {
  /**
   * The Queue connection name used for the event storage.
   */
  public queue: QueueImpl

  /**
   * Cached queues per connection and queue name.
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
    { timers: NodeJS.Timeout[]; running: boolean }
  >()

  /**
   * The connections selected as store with `store()`. Listeners without a
   * connection of their own are consumed in all of them.
   */
  private stores = new Set<string>()

  /**
   * The orphan checks already scheduled by this instance, indexed by
   * connection, queue and instant, so each queue gets one check per
   * window instead of one per emit.
   */
  private orphanChecks = new Map<string, number>()

  /**
   * The events faked with `fake()`. `null` means nothing is faked and an
   * empty set means every event is faked.
   */
  private fakedEvents: Set<string> | null = null

  /**
   * The events recorded while faked.
   */
  private recordedEvents: EmittedEvent[] = []

  public constructor() {
    super()
    this.queue = this.getOrCreateQueue(Config.get('event.store'))
    this.stores.add(this.queue.connectionName)
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
    this.queue = this.getOrCreateQueue(con, undefined, options)
    this.stores.add(this.queue.connectionName)

    if (this.listenerCount() > 0 && !this.isFaked()) {
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
   * The options define the connection, the queue and the delay of the
   * listener jobs.
   *
   * @example
   * ```ts
   * Event.on('user.created', 'UserCreatedListener')
   * // or
   * Event.on('user.created', user => console.log(user))
   * // or
   * Event.on('user.created', user => console.log(user), { delay: 60000 })
   * ```
   */
  public on(
    event: string,
    closure: EventClosure | string,
    options: ListenerQueueOptions = {}
  ) {
    let listener = null

    if (Is.String(closure)) {
      const named = this.resolveNamedListener(closure, options)

      listener = new Listener(
        event,
        ctx => ioc.safeUse(closure).handle(ctx),
        closure,
        named.options,
        named.shouldQueue
      )
    } else {
      listener = new Listener(event, closure, undefined, options)
    }

    const set = this.listeners.get(event) ?? new Set<string>()

    set.add(listener.id)

    this.listeners.set(event, set)

    this.records.set(listener.id, listener)

    this.startListenerConsumers(listener)

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
  public onAny(closure: EventClosure, options: ListenerQueueOptions = {}) {
    const listener = new Listener('*', closure, undefined, options)

    this.anyListeners.add(listener.id)
    this.records.set(listener.id, listener)

    this.startListenerConsumers(listener)

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
   * Emit an event. Listeners are executed in parallel. Each listener job is
   * stored in the connection and queue of the listener, and delayed
   * listeners are stored with `Queue.later()`.
   *
   * @example
   * ```ts
   * await Event.emit('user.created', user)
   * ```
   */
  public async emit(event: string, data?: any) {
    const emittedAt = Date.now()

    if (this.isFaked(event)) {
      this.recordedEvents.push({ event, data, emittedAt })

      return
    }

    const ids = [
      ...Array.from(this.anyListeners),
      ...Array.from(this.listeners.get(event) ?? [])
    ]

    await Promise.all(ids.map(id => this.enqueue(id, event, data, emittedAt)))
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
   * Fake the events, so `emit()` records them instead of storing them in
   * the queue and no listener runs. Pass event names to fake only them,
   * the other events are emitted normally. Use `unfake()` to undo it.
   *
   * @example
   * ```ts
   * Event.fake()
   *
   * await Event.emit('user:created', { id: 1 })
   *
   * Event.assertEmitted('user:created')
   * ```
   */
  public fake(events: string[] = []) {
    this.fakedEvents = new Set(events)
    this.recordedEvents = []

    return this
  }

  /**
   * Undo `fake()`, forgetting the recorded events and starting the
   * consumers of the listeners registered while faked.
   *
   * @example
   * ```ts
   * Event.unfake()
   * ```
   */
  public unfake() {
    this.fakedEvents = null
    this.recordedEvents = []

    for (const listener of this.records.values()) {
      this.startListenerConsumers(listener)
    }

    return this
  }

  /**
   * Verify if the events are faked. When an event name is given, verify
   * if that event is faked.
   *
   * @example
   * ```ts
   * Event.isFaked('user:created')
   * ```
   */
  public isFaked(event?: string) {
    if (!this.fakedEvents) {
      return false
    }

    if (event === undefined || this.fakedEvents.size === 0) {
      return true
    }

    return this.fakedEvents.has(event)
  }

  /**
   * Return the events recorded while faked with the given name. The
   * predicate receives the data of each event.
   *
   * @example
   * ```ts
   * const events = Event.emitted('user:created', user => user.id === 1)
   * ```
   */
  public emitted<T = any>(
    event: string,
    predicate?: (data: T, emitted: EmittedEvent<T>) => boolean
  ): EmittedEvent<T>[] {
    return this.recordedEvents.filter(emitted => {
      if (emitted.event !== event) {
        return false
      }

      return predicate ? predicate(emitted.data, emitted) : true
    })
  }

  /**
   * Assert that an event was emitted while faked. The predicate receives
   * the data of each event and at least one of them must match.
   *
   * @example
   * ```ts
   * Event.assertEmitted('user:created', user => user.id === 1)
   * ```
   */
  public assertEmitted<T = any>(
    event: string,
    predicate?: (data: T, emitted: EmittedEvent<T>) => boolean
  ) {
    this.ensureFaked(event)

    if (this.emitted(event, predicate).length) {
      return
    }

    throw new AssertionError({
      message: predicate
        ? `The expected "${event}" event was not emitted with data matching the predicate.`
        : `The expected "${event}" event was not emitted.`
    })
  }

  /**
   * Assert that an event was emitted an exact number of times while faked.
   *
   * @example
   * ```ts
   * Event.assertEmittedTimes('user:created', 2)
   * ```
   */
  public assertEmittedTimes(event: string, times: number) {
    this.ensureFaked(event)

    const count = this.emitted(event).length

    if (count === times) {
      return
    }

    throw new AssertionError({
      message: `The expected "${event}" event was emitted ${count} times instead of ${times} times.`,
      actual: count,
      expected: times,
      operator: 'strictEqual'
    })
  }

  /**
   * Assert that an event was not emitted while faked. With a predicate,
   * assert that no event with that name has data matching it.
   *
   * @example
   * ```ts
   * Event.assertNotEmitted('user:deleted')
   * ```
   */
  public assertNotEmitted<T = any>(
    event: string,
    predicate?: (data: T, emitted: EmittedEvent<T>) => boolean
  ) {
    this.ensureFaked(event)

    const count = this.emitted(event, predicate).length

    if (!count) {
      return
    }

    throw new AssertionError({
      message: predicate
        ? `The unexpected "${event}" event was emitted ${count} times with data matching the predicate.`
        : `The unexpected "${event}" event was emitted ${count} times.`
    })
  }

  /**
   * Assert that no event was emitted while faked.
   *
   * @example
   * ```ts
   * Event.assertNothingEmitted()
   * ```
   */
  public assertNothingEmitted() {
    this.ensureFaked()

    if (!this.recordedEvents.length) {
      return
    }

    const events = this.recordedEvents.map(emitted => emitted.event)

    throw new AssertionError({
      message: `${events.length} unexpected events were emitted: ${events.join(
        ', '
      )}.`
    })
  }

  /**
   * Assert that a listener is registered for an event. The listener is the
   * name given to `Event.on()` or the closure itself. Use `*` as event to
   * assert a listener registered with `onAny()`.
   *
   * @example
   * ```ts
   * Event.assertListening('user:created', 'SendWelcomeEmailListener')
   * ```
   */
  public assertListening(event: string, listener: string | EventClosure) {
    const found = this.getListeners().some(record => {
      if (record.event !== event) {
        return false
      }

      return Is.String(listener)
        ? record.key === listener
        : record.closure === listener
    })

    if (found) {
      return
    }

    const name = Is.String(listener) ? listener : listener.name || 'closure'

    throw new AssertionError({
      message: `The "${event}" event does not have the "${name}" listener attached to it.`
    })
  }

  /**
   * Start the Event consumer for a connection. The current store is used
   * when no connection is given.
   *
   * @example
   * ```ts
   * Event.startConsumer()
   * ```
   */
  public startConsumer(connection: string = this.queue.connectionName) {
    connection = this.parseConnectionName(connection)

    const state = this.consumers.get(connection)

    if (state?.running) {
      return
    }

    /**
     * Resolving the queue up front fails fast when the connection does not
     * exist in the queue configuration.
     */
    this.getOrCreateQueue(connection)

    const consumerState: { timers: NodeJS.Timeout[]; running: boolean } = {
      timers: [],
      running: true
    }

    this.consumers.set(connection, consumerState)

    /**
     * Each spawned loop owns a fixed slot in `timers` and reuses it across
     * ticks (the slot is reassigned, never appended) so the array stays at
     * exactly `workerConcurrency` entries instead of growing per tick.
     */
    const spawn = (slot: number) => {
      const loop = async () => {
        if (!consumerState.running) {
          return
        }

        const interval = Config.get(
          `queue.connections.${connection}.workerInterval`,
          1000
        )

        try {
          await this.processConnection(connection, consumerState)
        } catch (err) {
          debug('event consumer processFrom error on %s: %o', connection, err)
        } finally {
          if (consumerState.running) {
            const timer = setTimeout(loop, Math.max(1, interval))
            timer.unref?.()
            consumerState.timers[slot] = timer
          }
        }
      }

      const timer = setTimeout(loop, 0)
      timer.unref?.()
      consumerState.timers[slot] = timer
    }

    /**
     * `workerConcurrency` is the number of independent consumer loops that run
     * in parallel for this connection. Each loop still pulls and processes ONE
     * job at a time, so N loops yield an effective concurrency of N. When the
     * option is null/unset it defaults to 0, which falls back to a single
     * serial loop (one-by-one) — the historical behaviour.
     */
    const concurrency = Config.get(
      `queue.connections.${connection}.workerConcurrency`,
      0
    )

    const loops = concurrency > 0 ? concurrency : 1

    for (let slot = 0; slot < loops; slot++) {
      spawn(slot)
    }
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
      /**
       * Flip running to false BEFORE clearing the timer so any in-flight
       * loop() that reaches its finally block sees running === false and
       * does not reschedule itself into a zombie consumer.
       */
      state.running = false

      for (const timer of state.timers) {
        clearTimeout(timer)
      }
    }

    this.consumers.clear()
  }

  /**
   * Resolve the queue options of a listener registered by name. The
   * `viaConnection()`, `viaQueue()` and `withDelay()` methods of the
   * listener win over the `Event.on()` options, that win over the
   * `@Listener()` options.
   *
   * Like Laravel, those methods are called on an instance created without
   * running the constructor, so `Event.on()` never resolves the listener
   * from the container while the providers are registering. Only
   * `shouldQueue()` runs on an instance resolved from the container, at
   * emit time. The listener class must be annotated with `@Listener()`.
   */
  private resolveNamedListener(name: string, options: ListenerQueueOptions) {
    const listener = ListenerRegistry.get(name)

    if (!listener) {
      return { options, shouldQueue: undefined }
    }

    const { target: Target, options: meta } = listener
    const blank = () => Object.create(Target.prototype)
    const has = (method: string) => Is.Function(Target.prototype[method])
    const call = (method: string) =>
      has(method) ? blank()[method]() : undefined

    return {
      options: {
        connection:
          call('viaConnection') ?? options.connection ?? meta.connection,
        queue: call('viaQueue') ?? options.queue ?? meta.queue,
        delay: has('withDelay')
          ? (ctx: EmitContext) => blank().withDelay(ctx)
          : options.delay ?? meta.delay
      },
      shouldQueue: has('shouldQueue')
        ? (ctx: EmitContext) => ioc.safeUse(name).shouldQueue(ctx)
        : undefined
    }
  }

  /**
   * Start the consumers that will process the jobs of a listener: the one
   * of the current store and the one of the listener connection.
   */
  private startListenerConsumers(listener: Listener) {
    if (this.isFaked(listener.event)) {
      return
    }

    this.startConsumer()

    if (listener.options.connection) {
      this.startConsumer(listener.options.connection)
    }
  }

  /**
   * Store the job of one listener for an emitted event.
   */
  private async enqueue(
    listenerId: string,
    event: string,
    data: any,
    emittedAt: number
  ) {
    const record = this.records.get(listenerId)

    if (!record) {
      return
    }

    const ctx: EmitContext = { listenerId, event, data, emittedAt }

    if (record.shouldQueue && !(await record.shouldQueue(ctx))) {
      return
    }

    const delay = Is.Function(record.options.delay)
      ? await (record.options.delay as any)(ctx)
      : record.options.delay

    const { connection, queue } = this.routeOf(record)
    const target = this.getOrCreateQueue(connection, queue)

    let dueAt = emittedAt

    if (Is.Undefined(delay) || Is.Null(delay)) {
      await target.add({ ...ctx, dueAt })
    } else {
      dueAt = Math.max(
        emittedAt,
        delay instanceof Date ? delay.getTime() : emittedAt + delay
      )

      /**
       * The delay is given as is, so `Queue.later()` validates it and an
       * invalid one throws before anything is stored.
       */
      await target.later(delay, { ...ctx, dueAt })
    }

    await this.scheduleOrphanCheck(connection, queue, dueAt)
  }

  /**
   * Resolve the connection and the queue where the jobs of a listener are
   * stored. Listeners without a connection follow the current store.
   */
  private routeOf(record: Listener) {
    const connection = record.options.connection
      ? this.parseConnectionName(record.options.connection)
      : this.queue.connectionName

    return { connection, queue: this.queueNameOf(record, connection) }
  }

  /**
   * Resolve the queue of a listener in a connection. In `memory` and
   * `database` connections each listener has its own queue, named after
   * the queue of the connection and the listener name (or id, for
   * closures), so a consumer only pulls the jobs of listeners it owns.
   */
  private queueNameOf(record: Listener, connection: string) {
    if (record.options.queue) {
      return record.options.queue
    }

    const base = this.baseQueueNameOf(connection)

    if (!this.isIsolated(connection)) {
      return base
    }

    return `${base}:${record.key ?? record.id}`
  }

  private baseQueueNameOf(connection: string) {
    return this.getOrCreateQueue(connection).driver.queueName
  }

  private isIsolated(connection: string) {
    return ISOLATED_DRIVERS.includes(
      Config.get(`queue.connections.${connection}.driver`)
    )
  }

  /**
   * The queues consumed in a connection: the queue of the connection plus
   * the queue of each listener of this instance stored in the connection.
   * The queue of the connection holds the listeners without a queue of
   * their own (`aws_sqs`), the jobs stored by older versions and the
   * orphan checks. Computed on every tick, so listeners registered or
   * removed later are honored.
   */
  private queuesOf(connection: string) {
    const base = this.getOrCreateQueue(connection)
    const queues = new Map<string, QueueImpl>([[base.driver.queueName, base]])

    for (const record of this.records.values()) {
      const owner = record.options.connection
        ? this.parseConnectionName(record.options.connection)
        : this.stores.has(connection)
        ? connection
        : null

      if (owner !== connection) {
        continue
      }

      const name = this.queueNameOf(record, connection)

      if (!queues.has(name)) {
        queues.set(name, this.getOrCreateQueue(connection, name))
      }
    }

    return Array.from(queues.values())
  }

  /**
   * Process the next job of each queue consumed in a connection.
   */
  private async processConnection(
    connection: string,
    state: { running: boolean }
  ) {
    for (const queue of this.queuesOf(connection)) {
      if (!state.running) {
        return
      }

      try {
        await this.processFrom(connection, queue)
      } catch (err) {
        debug(
          'event consumer processFrom error on %s (%s): %o',
          connection,
          queue.driver.queueName,
          err
        )
      }
    }
  }

  private async processFrom(connection: string, queue: QueueImpl) {
    await queue.process(async job => {
      const data = job.data ?? {}

      if (data.orphanCheck) {
        await this.checkOrphans(connection, data.orphanCheck)
        await queue.ack(job.id)

        return
      }

      const record = this.records.get(data.listenerId)

      if (!record) {
        await this.handleUnknownListener(connection, queue, job)

        return
      }

      const ctx: Context = {
        jobId: job.id,
        listenerId: data.listenerId,
        attempts: job.attempts,
        event: data.event,
        data: data.data,
        emittedAt: data.emittedAt,
        dueAt: data.dueAt ?? data.emittedAt
      }

      await this.runWithOtelContext(ctx, () => record.closure(ctx))

      await queue.ack(job.id)
    })
  }

  /**
   * Handle a job whose listener is not registered in this instance.
   *
   * Inside the orphan grace window the job is NOT acked and stays for
   * redelivery: an instance running another version may own the listener
   * (rolling deploys / version skew), and acking it would silently delete
   * an event this instance simply does not own.
   *
   * Past the window nobody owns it, so it goes to the deadletter queue of
   * the connection. Waiting for the attempts to run out is not an option:
   * the `memory` and `database` drivers decrement the attempts of a job
   * that is not acked but put it back in the queue forever.
   */
  private async handleUnknownListener(
    connection: string,
    queue: QueueImpl,
    job: any
  ) {
    if (!this.isPastOrphanGrace(job.data)) {
      debug(
        'event consumer skipping job %s: no local listener for id %s',
        job.id,
        job.data?.listenerId
      )

      return
    }

    debug(
      'event consumer sending job %s to deadletter: no listener for id %s past the orphan grace',
      job.id,
      job.data?.listenerId
    )

    await this.sendToDeadletter(connection, job.data)
    await queue.ack(job.id)
  }

  /**
   * Schedule an orphan check for a listener queue. When the listener is
   * removed or renamed in every instance, nobody pulls its queue anymore,
   * so the check, stored in the queue of the connection that every
   * consumer of the connection pulls, is what sends its jobs to the
   * deadletter queue. One check per queue and window covers every job due
   * in that window.
   */
  private async scheduleOrphanCheck(
    connection: string,
    queue: string,
    dueAt: number
  ) {
    const graceMs = this.getOrphanGraceMs()

    if (
      !graceMs ||
      !this.isIsolated(connection) ||
      queue === this.baseQueueNameOf(connection)
    ) {
      return
    }

    const now = Date.now()
    const checkAt = (Math.floor(dueAt / graceMs) + 2) * graceMs
    const key = `${connection}|${queue}|${checkAt}`

    if (this.orphanChecks.has(key)) {
      return
    }

    for (const [scheduled, at] of this.orphanChecks) {
      if (at <= now) {
        this.orphanChecks.delete(scheduled)
      }
    }

    this.orphanChecks.set(key, checkAt)

    await this.getOrCreateQueue(connection).later(new Date(checkAt), {
      orphanCheck: queue,
      emittedAt: now,
      dueAt: checkAt
    })
  }

  /**
   * Run an orphan check. When no listener of this instance owns the queue
   * anymore, its jobs past the orphan grace go to the deadletter queue.
   * Jobs inside the grace are never touched, so an instance running
   * another version that owns the queue keeps them.
   */
  private async checkOrphans(connection: string, name: string) {
    const owned = this.queuesOf(connection).some(
      queue => queue.driver.queueName === name
    )

    if (owned) {
      return
    }

    const queue = this.getOrCreateQueue(connection, name)

    let moved = true

    while (moved) {
      moved = false

      const head = await queue.peek()

      if (!head || !this.isPastOrphanGrace(head.data)) {
        return
      }

      await queue.process(async job => {
        if (!this.isPastOrphanGrace(job.data)) {
          return
        }

        await this.sendToDeadletter(connection, job.data)
        await queue.ack(job.id)

        moved = true
      })
    }
  }

  private isPastOrphanGrace(data: any) {
    const graceMs = this.getOrphanGraceMs()

    if (!graceMs) {
      return false
    }

    const dueAt = data?.dueAt ?? data?.emittedAt ?? 0

    return Date.now() >= dueAt + graceMs
  }

  private getOrphanGraceMs(): number {
    return Config.get('event.orphanGraceMs', Parser.timeToMs('1h'))
  }

  /**
   * Add the data of a job to the deadletter queue of the connection. When
   * the connection has no deadletter queue the job is discarded, like the
   * queue drivers do with failed jobs.
   */
  private async sendToDeadletter(connection: string, data: any) {
    const deadletter = this.getOrCreateQueue(connection).driver.deadletter

    if (!deadletter) {
      debug('connection %s has no deadletter queue, discarding job', connection)

      return
    }

    await this.getOrCreateQueue(connection, deadletter).add(data)
  }

  /**
   * Fail an assertion when the event is not faked. Without it, the negative
   * assertions would always pass, since nothing is recorded.
   */
  private ensureFaked(event?: string) {
    if (this.isFaked(event)) {
      return
    }

    throw new AssertionError({
      message:
        event === undefined
          ? 'Events are not faked, call Event.fake() before asserting them.'
          : `The "${event}" event is not faked, call Event.fake() before asserting it.`
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

  /**
   * Get a queue of a connection, cached per connection and queue name. Each
   * queue has its own `QueueImpl`, because `queue()` changes the queue of
   * the instance it is called on.
   */
  private getOrCreateQueue(
    con: string,
    name?: string,
    options?: ConnectionOptions
  ) {
    con = this.parseConnectionName(con)

    const key = name ? `${con}|${name}` : con
    const cached = this.queues.get(key)

    if (cached) {
      return cached
    }

    const queue = new QueueImpl(options).connection(con, options)

    if (name) {
      queue.queue(name)
    }

    this.queues.set(key, queue)

    return queue
  }
}
