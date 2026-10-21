/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Config } from '@athenna/config'
import { Event } from '#src/facades/Event'
import { Path, Sleep } from '@athenna/common'
import { LoggerProvider } from '@athenna/logger'
import { Queue, QueueProvider } from '@athenna/queue'
import { EventProvider } from '#src/providers/EventProvider'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'

export class EventImplTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    await new LoggerProvider().register()
    await new QueueProvider().register()
    await new EventProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    Event.clearListeners()

    await new QueueProvider().shutdown()
    await new EventProvider().shutdown()
    await new LoggerProvider().shutdown()

    Config.clear()
    ioc.reconstruct()
  }

  @Test()
  public async shouldBeAbleToEmitEventsToListenersAndStoreInQueueWhenUsingStore({ assert }: Context) {
    const event = Event.store('memoryA')
    const user = { id: 1, email: 'user@site.com' }

    let calls = 0

    const listener = event.on('new:user', ctx => {
      calls++
      assert.deepEqual(ctx.data, user)
    })

    await event.emit('new:user', user)

    await Sleep.for(30).milliseconds().wait()

    assert.equal(calls, 1)

    const main = Queue.connection('memoryA').queue(`events-a:${listener.id}`)

    assert.deepEqual(await main.length(), 0)
  }

  @Test()
  public async shouldBeAbleToSwapStoresAndPersistInCorrectConnection({ assert }: Context) {
    const event = Event.store('memoryA')
    let aCalls = 0
    let bCalls = 0

    const la = event.on('event:a', () => aCalls++)
    const lb = event.on('event:b', () => bCalls++)

    await event.store('memoryA').emit('event:a', { a: 1 })
    await event.store('memoryB').emit('event:b', { b: 2 })

    await Sleep.for(30).milliseconds().wait()

    assert.deepEqual(aCalls, 1)
    assert.deepEqual(bCalls, 1)

    const queueA = Queue.connection('memoryA').queue(`events-a:${la.id}`)
    const queueB = Queue.connection('memoryB').queue(`events-b:${lb.id}`)

    assert.deepEqual(await queueA.length(), 0)
    assert.deepEqual(await queueB.length(), 0)
  }

  @Test()
  public async shouldBeAbleToAwaitOnceListener({ assert }: Context) {
    const event = Event.store('memoryA')

    const oncePromise = event.once<{ id: number }>('new:user')

    await event.emit('new:user', { id: 10 })

    const user = await oncePromise

    assert.deepEqual(user, { id: 10 })
  }

  @Test()
  public async shouldBeAbleToListListenersAndRemoveById({ assert }: Context) {
    const event = Event.store('memoryA')

    let a = 0
    let b = 0

    const la = event.on('remove:test', () => a++)
    const lb = event.on('remove:test', () => b++)

    const listeners = event.getListeners().filter(l => l.event === 'remove:test')

    assert.isTrue(listeners.length >= 2)

    event.removeListenerById(la.id)

    await event.emit('remove:test', {})
    await Sleep.for(30).milliseconds().wait()

    assert.deepEqual(a, 0)
    assert.deepEqual(b, 1)

    lb.remove()
  }

  @Test()
  public async shouldRetryAndSendToDeadletterWhenListenerFails({ assert }: Context) {
    const event = Event.store('memoryA')

    const listener = event.on('process:fail', () => {
      throw new Error('fail')
    })

    await event.emit('process:fail', { ok: false })

    await Sleep.for(80).milliseconds().wait()

    const main = Queue.connection('memoryA').queue(`events-a:${listener.id}`)
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')

    assert.deepEqual(await main.length(), 0)
    assert.deepEqual(await dlq.length(), 1)
  }

  @Test()
  public async shouldBeAbleToRegisterOnAnyAndReceiveAllEvents({ assert }: Context) {
    const event = Event.store('memoryA')

    let anyCalls = 0
    let eventCalls = 0

    event.onAny(ctx => {
      anyCalls++
      assert.isDefined(ctx.event)
      assert.isDefined(ctx.emittedAt)
    })

    event.on('new:user', ctx => {
      eventCalls++
      assert.deepEqual(ctx.data, { id: 1 })
    })

    await event.emit('new:user', { id: 1 })
    await Sleep.for(40).milliseconds().wait()

    assert.equal(anyCalls, 1)
    assert.equal(eventCalls, 1)
  }

  @Test()
  public async shouldBeAbleToRemoveListenerUsingRemoveListenerMethod({ assert }: Context) {
    const event = Event.store('memoryA')

    let a = 0
    let b = 0

    const closureA = () => a++
    const closureB = () => b++

    event.on('remove:by:method', closureA)
    event.on('remove:by:method', closureB)

    event.removeListener('remove:by:method', closureA)

    await event.emit('remove:by:method', {})
    await Sleep.for(40).milliseconds().wait()

    assert.equal(a, 0)
    assert.equal(b, 1)
  }

  @Test()
  public async shouldBeAbleToRemoveAnyListenerUsingRemoveAnyListenerMethod({ assert }: Context) {
    const event = Event.store('memoryA')

    let any1 = 0
    let any2 = 0

    const closure1 = () => any1++
    const closure2 = () => any2++

    event.onAny(closure1)
    event.onAny(closure2)

    event.removeAnyListener(closure1)

    await event.emit('any:remove', {})
    await Sleep.for(40).milliseconds().wait()

    assert.equal(any1, 0)
    assert.equal(any2, 1)
  }

  @Test()
  public async shouldNotThrowWhenRemovingListenerByIdThatDoesNotExist({ assert }: Context) {
    const event = Event.store('memoryA')

    await assert.doesNotReject(() => Promise.resolve(event.removeListenerById('not-found-id')))
  }

  @Test()
  public async shouldBeAbleToRemoveAnyListenerById({ assert }: Context) {
    const event = Event.store('memoryA')

    let calls = 0

    const anyListener = event.onAny(() => calls++)

    event.removeListenerById(anyListener.id)

    await event.emit('any:id:remove', {})
    await Sleep.for(40).milliseconds().wait()

    assert.equal(calls, 0)
  }

  @Test()
  public async shouldBeAbleToClearAllListenersForSpecificEventOnly({ assert }: Context) {
    const event = Event.store('memoryA')

    let a = 0
    let b = 0
    let any = 0

    event.on('clear:event', () => a++)
    event.on('keep:event', () => b++)
    event.onAny(() => any++)

    event.clearListeners('clear:event')

    await event.emit('clear:event', {})
    await event.emit('keep:event', {})
    await Sleep.for(60).milliseconds().wait()

    assert.equal(a, 0)
    assert.equal(b, 1)
    assert.equal(any, 2)
  }

  @Test()
  public async shouldBeAbleToCountListenersForSpecificEvent({ assert }: Context) {
    const event = Event.store('memoryA')

    function listenerA() {}
    function listenerB() {}
    function otherListener() {}
    function anyListener() {}

    event.on('count:event', listenerA)
    event.on('count:event', listenerB)
    event.on('other:event', otherListener)
    event.onAny(anyListener)

    assert.equal(event.listenerCount('count:event'), 2)
    assert.equal(event.listenerCount('other:event'), 1)
  }

  @Test()
  public async shouldRegisterAndEmitToMultipleNamedListenersOnTheSameEvent({ assert }: Context) {
    const event = Event.store('memoryA')

    let webhookCalls = 0
    let profileCalls = 0

    ioc.bind(
      'WebhookNamedListener',
      class {
        public async handle() {
          webhookCalls++
        }
      }
    )
    ioc.bind(
      'ProfileNamedListener',
      class {
        public async handle() {
          profileCalls++
        }
      }
    )

    event.on('named:event', 'WebhookNamedListener')
    event.on('named:event', 'ProfileNamedListener')

    /**
     * Named listeners share the same wrapper closure, so their ids must be
     * derived from the listener name. Otherwise the second registration
     * overwrites the first and only one of them ever runs.
     */
    assert.equal(event.listenerCount('named:event'), 2)

    await event.emit('named:event', { ok: true })
    await Sleep.for(40).milliseconds().wait()

    assert.equal(webhookCalls, 1)
    assert.equal(profileCalls, 1)
  }

  @Test()
  public async shouldEmitForAnyListenersAndSpecificListeners({ assert }: Context) {
    const event = Event.store('memoryA')

    let any = 0
    let specific = 0

    event.onAny(() => any++)
    event.on('emit:any', () => specific++)

    await event.emit('emit:any', { ok: true })
    await Sleep.for(40).milliseconds().wait()

    assert.equal(any, 1)
    assert.equal(specific, 1)
  }

  @Test()
  public async shouldRunQueuedListenersThroughOtelContextWrapper({ assert }: Context) {
    const event = Event.store('memoryA') as any
    const originalRunWithOtelContext = event.runWithOtelContext?.bind(event)
    let wrappedCtx: any = null
    let closureCtx: any = null

    event.runWithOtelContext = (ctx, callback) => {
      wrappedCtx = ctx

      return callback()
    }

    try {
      event.on('otel:event', ctx => {
        closureCtx = ctx
      })

      await event.emit('otel:event', { ok: true })
      await Sleep.for(40).milliseconds().wait()
    } finally {
      event.runWithOtelContext = originalRunWithOtelContext
    }

    assert.isDefined(wrappedCtx)
    assert.deepEqual(wrappedCtx, closureCtx)
    assert.equal(wrappedCtx.event, 'otel:event')
    assert.deepEqual(wrappedCtx.data, { ok: true })
  }

  @Test()
  public async shouldNotAckAndShouldLeaveForRedeliveryWhenListenerIdIsUnknown({ assert }: Context) {
    const event = Event.store('memoryA')

    /**
     * Registering a listener boots the consumer for this connection. The job
     * we inject below carries a listenerId that this instance does not own,
     * simulating a zombie / version-skew / foreign-consumer message.
     */
    event.on('keep:consumer:alive', () => {})

    const main = Queue.connection('memoryA').queue('events-a')

    await main.add({
      listenerId: 'unknown-foreign-listener-id',
      event: 'foreign:event',
      data: { foreign: true },
      emittedAt: Date.now()
    })

    await Sleep.for(40).milliseconds().wait()

    /**
     * Before Fix A the consumer acked unknown ids and the queue drained to 0,
     * silently destroying events it could not handle. The message must survive
     * for redelivery so a consumer that owns the listener can process it.
     */
    assert.deepEqual(await main.length(), 1)
  }

  @Test()
  public async shouldHaltTheConsumerLoopWhenClosingAllConsumers({ assert }: Context) {
    const event = Event.store('memoryA') as any

    event.on('halt:loop', () => {})

    const connection = event.queue.connectionName
    const state = event.consumers.get(connection)

    assert.isTrue(state.running)

    event.closeAllConsumers()

    /**
     * Fix B flips running to false so an in-flight loop() does not reschedule
     * itself into a zombie consumer after the timers are cleared.
     */
    assert.isFalse(state.running)
    assert.equal(event.consumerCount(), 0)
  }

  @Test()
  public async shouldRunASingleSerialConsumerLoopByDefault({ assert }: Context) {
    const event = Event.store('memoryA') as any

    event.on('serial:loop', () => {})

    const state = event.consumers.get(event.queue.connectionName)

    assert.lengthOf(state.timers, 1)
  }

  @Test()
  public async shouldFallBackToASingleLoopWhenWorkerConcurrencyIsZeroOrNull({ assert }: Context) {
    Config.set('queue.connections.memoryA.workerConcurrency', 0)

    const zero = Event.store('memoryA') as any

    zero.on('zero:loop', () => {})

    assert.lengthOf(zero.consumers.get(zero.queue.connectionName).timers, 1)

    Config.set('queue.connections.memoryB.workerConcurrency', null)

    const nil = Event.store('memoryB') as any

    nil.on('null:loop', () => {})

    assert.lengthOf(nil.consumers.get(nil.queue.connectionName).timers, 1)
  }

  @Test()
  public async shouldRunMultipleConsumerLoopsWhenWorkerConcurrencyIsSet({ assert }: Context) {
    const event = Event.store('memoryConcurrent') as any

    event.on('concurrent:loop', () => {})

    const state = event.consumers.get(event.queue.connectionName)

    assert.lengthOf(state.timers, 3)
  }

  @Test()
  public async shouldDrainTheQueueFasterWithWorkerConcurrency({ assert }: Context) {
    const event = Event.store('memoryConcurrent')

    let inFlight = 0
    let maxInFlight = 0

    const listener = event.on('concurrent:drain', async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Sleep.for(20).milliseconds().wait()
      inFlight--
    })

    await event.emit('concurrent:drain', { n: 1 })
    await event.emit('concurrent:drain', { n: 2 })
    await event.emit('concurrent:drain', { n: 3 })

    await Sleep.for(60).milliseconds().wait()

    /**
     * With three parallel consumer loops the three jobs are picked up and run
     * at the same time, so more than one handler is in flight simultaneously —
     * impossible with the single serial loop of the default configuration.
     */
    assert.isAbove(maxInFlight, 1)

    const main = Queue.connection('memoryConcurrent').queue(`events-concurrent:${listener.id}`)

    assert.deepEqual(await main.length(), 0)
  }

  @Test()
  public async shouldBeAbleToEmitSequentially({ assert }: Context) {
    const event = Event.store('memoryA')

    let calls = 0

    event.on('emit:seq', () => calls++)

    await event.emitSequentially('emit:seq', { seq: true })
    await Sleep.for(40).milliseconds().wait()

    assert.equal(calls, 1)
  }
}
