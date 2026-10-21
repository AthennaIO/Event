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
import { LlmListener } from '#tests/fixtures/listeners/LlmListener'
import { InjectedListener } from '#tests/fixtures/listeners/InjectedListener'
import { ViaMethodsListener } from '#tests/fixtures/listeners/ViaMethodsListener'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'

export class ListenerConnectionsTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    await new LoggerProvider().register()
    await new QueueProvider().register()
    await new EventProvider().register()

    LlmListener.runs = []
    ViaMethodsListener.runs = []
    InjectedListener.runs = []
    InjectedListener.constructed = 0
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
  public async shouldStoreAndConsumeTheJobsOfAListenerInItsOwnConnection({ assert }: Context) {
    const event = Event.store('memoryA') as any
    const runs = []

    const listener = event.on('connection:own', ctx => runs.push(ctx), { connection: 'memoryLlm', delay: 40 })

    await event.emit('connection:own', { id: 1 })
    await Sleep.for(10).milliseconds().wait()

    assert.isTrue(event.consumers.has('memoryLlm'))
    assert.deepEqual(await Queue.connection('memoryLlm').queue(`events-llm:${listener.id}`).length(), 1)
    assert.deepEqual(await Queue.connection('memoryA').queue(`events-a:${listener.id}`).length(), 0)

    await Sleep.for(80).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.deepEqual(await Queue.connection('memoryLlm').queue(`events-llm:${listener.id}`).length(), 0)
  }

  @Test()
  public async shouldUseTheConnectionOfTheListenerAnnotation({ assert }: Context) {
    ioc.bind('LlmListener', LlmListener)

    const event = Event.store('memoryA') as any

    event.on('connection:annotation', 'LlmListener')

    assert.deepInclude(event.routeOf(event.getListeners()[0]), {
      connection: 'memoryLlm',
      queue: 'events-llm:LlmListener'
    })

    await event.emit('connection:annotation', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(LlmListener.runs, 1)
  }

  @Test()
  public async shouldPreferTheViaConnectionAndViaQueueMethodsOfTheListener({ assert }: Context) {
    ioc.bind('ViaMethodsListener', ViaMethodsListener)

    const event = Event.store('memoryA') as any

    /**
     * The methods win over the `Event.on()` options, that win over the
     * `@Listener({ connection: 'memoryB', queue: 'annotation-queue' })` of
     * the fixture.
     */
    event.on('connection:via', 'ViaMethodsListener', { connection: 'memoryA', queue: 'option-queue' })

    assert.deepEqual(event.routeOf(event.getListeners()[0]), {
      connection: 'memoryLlm',
      queue: 'via-method-queue'
    })

    await event.emit('connection:via', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(ViaMethodsListener.runs, 1)
    assert.deepEqual(await Queue.connection('memoryLlm').queue('via-method-queue').length(), 0)
  }

  @Test()
  public async shouldNeverConstructTheListenerWhenRegisteringOrEmitting({ assert }: Context) {
    ioc.bind('InjectedListener', InjectedListener)

    const event = Event.store('memoryA') as any

    /**
     * The constructor dependency is not registered yet, like a service
     * loaded after the providers. Registering and emitting must not resolve
     * the listener: only its `handle()` does, when the job runs.
     */
    event.on('injected:event', 'InjectedListener')

    assert.deepEqual(event.routeOf(event.getListeners()[0]), {
      connection: 'memoryLlm',
      queue: 'events-llm:InjectedListener'
    })

    await event.emit('injected:event', { delay: 30 })

    assert.equal(InjectedListener.constructed, 0)

    ioc.instance('notificationService', {})

    await Sleep.for(80).milliseconds().wait()

    assert.equal(InjectedListener.constructed, 1)
    assert.lengthOf(InjectedListener.runs, 1)
  }

  @Test()
  public async shouldPreferTheEventOnOptionsOverTheListenerAnnotation({ assert }: Context) {
    ioc.bind('LlmListener', LlmListener)

    const event = Event.store('memoryA') as any

    event.on('connection:override', 'LlmListener', { connection: 'memoryB', queue: 'override-queue' })

    assert.deepEqual(event.routeOf(event.getListeners()[0]), {
      connection: 'memoryB',
      queue: 'override-queue'
    })
  }

  @Test()
  public async shouldNotBlockFastListenersWhenASlowListenerUsesAnotherConnection({ assert }: Context) {
    const event = Event.store('memoryA')

    let slowDone = false
    let fastDone = false

    event.on(
      'connection:slow',
      async () => {
        await Sleep.for(150).milliseconds().wait()
        slowDone = true
      },
      { connection: 'memoryLlm' }
    )
    event.on('connection:slow', () => {
      fastDone = true
    })

    await event.emit('connection:slow', {})
    await event.emit('connection:slow', {})
    await Sleep.for(50).milliseconds().wait()

    assert.isTrue(fastDone)
    assert.isFalse(slowDone)

    await Sleep.for(300).milliseconds().wait()

    assert.isTrue(slowDone)
  }

  @Test()
  public async shouldRespectTheWorkerConcurrencyOfTheListenerConnection({ assert }: Context) {
    const event = Event.store('memoryA') as any

    event.on('connection:concurrency', () => {}, { connection: 'memoryConcurrent' })

    assert.lengthOf(event.consumers.get('memoryA').timers, 1)
    assert.lengthOf(event.consumers.get('memoryConcurrent').timers, 3)
  }

  @Test()
  public async shouldGiveEachListenerItsOwnQueueInMemoryAndDatabaseConnections({ assert }: Context) {
    ioc.bind('LlmListener', LlmListener)

    const event = Event.store('memoryA') as any

    const first = event.on('queue:own', () => 'first')
    const second = event.on('queue:own', () => 'second')

    event.on('queue:own', 'LlmListener', { connection: 'memoryA' })

    const queues = event.queuesOf('memoryA').map(queue => queue.driver.queueName)

    assert.deepEqual(queues, ['events-a', `events-a:${first.id}`, `events-a:${second.id}`, 'events-a:LlmListener'])
  }

  @Test()
  public async shouldShareTheQueueOfTheConnectionInDriversWithoutIsolatedQueues({ assert }: Context) {
    const event = Event.store('memoryA') as any

    const listener = event.on('queue:shared', () => {}, { connection: 'sqsLike' })

    const { connection, queue } = event.routeOf(listener)

    assert.equal(connection, 'sqsLike')
    assert.equal(queue, event.baseQueueNameOf('sqsLike'))
  }

  @Test()
  public async shouldUseTheQueueOptionAsIs({ assert }: Context) {
    const event = Event.store('memoryA')
    const runs = []

    event.on('queue:option', ctx => runs.push(ctx), { queue: 'events-a' })

    await event.emit('queue:option', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.deepEqual(await Queue.connection('memoryA').queue('events-a').length(), 0)
  }

  @Test()
  public async shouldKeepProcessingJobsStoredByOlderVersionsInTheQueueOfTheConnection({ assert }: Context) {
    const event = Event.store('memoryA')
    const runs = []

    const listener = event.on('legacy:job', ctx => runs.push(ctx))

    /**
     * Before per-listener queues, every job was stored in the queue of the
     * connection without `dueAt`.
     */
    const emittedAt = Date.now()

    await Queue.connection('memoryA')
      .queue('events-a')
      .add({
        listenerId: listener.id,
        event: 'legacy:job',
        data: { legacy: true },
        emittedAt
      })

    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.deepEqual(runs[0].data, { legacy: true })
    assert.equal(runs[0].dueAt, emittedAt)
    assert.deepEqual(await Queue.connection('memoryA').queue('events-a').length(), 0)
  }

  @Test()
  public async shouldNeverPullTheJobsOfAListenerThatThisInstanceDoesNotOwn({ assert }: Context) {
    const event = Event.store('memoryA')

    event.on('owned:event', () => {})

    /**
     * A job stored by another instance (a newer version, during a rolling
     * deploy) for a listener this instance does not have.
     */
    const foreign = Queue.connection('memoryA').queue('events-a:NewerVersionListener')

    await foreign.add({
      listenerId: 'newer-version-listener-id',
      event: 'owned:event',
      data: {},
      emittedAt: Date.now(),
      dueAt: Date.now()
    })

    await Sleep.for(40).milliseconds().wait()

    /**
     * The job was never popped: the attempts are intact. A consumer that
     * pulled and released it would have decremented them.
     */
    const job = await foreign.peek()

    assert.deepEqual(await foreign.length(), 1)
    assert.equal(job.attempts, 2)
  }
}
